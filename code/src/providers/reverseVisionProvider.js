"use strict";

// Reverse-vision provider — analyzes SourceTreeAnalysis and infers a vision.md structure.
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §4 (InferredVision schema)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §5 (Vision Lock Semantics — auto-lock PROHIBITED)
// @see docs/10_runtime/20_INTAKE_CONTRACT.md §10 (intake_conversation_handler integration)
//
// This is the canonical LLM caller for reverse_vision. reverse_vision_role dispatches here
// for both mock and real invocations via agent.invoke { provider_id: "reverse_vision" }.

const path = require("path");

const { defineProvider, validateAgainstSchema } = require("./_contract/providerContract");
const { loadPrompt }                             = require("../runtime/agents/_prompt_loader");

// Resolved at module load time — avoids repeated path computation in the mock branch.
const _MOCK_RESPONSES_PATH = path.join(__dirname, "../runtime/agents/adapters/mock_responses.json");

const SYSTEM_PROMPT = loadPrompt("reverse_vision_v2");

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
        ignored_paths:          { type: "array", items: { type: "string" } },
        detected_framework:     { type: ["string", "null"] }
      }
    },
    provider:    { type: "string" },
    model:       { type: "string" },
    scenario_id: { type: "string" }
  }
};

// ── Output Tool — InferredVision (§4) ────────────────────────────────────────

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

// ── User prompt builder (port of reverse_vision_role._buildPrompt body section) ─────────────

function _buildUserPrompt(projectId, st) {
  const lines = [];
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
    if (mf.go_mod) {
      const g = mf.go_mod;
      const depStr = (g.dependencies && g.dependencies.length > 0)
        ? " deps=" + g.dependencies.slice(0, 5).join(", ")
        : "";
      lines.push("  go.mod: module=" + (g.module_path || "?") +
        " go=" + (g.go_version || "?") + depStr);
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

  lines.push(
    "\nAnalyze the source tree above and call the inferred_vision function with your " +
    "structured analysis of this project's name, domain, goals, constraints, non-goals, " +
    "source summary, and confidence level."
  );

  return lines.join("\n");
}

// ── Provider Definition ───────────────────────────────────────────────────────

const _provider = defineProvider(
  {
    id:            "reverse_vision",
    version:       "2.0.0",
    authority_doc: "docs/10_runtime/20_INTAKE_CONTRACT.md",
    required_capabilities: ["function_calling"],
    input_schema:  INPUT_SCHEMA,
    output_tool:   OUTPUT_TOOL,
    fail_mode:     "FAIL_CLOSED"
  },
  async function handler({ context, contract, callChat }) {

    // ── Mock branch for function-calling providers ───────────────────────────
    //
    // Function-calling providers cannot use the flat-prompt + SCENARIO_TAG
    // mock-adapter pattern used by non-function-calling roles, because the
    // adapter would need to fabricate a properly-shaped tool_call response.
    //
    // Pattern: when context.provider === "mock", read the scenario response
    // from mock_responses.json keyed by scenario_id and return it directly.
    // Trace files are still written for parity with the real path.
    //
    // This pattern is canonical for any future provider that uses
    // function-calling (per Provider Contract v2).
    // ─────────────────────────────────────────────────────────────────────────
    if (context.provider === "mock") {
      const scenarioId = context.scenario_id || "";
      const mockKey    = "mock|" + (context.model || "mock-rv") + "|scenario:" + scenarioId;
      const mockResponses = require(_MOCK_RESPONSES_PATH);
      const entry = mockResponses[mockKey];
      if (!entry) {
        return {
          status:   "FAILED",
          output:   null,
          metadata: { reason: "MOCK_NOT_FOUND", detail: "no mock response for key: " + mockKey, attempt: 1 }
        };
      }
      let mockOutput;
      try {
        mockOutput = JSON.parse(entry.text);
      } catch (e) {
        return {
          status:   "FAILED",
          output:   null,
          metadata: { reason: "MOCK_PARSE_FAILED", detail: e.message, attempt: 1 }
        };
      }
      return {
        status:   "SUCCESS",
        output:   mockOutput,
        metadata: {
          model:      context.model || "mock-rv",
          latency_ms: 0,
          tokens_in:  entry.tokens_in  || 10,
          tokens_out: entry.tokens_out || 20,
          attempt:    1
        }
      };
    }

    // ── Real path (function-calling via openAiAdapter) ────────────────────────
    const model      = context.model || process.env.OPENAI_MODEL || "gpt-4o";
    const sourceTree = context.source_tree;
    const userPrompt = _buildUserPrompt(context.project_id, sourceTree);

    const messages = [{ role: "user", content: userPrompt }];

    // ── Attempt 1 ────────────────────────────────────────────────────────────
    let result1;
    try {
      result1 = await callChat({ system: SYSTEM_PROMPT, messages, model });
    } catch (err) {
      return {
        status:   "FAILED",
        output:   null,
        metadata: { reason: "PROVIDER_CALL_FAILED", detail: err.message, attempt: 1 }
      };
    }

    const vision1  = result1.arguments;
    const issues1  = validateAgainstSchema(vision1, contract.output_tool.parameters, "output");
    const usage1   = result1.usage || {};

    if (issues1.length === 0) {
      return {
        status:   "SUCCESS",
        output:   vision1,
        metadata: {
          model:      result1.model,
          latency_ms: result1.latency_ms || 0,
          tokens_in:  usage1.prompt_tokens     || 0,
          tokens_out: usage1.completion_tokens || 0,
          attempt:    1
        }
      };
    }

    // ── Retry with validation errors ─────────────────────────────────────────
    const retryMessages = [
      ...messages,
      { role: "assistant", content: JSON.stringify(vision1) },
      {
        role:    "user",
        content: "Your response failed validation with these errors:\n" +
                 issues1.join("\n") +
                 "\n\nFix the issues and call the inferred_vision function again."
      }
    ];

    let result2;
    try {
      result2 = await callChat({ system: SYSTEM_PROMPT, messages: retryMessages, model });
    } catch (err) {
      return {
        status:   "FAILED",
        output:   null,
        metadata: { reason: "PROVIDER_RETRY_FAILED", detail: err.message, attempt: 2 }
      };
    }

    const vision2 = result2.arguments;
    const issues2 = validateAgainstSchema(vision2, contract.output_tool.parameters, "output");
    const usage2  = result2.usage || {};

    if (issues2.length > 0) {
      return {
        status:   "FAILED",
        output:   null,
        metadata: {
          reason:  "INVALID_PROVIDER_OUTPUT",
          detail:  "Two attempts failed validation. Last errors: " + issues2.join("; "),
          attempt: 2
        }
      };
    }

    return {
      status:   "SUCCESS",
      output:   vision2,
      metadata: {
        model:      result2.model,
        latency_ms: (result1.latency_ms || 0) + (result2.latency_ms || 0),
        tokens_in:  (usage1.prompt_tokens     || 0) + (usage2.prompt_tokens     || 0),
        tokens_out: (usage1.completion_tokens || 0) + (usage2.completion_tokens || 0),
        attempt:    2
      }
    };
  }
);

module.exports = _provider;
module.exports._buildUserPrompt = _buildUserPrompt;
