"use strict";

// Intake L2 tools — source ingestion and analysis for existing project intake.
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §2 (Intake Flow)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §3 (SourceTreeAnalysis schema)
//
// STAGE_11_0_STUB: execute() throws — full implementation in Stage 11.1.

const { defineTool, ok, failed, previewed } = require("./_contract");

// ── 1. project.intake_zip ─────────────────────────────────────────────────────
// Extracts a ZIP or copies a directory into artifacts/projects/<project_id>/source/.
// Input accepts exactly one of: { zip_path } or { directory_path } (mutually exclusive).

const intake_zip = defineTool({
  name:          "project.intake_zip",
  description:   "Extract a ZIP archive or copy a local directory into the project source tree at artifacts/projects/<project_id>/source/.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    required: ["project_id"],
    properties: {
      project_id:     { type: "string", minLength: 1 },
      zip_path:       { type: "string" },
      directory_path: { type: "string" }
    }
  },
  output_schema: {
    type: "object",
    required: ["extracted_path", "file_count"],
    properties: {
      extracted_path: { type: "string" },
      file_count:     { type: "number" }
    }
  },
  preview(input) {
    const source = input.zip_path
      ? "zip: " + input.zip_path
      : input.directory_path
        ? "directory: " + input.directory_path
        : "(no source specified)";
    return Promise.resolve(previewed(null, {
      would_extract: true,
      project_id:    input.project_id,
      source
    }));
  },
  async execute(input, ctx) {
    // Input validation (fail-closed per §9):
    // Both variants provided → AMBIGUOUS_INPUT
    // Neither variant provided → MISSING_SOURCE_INPUT
    if (input.zip_path && input.directory_path) {
      return failed("AMBIGUOUS_INPUT", "provide zip_path OR directory_path, not both");
    }
    if (!input.zip_path && !input.directory_path) {
      return failed("MISSING_SOURCE_INPUT", "provide zip_path or directory_path");
    }

    void ctx;
    // STAGE_11_0_STUB — full implementation in Stage 11.1:
    // ZIP path: use adm-zip to extract to artifacts/projects/<id>/source/
    // Directory path: copy directory tree (respecting ignore rules) to target
    // Return: { extracted_path, file_count }
    throw new Error("STAGE_11_0_STUB: project.intake_zip not yet implemented");
  }
});

// ── 2. project.analyze_source ─────────────────────────────────────────────────
// Analyzes the extracted source tree and returns a SourceTreeAnalysis (§3).
// Uses web-tree-sitter WASM grammars from artifacts/vendor/tree-sitter-grammars/.

const analyze_source = defineTool({
  name:          "project.analyze_source",
  description:   "Analyze the source tree at artifacts/projects/<project_id>/source/ and return a SourceTreeAnalysis with detected languages, entry points, manifest files, and AST samples.",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    required: ["project_id"],
    properties: {
      project_id: { type: "string", minLength: 1 }
    }
  },
  output_schema: {
    type: "object",
    required: ["project_id", "analyzed_at", "detected_languages", "file_count"],
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
  async execute(input, ctx) {
    void ctx;
    // STAGE_11_0_STUB — full implementation in Stage 11.1:
    // 1. Walk artifacts/projects/<id>/source/ respecting .gitignore via 'ignore' package
    // 2. Detect languages by file extension
    // 3. Check for unsupported language → return failed("UNSUPPORTED_LANGUAGE", ...)
    // 4. Check for empty project → return failed("EMPTY_PROJECT", ...)
    // 5. Parse manifest files (package.json, requirements.txt, go.mod, pyproject.toml)
    // 6. Load python.wasm via _getLanguage() cached Promise, parse AST samples
    // 7. Return ok(SourceTreeAnalysis)
    void input;
    throw new Error("STAGE_11_0_STUB: project.analyze_source not yet implemented");
  }
});

module.exports = [intake_zip, analyze_source];
