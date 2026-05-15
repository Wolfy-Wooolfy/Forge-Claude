"use strict";

// Reverse-Vision Role — analyzes SourceTreeAnalysis and infers InferredVision.
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §4 (InferredVision schema)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §5 (Vision Lock Semantics)
// @see docs/10_runtime/18b_ROLE_PROMPTS.md (reverse_vision_v1)
//
// IMPORTANT: run() calls reverseVisionProvider.executeTask() DIRECTLY — not via
// agent.invoke — because this role runs before any vision exists, and agent.invoke
// triggers agent_budget_rule which rejects calls when vision is not locked.
// This bypass is intentional and documented in INTAKE_CONTRACT §5.

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

void loadPrompt("reverse_vision_v1");   // validates prompt id at registry load time

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
        ignored_paths:         { type: "array", items: { type: "string" } }
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
  system_prompt_id: "reverse_vision_v1",
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

    // Load provider directly (not via agent.invoke — see module header).
    const provider = require("../../../providers/reverseVisionProvider");

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "INVOKING_ADAPTER", indicator: getIndicator(this.id, "INVOKING_ADAPTER") }, { root });
    } catch (_e) { /* best-effort */ }

    let providerResult;
    try {
      providerResult = await provider.executeTask({
        task_id:    "rv_" + project_id + "_" + Date.now(),
        project_id: project_id,
        context: {
          schema_version: SCHEMA_VERSION,
          project_id:     project_id,
          source_tree:    input.source_tree,
          provider:       (ctx && ctx.provider) || this.default_provider,
          model:          (ctx && ctx.model)    || this.default_model
        }
      });
    } catch (err) {
      return roleFailed("PROVIDER_CALL_ERROR", err.message, ctx);
    }

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "PARSING_OUTPUT", indicator: getIndicator(this.id, "PARSING_OUTPUT") }, { root });
    } catch (_e) { /* best-effort */ }

    if (!providerResult || providerResult.status !== "SUCCESS") {
      const meta = (providerResult && providerResult.metadata) || {};
      return roleFailed(meta.reason || "PROVIDER_FAILED", meta.detail || null, ctx);
    }

    const ov = validate(providerResult.output, OUTPUT_SCHEMA);
    if (!ov.valid) return roleFailed("INVALID_ROLE_OUTPUT", ov.errors.join("; "), ctx);

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "VALIDATING_SCHEMA", indicator: getIndicator(this.id, "VALIDATING_SCHEMA") }, { root });
    } catch (_e) { /* best-effort */ }

    return roleOk(providerResult.output, {
      role:       this.id,
      model:      (providerResult.metadata && providerResult.metadata.model)      || this.default_model,
      tokens_in:  (providerResult.metadata && providerResult.metadata.tokens_in)  || 0,
      tokens_out: (providerResult.metadata && providerResult.metadata.tokens_out) || 0,
      latency_ms: (providerResult.metadata && providerResult.metadata.latency_ms) || 0,
      attempt:    (providerResult.metadata && providerResult.metadata.attempt)    || 1
    });
  }
});
