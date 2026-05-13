"use strict";

const crypto = require("crypto");
const { defineTool, ok, failed, previewed } = require("./_contract");
const { pickAdapter, listAdapters, getAdapters } = require("../agents/_adapter_registry");
const { estimateCost }                            = require("../agents/_adapter_contract");
const ledger                                      = require("../agents/cost_ledger");

// ── Shared helpers ────────────────────────────────────────────────────────────

function _root(ctx) {
  return (ctx && ctx.root) || process.cwd();
}

// ── 1. agent.invoke ───────────────────────────────────────────────────────────

const tool_invoke = defineTool({
  name:          "agent.invoke",
  description:   "Invoke an LLM agent adapter. Vision must be locked for non-mock providers; budget enforced by agent_budget_rule.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      provider:   { type: "string" },
      model:      { type: "string" },
      prompt:     { type: "string" },
      context:    { type: "object" },
      budget_ms:  { type: "number" },
      budget_usd: { type: "number" },
      project_id: { type: "string" }
    },
    required: ["provider", "model", "prompt", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      text:          { type: "string" },
      tokens_in:     { type: "number" },
      tokens_out:    { type: "number" },
      latency_ms:    { type: "number" },
      cost_usd:      { type: "number" },
      provider:      { type: "string" },
      model:         { type: "string" },
      finish_reason: { type: "string" }
    },
    required: ["text", "tokens_in", "tokens_out", "latency_ms", "cost_usd", "provider", "model", "finish_reason"]
  },

  preview(input) {
    return Promise.resolve(previewed({
      operation:  "agent.invoke",
      provider:   input.provider,
      model:      input.model,
      project_id: input.project_id,
      prompt_len: input.prompt ? input.prompt.length : 0
    }));
  },

  async execute(input, ctx) {
    const adapter = pickAdapter(input.provider);
    if (!adapter) {
      return failed("PROVIDER_NOT_FOUND", "no adapter registered for provider '" + input.provider + "'", {});
    }

    const invocation_id  = crypto.randomUUID();
    const { estimated_usd } = estimateCost(input.provider, (input.prompt || "").length, 2);

    let result;
    let outcome = "success";
    const start = Date.now();

    try {
      result = await adapter.invoke(input);
    } catch (err) {
      outcome = "failed";
      const entry = {
        invocation_id,
        project_id:         input.project_id,
        provider:           input.provider,
        model:              input.model || "",
        role:               (ctx && ctx.role_id) || (input.context && input.context.role) || null,
        tokens_in:          0,
        tokens_out:         0,
        latency_ms:         Date.now() - start,
        cost_usd_estimated: estimated_usd,
        cost_usd_actual:    0,
        outcome
      };
      try { ledger.appendEntry(entry, { root: _root(ctx) }); } catch { /* ledger failure non-fatal */ }
      return failed("INVOKE_FAILED", err.message, {});
    }

    // Map adapter result to ledger entry
    const isSuccess = result && result.status === "SUCCESS" && result.output;
    const out       = isSuccess ? result.output : null;

    if (!isSuccess) outcome = "failed";

    const ledgerEntry = {
      invocation_id,
      project_id:         input.project_id,
      provider:           input.provider,
      model:              (out && out.model) || input.model || "",
      role:               (ctx && ctx.role_id) || (input.context && input.context.role) || null,
      tokens_in:          (out && out.tokens_in)  || 0,
      tokens_out:         (out && out.tokens_out) || 0,
      latency_ms:         (out && out.latency_ms) || (Date.now() - start),
      cost_usd_estimated: estimated_usd,
      cost_usd_actual:    (out && out.cost_usd)   || 0,
      outcome
    };

    try { ledger.appendEntry(ledgerEntry, { root: _root(ctx) }); } catch { /* non-fatal */ }

    if (!isSuccess) return result;

    // Attach invocation_id to metadata
    return {
      status:   "SUCCESS",
      output:   out,
      metadata: { invocation_id, cached: false }
    };
  }
});

// ── 2. agent.list_available ───────────────────────────────────────────────────

const tool_list_available = defineTool({
  name:          "agent.list_available",
  description:   "List all registered agent adapters and their availability (READ_ONLY).",
  required_mode: "READ_ONLY",
  is_read_only:  true,
  input_schema: {
    type:       "object",
    properties: {},
    required:   []
  },
  output_schema: {
    type: "object",
    properties: {
      providers: { type: "array" }
    },
    required: ["providers"]
  },

  async execute(input, ctx) {
    const adapters   = getAdapters();
    const providers  = [];

    for (const [name, adapter] of adapters) {
      let available = false;
      let reason    = null;
      try {
        available = await adapter.available();
        if (!available) {
          if (name === "anthropic")   reason = "ANTHROPIC_API_KEY not set";
          else if (name === "openai") reason = "OPENAI_API_KEY not set";
          else                        reason = "binary not found or unavailable";
        }
      } catch (err) {
        reason = "availability check failed: " + err.message;
      }
      providers.push({
        name,
        label:     adapter.label || name,
        available,
        reason
      });
    }

    return ok({ providers });
  }
});

// ── 3. agent.estimate_cost ────────────────────────────────────────────────────

const tool_estimate_cost = defineTool({
  name:          "agent.estimate_cost",
  description:   "Heuristic cost estimate for an agent invocation before calling (READ_ONLY).",
  required_mode: "READ_ONLY",
  is_read_only:  true,
  input_schema: {
    type: "object",
    properties: {
      provider:         { type: "string" },
      prompt:           { type: "string" },
      output_multiplier: { type: "number" }
    },
    required: ["provider", "prompt"]
  },
  output_schema: {
    type: "object",
    properties: {
      estimated_usd: { type: "number" },
      tokens_in:     { type: "number" },
      tokens_out:    { type: "number" },
      confidence:    { type: "string" }
    },
    required: ["estimated_usd", "confidence"]
  },

  async execute(input) {
    const mult   = typeof input.output_multiplier === "number" ? input.output_multiplier : 2;
    const { estimated_usd, tokens_in, tokens_out } = estimateCost(input.provider, (input.prompt || "").length, mult);
    return ok({
      estimated_usd,
      tokens_in,
      tokens_out,
      confidence: "low"
    });
  }
});

// ── 4. agent.read_ledger ──────────────────────────────────────────────────────

const tool_read_ledger = defineTool({
  name:          "agent.read_ledger",
  description:   "Read cost ledger entries for a project (READ_ONLY). Returns JSONL-parsed entries.",
  required_mode: "READ_ONLY",
  is_read_only:  true,
  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      provider:   { type: "string" },
      since:      { type: "string" }
    },
    required: ["project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      entries:    { type: "array" },
      total_cost: { type: "number" },
      count:      { type: "number" }
    },
    required: ["entries", "total_cost", "count"]
  },

  async execute(input, ctx) {
    const filter = { project_id: input.project_id };
    if (input.provider) filter.provider = input.provider;
    if (input.since)    filter.since    = input.since;

    let entries;
    try {
      entries = ledger.readEntries(filter, { root: _root(ctx) });
    } catch (err) {
      return failed("LEDGER_READ_FAILED", err.message, {});
    }

    let total_cost = 0;
    for (const e of entries) {
      total_cost += typeof e.cost_usd_actual === "number" ? e.cost_usd_actual : 0;
    }

    return ok({
      entries,
      total_cost: Math.round(total_cost * 100000) / 100000,
      count:      entries.length
    });
  }
});

// ── Export: 4 tools ───────────────────────────────────────────────────────────

module.exports = {
  tools: [
    tool_invoke,
    tool_list_available,
    tool_estimate_cost,
    tool_read_ledger
  ]
};
