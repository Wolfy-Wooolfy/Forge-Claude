"use strict";

// ── Required adapter fields ───────────────────────────────────────────────────

const REQUIRED_ADAPTER_FIELDS = ["id", "label", "available", "invoke"];

// ── Input / Output validation ─────────────────────────────────────────────────

const VALID_PROVIDERS = ["anthropic", "openai", "claude_code", "aider", "mock"];

function validateInput(input) {
  if (!input || typeof input !== "object") return ["input must be an object"];
  const errs = [];
  if (typeof input.provider !== "string" || !VALID_PROVIDERS.includes(input.provider))
    errs.push("provider must be one of: " + VALID_PROVIDERS.join(", "));
  if (typeof input.model !== "string" || !input.model.trim())
    errs.push("model must be a non-empty string");
  if (typeof input.prompt !== "string")
    errs.push("prompt must be a string");
  if (typeof input.project_id !== "string" || !input.project_id.trim())
    errs.push("project_id must be a non-empty string");
  return errs;
}

function validateOutput(output) {
  if (!output || typeof output !== "object") return ["output must be an object"];
  const errs = [];
  if (typeof output.text !== "string")         errs.push("output.text must be a string");
  if (typeof output.tokens_in !== "number")    errs.push("output.tokens_in must be a number");
  if (typeof output.tokens_out !== "number")   errs.push("output.tokens_out must be a number");
  if (typeof output.latency_ms !== "number")   errs.push("output.latency_ms must be a number");
  if (typeof output.cost_usd !== "number")     errs.push("output.cost_usd must be a number");
  if (typeof output.provider !== "string")     errs.push("output.provider must be a string");
  if (typeof output.model !== "string")        errs.push("output.model must be a string");
  if (typeof output.finish_reason !== "string") errs.push("output.finish_reason must be a string");
  return errs;
}

// ── Envelope helpers (re-export from tool _contract conventions) ──────────────

function success(output, invocation_id, cached) {
  return {
    status:   "SUCCESS",
    output:   output,
    metadata: {
      invocation_id: invocation_id || null,
      cached:        cached === true
    }
  };
}

function failed(reason, detail, ctx) {
  return {
    status:   "FAILED",
    output:   null,
    metadata: { reason: reason || "FAILED", detail: detail || null, context: ctx || null }
  };
}

function denied(reason, detail, ctx) {
  return {
    status:   "DENIED",
    output:   null,
    metadata: { reason: reason || "DENIED", detail: detail || null, context: ctx || null }
  };
}

// ── defineAdapter ─────────────────────────────────────────────────────────────

function defineAdapter(spec) {
  if (!spec || typeof spec !== "object")
    throw new Error("adapter spec must be an object");

  for (const field of REQUIRED_ADAPTER_FIELDS) {
    if (spec[field] === undefined || spec[field] === null)
      throw new Error("adapter '" + (spec.id || "?") + "' missing required field: " + field);
  }

  if (typeof spec.id !== "string" || !spec.id.trim())
    throw new Error("adapter id must be a non-empty string");
  if (typeof spec.label !== "string" || !spec.label.trim())
    throw new Error("adapter label must be a non-empty string");
  if (typeof spec.available !== "function")
    throw new Error("adapter '" + spec.id + "' .available must be a function");
  if (typeof spec.invoke !== "function")
    throw new Error("adapter '" + spec.id + "' .invoke must be a function");

  return Object.freeze(Object.assign({}, spec));
}

// ── Per-provider cost rates (USD per 1K tokens) ───────────────────────────────

const PROVIDER_RATES = {
  anthropic:   { input: 0.003,   output: 0.015  },  // claude-opus-4-7 approximate
  openai:      { input: 0.005,   output: 0.015  },  // gpt-4-class approximate
  claude_code: { input: 0.003,   output: 0.015  },  // routes to claude
  aider:       { input: 0.003,   output: 0.015  },  // routes to underlying model
  mock:        { input: 0.0,     output: 0.0    }    // zero cost
};

function estimateCost(provider, promptLength, outputTokenMultiplier) {
  const rate = PROVIDER_RATES[provider] || PROVIDER_RATES.mock;
  const tokensIn  = Math.ceil(promptLength / 4);
  const tokensOut = Math.ceil(tokensIn * (outputTokenMultiplier || 2));
  const cost = (tokensIn / 1000) * rate.input + (tokensOut / 1000) * rate.output;
  return { estimated_usd: Math.round(cost * 10000) / 10000, tokens_in: tokensIn, tokens_out: tokensOut };
}

// ── JSON extraction — strips markdown fences from LLM text output ─────────────
// Applied in real adapters (anthropic, openai, claude_code, aider) before
// returning output.text. Protects against models that wrap JSON in ```json...```
// even when instructed not to. Pure function — no side effects.

function extractJsonFromResponse(rawText) {
  if (!rawText || typeof rawText !== "string") return rawText;
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?\s*```\s*$/, "");
  return cleaned.trim();
}

module.exports = {
  defineAdapter,
  validateInput,
  validateOutput,
  success,
  failed,
  denied,
  VALID_PROVIDERS,
  PROVIDER_RATES,
  estimateCost,
  extractJsonFromResponse
};
