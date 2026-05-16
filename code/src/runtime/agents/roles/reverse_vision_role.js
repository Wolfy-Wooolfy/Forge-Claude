"use strict";

// Reverse-Vision Role — analyzes SourceTreeAnalysis and infers InferredVision.
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §4 (InferredVision schema)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §5 (Vision Lock Semantics + reverse_vision exemption)
// @see docs/10_runtime/18b_ROLE_PROMPTS.md (reverse_vision_v2)

const { defineRole, roleOk, roleFailed } = require("../_role_contract");
const { validate }                        = require("../_json_schema_validator");
const { loadPrompt }                      = require("../_prompt_loader");
const { emit: emitActivity }             = require("../_activity_emitter");
const { getIndicator }                   = require("../_activity_catalog");

const SYSTEM_PROMPT = loadPrompt("reverse_vision_v2");

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

// ── Prompt builder (mock path only — real path routes through reverseVisionProvider) ──────────

function _buildPrompt(projectId, st, scenarioTag) {
  const lines = [];
  lines.push("reverse_vision|" + projectId);
  if (scenarioTag) lines.push(scenarioTag);
  lines.push(SYSTEM_PROMPT);
  lines.push("\n---");
  lines.push("SOURCE TREE:");
  lines.push("PROJECT: " + projectId);
  lines.push("FILES: " + (st.file_count || 0) + " | SIZE: " + (st.total_size_bytes || 0) + " bytes");
  lines.push("LANGUAGES: " + (st.detected_languages || []).join(", "));
  if (st.detected_framework) lines.push("FRAMEWORK: " + st.detected_framework);

  if (st.entry_points && st.entry_points.length > 0) {
    lines.push("ENTRY POINTS: " + st.entry_points.join(", "));
  }
  if (st.top_level_directories && st.top_level_directories.length > 0) {
    lines.push("TOP-LEVEL DIRS: " + st.top_level_directories.join(", "));
  }

  const mf = st.manifest_files || {};
  if (Object.keys(mf).length > 0) {
    lines.push("\nMANIFESTS:");
    if (mf.pyproject_toml) {
      const p = mf.pyproject_toml;
      lines.push("  pyproject.toml: name=" + (p.name || "?") +
        " version=" + (p.version || "?") +
        (p.description ? " desc=" + p.description : ""));
    }
    if (mf.requirements_txt && mf.requirements_txt.length > 0) {
      lines.push("  requirements.txt: " + mf.requirements_txt.slice(0, 10).join(", "));
    }
    if (mf.readme_excerpt) {
      lines.push("  README (excerpt): " + mf.readme_excerpt.slice(0, 300).replace(/\n/g, " "));
    }
    if (mf.package_json) {
      const p = mf.package_json;
      lines.push("  package.json: name=" + (p.name || "?") +
        " version=" + (p.version || "?") +
        (p.description ? " desc=" + p.description : ""));
      const deps = Object.keys(p.dependencies || {}).slice(0, 10).join(", ");
      if (deps) lines.push("    deps: " + deps);
    }
    if (mf.tsconfig) {
      const t = mf.tsconfig;
      lines.push("  tsconfig.json: target=" + (t.target || "?") +
        " module=" + (t.module || "?") +
        (t.jsx ? " jsx=" + t.jsx : "") +
        (t.strict !== undefined ? " strict=" + t.strict : ""));
    }
    if (mf.next_config) {
      lines.push("  next.config: present (" + (mf.next_config.file || "?") + ")");
    }
  }

  const samples = st.ast_samples || [];
  if (samples.length > 0) {
    lines.push("\nSOURCE FILES (AST samples):");
    for (const s of samples.slice(0, 20)) {
      const syms = (s.top_level_symbols || []).join(", ");
      lines.push("  " + s.file + " [" + (s.loc || "?") + " LOC]" +
        (syms ? " — " + syms : ""));
    }
  }

  lines.push("\nRESPOND WITH VALID JSON ONLY.");
  return lines.join("\n");
}

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

    const scenarioTag = (ctx && ctx.scenario_id)
      ? "SCENARIO_TAG: " + ctx.scenario_id
      : null;

    const isMock = (provider === "mock");

    try {
      emitActivity({ invocation_id, project_id, role: this.id,
        state: "INVOKING_ADAPTER", indicator: getIndicator(this.id, "INVOKING_ADAPTER") }, { root });
    } catch (_e) { /* best-effort */ }

    let agentResult;
    if (isMock) {
      // Mock path: flat prompt via adapter (used by test scenarios S160/S161/S166/S167/S170/S171)
      const prompt = _buildPrompt(project_id, input.source_tree, scenarioTag);
      try {
        const reg = require("../../tools/_registry").getDefaultRegistry();
        agentResult = await reg.invoke(
          "agent.invoke",
          { provider, model, prompt, project_id, context: { role: this.id } },
          { root, role_id: this.id }
        );
      } catch (err) {
        return roleFailed("AGENT_INVOKE_ERROR", err.message, ctx);
      }
    } else {
      // Real path: route through reverseVisionProvider (function calling, v2 prompt)
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
            task_input: {
              schema_version: SCHEMA_VERSION,
              project_id,
              source_tree:    input.source_tree,
              provider,
              model
            },
            context: { role: this.id }
          },
          { root, role_id: this.id }
        );
      } catch (err) {
        return roleFailed("AGENT_INVOKE_ERROR", err.message, ctx);
      }
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
