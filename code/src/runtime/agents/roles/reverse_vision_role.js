"use strict";

// Reverse-Vision Role — analyzes SourceTreeAnalysis and infers InferredVision.
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §4 (InferredVision schema)
// @see docs/10_runtime/18b_ROLE_PROMPTS.md (reverse_vision_v1)
//
// STAGE_11_0_STUB: run() throws — full implementation in Stage 11.1.
// Activity indicators deferred to Stage 11.1 (OQ-4).
// WASM lazy-init pattern documented in OQ-6/OQ-7.

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { loadPrompt }                     = require("../_prompt_loader");

const SYSTEM_PROMPT  = loadPrompt("reverse_vision_v1");
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
// Must match output_tool.parameters in reverseVisionProvider.js exactly.

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
    void SYSTEM_PROMPT;  // loaded at module level — ensures prompt registry validates the id
    void SCHEMA_VERSION;

    // STAGE_11_0_STUB — full implementation in Stage 11.1:
    // 1. Load python.wasm via module-level cached Promise (OQ-6/OQ-7)
    // 2. Verify WASM SHA256 against MANIFEST.json (§8)
    // 3. Parse AST samples for top-level symbols
    // 4. Call reverse_vision provider via reg.invoke("agent.invoke")
    // 5. Validate output against OUTPUT_SCHEMA
    // 6. Return roleOk(inferred_vision)
    //
    // Activity indicators (PARSING_OUTPUT, VALIDATING_SCHEMA) added in Stage 11.1 (OQ-4).
    // Stub uses best-effort try/catch no-ops consistent with existing pattern.

    void input;
    void ctx;
    throw new Error("STAGE_11_0_STUB: reverse_vision_role not yet implemented");
  }
});
