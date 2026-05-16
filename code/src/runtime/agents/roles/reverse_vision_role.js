"use strict";

// Reverse-Vision Role — thin dispatcher to reverseVisionProvider.
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §4 (InferredVision schema)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §5 (Vision Lock Semantics + reverse_vision exemption)
// @see docs/10_runtime/18b_ROLE_PROMPTS.md (reverse_vision_v2)
//
// Both mock and real invocations route through reverseVisionProvider via
// agent.invoke { provider_id: "reverse_vision" }. The provider handles the
// mock branch internally (see reverseVisionProvider.js mock branch comment).

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

const SCHEMA_VERSION = "1.0.0";

// ── Input Schema ──────────────────────────────────────────────────────────────

const INPUT_SCHEMA = {
  type: "object",
  required: ["schema_version", "project_id", "source_tree"],
  properties: {
    schema_version: { type: "string" },
    project_id:     { type: "string", minLength: 1 },
    source_tree: {
      type: "object",
      required: ["detected_languages", "file_count"],
      properties: {
        project_id:            { type: "string" },
        analyzed_at:           { type: "string" },
        root_path:             { type: "string" },
        detected_languages:    { type: "array", items: { type: "string" } },
        file_count:            { type: "number" },
        total_size_bytes:      { type: "number" },
        entry_points:          { type: "array", items: { type: "string" } },
        manifest_files:        { type: "object" },
        top_level_directories: { type: "array", items: { type: "string" } },
        ast_samples:           { type: "array" },
        ignored_paths:         { type: "array", items: { type: "string" } },
        detected_framework:    { type: ["string", "null"] }
      }
    },
    provider: { type: "string" },
    model:    { type: "string" }
  }
};

// ── Output Schema — InferredVision (§4) ───────────────────────────────────────

const OUTPUT_SCHEMA = {
  type: "object",
  required: [
    "project_name",
    "domain",
    "goals",
    "constraints",
    "non_goals",
    "detected_languages",
    "source_summary",
    "confidence"
  ],
  properties: {
    project_name: { type: "string", minLength: 1 },
    domain:       { type: "string" },
    goals: {
      type: "object",
      required: ["primary", "secondary"],
      properties: {
        primary:   { type: "string", minLength: 1 },
        secondary: { type: "array", items: { type: "string" } }
      }
    },
    constraints:        { type: "array", items: { type: "string" } },
    non_goals:          { type: "array", items: { type: "string" } },
    detected_languages: { type: "array", items: { type: "string" } },
    source_summary:     { type: "string", minLength: 1 },
    confidence:         { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }
  }
};

// ── Role Definition ───────────────────────────────────────────────────────────

module.exports = defineRole({
  id:               "reverse_vision",
  label:            "Reverse Vision",
  description:      "Analyzes an existing codebase SourceTreeAnalysis and infers a structured InferredVision for owner review",
  default_provider: "openai",
  default_model:    "gpt-4o",
  system_prompt_id: "reverse_vision_v2",
  input_schema:     INPUT_SCHEMA,
  output_schema:    OUTPUT_SCHEMA,
  authority_level:  "ADVISORY",
  typical_cost_usd_min: 0.01,
  typical_cost_usd_max: 0.10,

  async run(input, ctx) {
    const iv = validate(input, INPUT_SCHEMA);
    if (!iv.valid) return roleFailed("INVALID_INPUT", iv.errors.join("; "), ctx);

    const project_id    = input.project_id;
    const invocation_id = (ctx && ctx.invocation_id) || null;
    const root          = (ctx && ctx.root)          || process.cwd();
    const provider      = input.provider || (ctx && ctx.provider) || this.default_provider;
    const model         = input.model    || (ctx && ctx.model)    || this.default_model;

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "INVOKING_ADAPTER", indicator: getIndicator(this.id, "INVOKING_ADAPTER") }, { root });
    } catch (_e) { /* best-effort */ }

    let agentResult;
    try {
      const reg = require("../../tools/_registry").getDefaultRegistry();
      agentResult = await reg.invoke(
        "agent.invoke",
        {
          provider,
          model,
          prompt:      "",
          project_id,
          provider_id: "reverse_vision",
          task_input: Object.assign(
            { schema_version: SCHEMA_VERSION, project_id, source_tree: input.source_tree, provider, model },
            (ctx && ctx.scenario_id) ? { scenario_id: ctx.scenario_id } : {}
          ),
          context: { role: this.id }
        },
        { root, role_id: this.id }
      );
    } catch (err) {
      return roleFailed("AGENT_INVOKE_ERROR", err.message, ctx);
    }

    if (!agentResult || agentResult.status !== "SUCCESS") {
      const detail = agentResult && agentResult.metadata && agentResult.metadata.detail;
      return roleFailed("AGENT_FAILED", detail || "agent.invoke returned non-SUCCESS", ctx);
    }

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "PARSING_OUTPUT", indicator: getIndicator(this.id, "PARSING_OUTPUT") }, { root });
    } catch (_e) { /* best-effort */ }

    let parsed;
    try {
      parsed = JSON.parse(agentResult.output.text);
    } catch (e) {
      return roleFailed("INVALID_ROLE_OUTPUT", "JSON parse failed: " + e.message, ctx);
    }

    const ov = validate(parsed, OUTPUT_SCHEMA);
    if (!ov.valid) return roleFailed("INVALID_ROLE_OUTPUT", ov.errors.join("; "), ctx);

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "VALIDATING_SCHEMA", indicator: getIndicator(this.id, "VALIDATING_SCHEMA") }, { root });
    } catch (_e) { /* best-effort */ }

    return roleOk(parsed, {
      role:       this.id,
      model,
      provider,
      tokens_in:  (agentResult.output && agentResult.output.tokens_in)  || 0,
      tokens_out: (agentResult.output && agentResult.output.tokens_out) || 0,
      latency_ms: (agentResult.output && agentResult.output.latency_ms) || 0
    });
  }
});
