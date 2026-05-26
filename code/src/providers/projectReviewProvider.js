"use strict";

class ProjectReviewProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "openai_project_review";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_REVIEW_MODEL || "gpt-4.1-mini";
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
      "You are the Project Review Engine for a governed AI Operating System.",
      "",
      "Your task is to perform a thorough review of the provided project and identify issues, improvements, and missing elements.",
      "",
      "Rules:",
      "- Respond in the same language as the user's goal or request.",
      "- Be specific about what you find — avoid generic feedback.",
      "- Do NOT assume the project is correct.",
      "- Identify real, actionable issues.",
      "- Return valid JSON only. No prose outside JSON.",
      "",
      "Required JSON shape:",
      "{",
      "  \"project_type\": \"string\",",
      "  \"overall_health\": \"GOOD|NEEDS_IMPROVEMENT|CRITICAL\",",
      "  \"architecture_findings\": [",
      "    { \"finding\": \"string\", \"severity\": \"HIGH|MEDIUM|LOW\", \"location\": \"string\" }",
      "  ],",
      "  \"code_quality_findings\": [",
      "    { \"finding\": \"string\", \"severity\": \"HIGH|MEDIUM|LOW\", \"location\": \"string\" }",
      "  ],",
      "  \"missing_components\": [\"string\"],",
      "  \"risks\": [",
      "    { \"risk\": \"string\", \"severity\": \"HIGH|MEDIUM|LOW\", \"mitigation\": \"string\" }",
      "  ],",
      "  \"improvement_opportunities\": [",
      "    { \"area\": \"string\", \"suggestion\": \"string\", \"impact\": \"HIGH|MEDIUM|LOW\" }",
      "  ],",
      "  \"strengths\": [\"string\"],",
      "  \"recommended_actions\": [",
      "    { \"action\": \"string\", \"priority\": \"HIGH|MEDIUM|LOW\", \"effort\": \"HIGH|MEDIUM|LOW\" }",
      "  ],",
      "  \"summary\": \"string\"",
      "}",
      "",
      "User Review Goal: " + String(ctx.review_goal || ctx.user_goal || ""),
      "Domain: " + String(ctx.domain || ""),
      "",
      "Project Content to Review:",
      String(ctx.project_content || "")
    ].join("\n");
  }

  normalizeOutput(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      project_type: typeof parsed.project_type === "string" ? parsed.project_type : "",
      overall_health: typeof parsed.overall_health === "string" ? parsed.overall_health.toUpperCase() : "NEEDS_IMPROVEMENT",
      architecture_findings: Array.isArray(parsed.architecture_findings) ? parsed.architecture_findings : [],
      code_quality_findings: Array.isArray(parsed.code_quality_findings) ? parsed.code_quality_findings : [],
      missing_components: Array.isArray(parsed.missing_components) ? parsed.missing_components : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      improvement_opportunities: Array.isArray(parsed.improvement_opportunities) ? parsed.improvement_opportunities : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      recommended_actions: Array.isArray(parsed.recommended_actions) ? parsed.recommended_actions : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : ""
    };
  }

  async executeTask(task = {}) {
    if (!this.apiKey) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "OPENAI_API_KEY_MISSING" } };
    }

    const { getClient } = require("./_contract/openAiAdapter");
    let completion;
    try {
      const client = getClient();
      completion = await client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return valid JSON only. No markdown. No prose outside JSON." },
          { role: "user", content: this.buildPrompt(task) }
        ]
      });
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: err.code || "FETCH_ERROR", error: err && err.message ? err.message : String(err) } };
    }

    const content = completion && completion.choices && completion.choices[0] && completion.choices[0].message && typeof completion.choices[0].message.content === "string"
      ? completion.choices[0].message.content : "";

    try {
      const parsed = JSON.parse(this.extractJsonText(content));
      const normalized = this.normalizeOutput(parsed);
      if (!normalized) {
        return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_REVIEW_SCHEMA" } };
      }
      return { status: "SUCCESS", output: normalized, metadata: { provider: this.name, model: this.model } };
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_JSON_OUTPUT", error: err && err.message ? err.message : String(err) } };
    }
  }
}

module.exports = ProjectReviewProvider;
