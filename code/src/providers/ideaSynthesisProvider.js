"use strict";

// Idea-synthesis provider — reads a project's full conversation history and
// produces a structured idea summary for owner review before pipeline entry.
// @see artifacts/decisions/DECISION-2026-05-28-phase-17-idea-synthesis-gate.md §2.2
// @see docs/10_runtime/18b_ROLE_PROMPTS.md (idea_synthesis_v1)
//
// Called directly by conversationEngine (no role dispatch).
// Mock key format: "mock|mock-is|scenario:<scenario_id>"

const path = require("path");

const { defineProvider, validateAgainstSchema }    = require("./_contract/providerContract");
const { loadPrompt }                               = require("../runtime/agents/_prompt_loader");
const { createLanguageDetectionCompliance }        = require("../ai_os/languageDetectionCompliance");

const _MOCK_RESPONSES_PATH = path.join(__dirname, "../runtime/agents/adapters/mock_responses.json");

const SYSTEM_PROMPT    = loadPrompt("idea_synthesis_v1");
const { detectLanguage: _detectLang } = createLanguageDetectionCompliance();

// ── Input Schema ──────────────────────────────────────────────────────────────

const INPUT_SCHEMA = {
  type: "object",
  required: ["schema_version", "project_id", "conversation_history"],
  properties: {
    schema_version:        { type: "string" },
    project_id:            { type: "string", minLength: 1 },
    conversation_history: {
      type:  "array",
      items: {
        type:       "object",
        required:   ["role", "content"],
        properties: {
          role:    { type: "string" },
          content: { type: "string" }
        }
      }
    },
    provider:    { type: "string" },
    model:       { type: "string" },
    scenario_id: { type: "string" }
  }
};

// ── Output Tool ───────────────────────────────────────────────────────────────

const OUTPUT_TOOL = {
  name: "idea_synthesis",
  parameters: {
    type: "object",
    required: [
      "project_name",
      "domain",
      "goal_primary",
      "features",
      "constraints",
      "non_goals",
      "open_questions"
    ],
    properties: {
      project_name:   { type: "string", minLength: 1 },
      domain:         { type: "string", minLength: 1 },
      goal_primary:   { type: "string", minLength: 1 },
      features:       { type: "array", items: { type: "string" } },
      constraints:    { type: "array", items: { type: "string" } },
      non_goals:      { type: "array", items: { type: "string" } },
      open_questions: { type: "array", items: { type: "string" } }
    }
  }
};

// ── User prompt builder ───────────────────────────────────────────────────────

function _buildUserPrompt(projectId, history) {
  const firstUserMsg = (history || []).find(m => m.role === "user");
  const lang         = firstUserMsg ? _detectLang(firstUserMsg.content || "") : "en";

  const lines = [];
  lines.push("PROJECT ID: " + projectId);
  lines.push("CONVERSATION HISTORY (" + history.length + " messages):");
  lines.push("");

  for (const msg of history) {
    const role    = String(msg.role    || "unknown").toUpperCase();
    const content = String(msg.content || msg.message || "").trim();
    lines.push("[" + role + "] " + content);
  }

  lines.push("");
  lines.push(
    "Analyze the conversation above and call the idea_synthesis function with a " +
    "structured summary of the user's project idea. Pay special attention to " +
    "open_questions — state clearly what Forge is NOT sure about."
  );
  lines.push("");
  lines.push(
    "LANGUAGE INSTRUCTION: The conversation is in " + lang + ". Write ALL output fields " +
    "(project_name, goal_primary, features, constraints, non_goals, open_questions) in " + lang + "."
  );

  return lines.join("\n");
}

// ── Provider Definition ───────────────────────────────────────────────────────

const _provider = defineProvider(
  {
    id:            "idea_synthesis",
    version:       "1.0.0",
    authority_doc: "docs/10_runtime/18b_ROLE_PROMPTS.md",
    required_capabilities: ["function_calling"],
    input_schema:  INPUT_SCHEMA,
    output_tool:   OUTPUT_TOOL,
    fail_mode:     "FAIL_CLOSED"
  },
  async function handler({ context, contract, callChat }) {

    // ── Mock branch ──────────────────────────────────────────────────────────
    if (context.provider === "mock") {
      const scenarioId  = context.scenario_id || "";
      const mockKey     = "mock|mock-is|scenario:" + scenarioId;
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
          model:      context.model || "mock-is",
          latency_ms: 0,
          tokens_in:  entry.tokens_in  || 10,
          tokens_out: entry.tokens_out || 20,
          attempt:    1
        }
      };
    }

    // ── Real path ─────────────────────────────────────────────────────────────
    const model      = context.model || process.env.OPENAI_MODEL || "gpt-4o";
    const history    = context.conversation_history || [];
    const userPrompt = _buildUserPrompt(context.project_id, history);
    const messages   = [{ role: "user", content: userPrompt }];

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

    const summary1 = result1.arguments;
    const issues1  = validateAgainstSchema(summary1, contract.output_tool.parameters, "output");
    const usage1   = result1.usage || {};

    if (issues1.length === 0) {
      return {
        status:   "SUCCESS",
        output:   summary1,
        metadata: {
          model:      result1.model,
          latency_ms: result1.latency_ms || 0,
          tokens_in:  usage1.prompt_tokens     || 0,
          tokens_out: usage1.completion_tokens || 0,
          attempt:    1
        }
      };
    }

    // ── Retry with validation errors ──────────────────────────────────────────
    const retryMessages = [
      ...messages,
      { role: "assistant", content: JSON.stringify(summary1) },
      {
        role:    "user",
        content: "Your response failed validation with these errors:\n" +
                 issues1.join("\n") +
                 "\n\nFix the issues and call the idea_synthesis function again."
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

    const summary2 = result2.arguments;
    const issues2  = validateAgainstSchema(summary2, contract.output_tool.parameters, "output");
    const usage2   = result2.usage || {};

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
      output:   summary2,
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
