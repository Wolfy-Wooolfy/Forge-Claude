"use strict";

class IdeationExpansionProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "openai_ideation_expansion";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_IDEATION_MODEL || "gpt-4.1-mini";
  }

  extractJsonText(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return "";
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch && fencedMatch[1]) return fencedMatch[1].trim();
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) return text.slice(firstBrace, lastBrace + 1).trim();
    return text;
  }

  buildPrompt(task = {}) {
    const ctx = task.context && typeof task.context === "object" ? task.context : {};
    return [
      "You are the Ideation Expansion Engine for a governed AI Operating System.",
      "",
      "Your task is to expand and enrich the user's project idea with constructive suggestions, improvements, and directions.",
      "",
      "Rules:",
      "- Respond in the same language as the user_goal.",
      "- Never make decisions for the user — only present directions and suggestions.",
      "- Suggest 2-4 possible directions with reasoning.",
      "- Identify what key components are missing from the current idea.",
      "- Propose improvements with clear reasoning.",
      "- Return valid JSON only. No prose outside JSON.",
      "",
      "Required JSON shape:",
      "{",
      "  \"expanded_summary\": \"string — restate the idea in clearer, enriched form\",",
      "  \"missing_components\": [\"string\"],",
      "  \"suggested_directions\": [",
      "    { \"direction\": \"string\", \"description\": \"string\", \"pros\": [\"string\"], \"cons\": [\"string\"] }",
      "  ],",
      "  \"improvement_proposals\": [",
      "    { \"area\": \"string\", \"proposal\": \"string\", \"reasoning\": \"string\" }",
      "  ],",
      "  \"readiness_assessment\": { \"ready_for_options\": false, \"blocking_gaps\": [] },",
      "  \"follow_up_question\": \"string — ONE focused question to move the idea forward, or empty if ready\"",
      "}",
      "",
      "readiness_assessment.ready_for_options must be true only when the idea is complete enough to generate options.",
      "",
      "Domain: " + String(ctx.domain || ""),
      "User Goal: " + String(ctx.user_goal || ""),
      "",
      "Current Requirement Model:",
      JSON.stringify(ctx.requirement_model || {}, null, 2),
      "",
      "User Refinement Input (if any):",
      String(ctx.refinement_input || "")
    ].join("\n");
  }

  normalizeOutput(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      expanded_summary: typeof parsed.expanded_summary === "string" ? parsed.expanded_summary : "",
      missing_components: Array.isArray(parsed.missing_components) ? parsed.missing_components : [],
      suggested_directions: Array.isArray(parsed.suggested_directions) ? parsed.suggested_directions : [],
      improvement_proposals: Array.isArray(parsed.improvement_proposals) ? parsed.improvement_proposals : [],
      readiness_assessment: parsed.readiness_assessment && typeof parsed.readiness_assessment === "object"
        ? { ready_for_options: parsed.readiness_assessment.ready_for_options === true, blocking_gaps: Array.isArray(parsed.readiness_assessment.blocking_gaps) ? parsed.readiness_assessment.blocking_gaps : [] }
        : { ready_for_options: false, blocking_gaps: [] },
      follow_up_question: typeof parsed.follow_up_question === "string" ? parsed.follow_up_question.trim() : ""
    };
  }

  async executeTask(task = {}) {
    if (!this.apiKey) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "OPENAI_API_KEY_MISSING" } };
    }

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Return valid JSON only. No markdown. No prose outside JSON." },
            { role: "user", content: this.buildPrompt(task) }
          ]
        })
      });
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "FETCH_ERROR", error: err && err.message ? err.message : String(err) } };
    }

    if (!response.ok) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "OPENAI_HTTP_ERROR", status_code: response.status } };
    }

    const payload = await response.json();
    const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message && typeof payload.choices[0].message.content === "string"
      ? payload.choices[0].message.content : "";

    try {
      const parsed = JSON.parse(this.extractJsonText(content));
      const normalized = this.normalizeOutput(parsed);
      if (!normalized) {
        return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_EXPANSION_SCHEMA" } };
      }
      return { status: "SUCCESS", output: normalized, metadata: { provider: this.name, model: this.model } };
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_JSON_OUTPUT", error: err && err.message ? err.message : String(err) } };
    }
  }
}

module.exports = IdeationExpansionProvider;
