"use strict";

// Reverse-vision provider — analyzes SourceTreeAnalysis and infers a vision.md structure.
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §4 (InferredVision schema)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §8 (Vendored Binaries Policy)
//
// STAGE_11_0_STUB: execute() throws — full implementation in Stage 11.1.

const { defineProvider } = require("./_contract/providerContract");

// ── Input Schema ──────────────────────────────────────────────────────────────
// Receives the SourceTreeAnalysis from project.analyze_source (§3).

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
        project_id:             { type: "string" },
        analyzed_at:            { type: "string" },
        root_path:              { type: "string" },
        detected_languages:     { type: "array", items: { type: "string" } },
        file_count:             { type: "number" },
        total_size_bytes:       { type: "number" },
        entry_points:           { type: "array", items: { type: "string" } },
        manifest_files:         { type: "object" },
        top_level_directories:  { type: "array", items: { type: "string" } },
        ast_samples:            { type: "array" },
        ignored_paths:          { type: "array", items: { type: "string" } }
      }
    },
    provider: { type: "string" },
    model:    { type: "string" }
  }
};

// ── Output Tool — InferredVision (§4) ────────────────────────────────────────
// Parameters must match visionSchema.js fields (project_name, domain, goals,
// constraints, non_goals) plus reverse-vision-specific analysis fields.

const OUTPUT_TOOL = {
  name: "inferred_vision",
  parameters: {
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
  }
};

// ── Provider Definition ───────────────────────────────────────────────────────

module.exports = defineProvider(
  {
    id:            "reverse_vision",
    version:       "1.0.0",
    authority_doc: "docs/10_runtime/20_INTAKE_CONTRACT.md",
    required_capabilities: ["function_calling"],
    input_schema:  INPUT_SCHEMA,
    output_tool:   OUTPUT_TOOL,
    fail_mode:     "FAIL_CLOSED"
  },
  async function handler({ context }) {
    // STAGE_11_0_STUB — full Python AST analysis implemented in Stage 11.1.
    // When implemented: load python.wasm via _getLanguage(), parse source files,
    // extract symbols, infer vision fields, call LLM for synthesis.
    throw new Error("STAGE_11_0_STUB: reverseVisionProvider not yet implemented");
  }
);
