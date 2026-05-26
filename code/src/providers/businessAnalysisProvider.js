"use strict";

class BusinessAnalysisProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "openai_business_analysis";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_BUSINESS_MODEL || "gpt-4.1-mini";
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
      "You are the Business Analysis Engine for a governed AI Operating System.",
      "",
      "Your task is to perform a structured business and profitability analysis for the described project.",
      "",
      "Rules:",
      "- Respond in the same language as the user_goal.",
      "- Be realistic — do NOT promise guaranteed profit.",
      "- Clearly label certainty levels: known, estimated, uncertain.",
      "- Return valid JSON only. No prose outside JSON.",
      "",
      "Required JSON shape:",
      "{",
      "  \"domain\": \"string\",",
      "  \"monetization_options\": [",
      "    { \"model\": \"string\", \"description\": \"string\", \"estimated_revenue_level\": \"HIGH|MEDIUM|LOW\", \"risk\": \"string\" }",
      "  ],",
      "  \"risks\": [",
      "    { \"risk\": \"string\", \"severity\": \"HIGH|MEDIUM|LOW\", \"mitigation\": \"string\" }",
      "  ],",
      "  \"feasibility\": { \"rating\": \"HIGH|MEDIUM|LOW\", \"reasoning\": \"string\" },",
      "  \"profitability_estimate\": { \"level\": \"HIGH|MEDIUM|LOW|UNKNOWN\", \"key_factors\": [], \"time_to_revenue\": \"string\" },",
      "  \"recommendation\": { \"preferred_direction\": \"string\", \"rationale\": \"string\", \"alternatives\": [] },",
      "  \"certainty_notes\": \"string\"",
      "}",
      "",
      "Domain: " + String(ctx.domain || ""),
      "User Goal: " + String(ctx.user_goal || ""),
      "Specific Question: " + String(ctx.question || ""),
      "",
      "Requirement Model:",
      JSON.stringify(ctx.requirement_model || {}, null, 2)
    ].join("\n");
  }

  normalizeOutput(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      domain: typeof parsed.domain === "string" ? parsed.domain : "",
      monetization_options: Array.isArray(parsed.monetization_options) ? parsed.monetization_options : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      feasibility: parsed.feasibility && typeof parsed.feasibility === "object" ? parsed.feasibility : { rating: "UNKNOWN", reasoning: "" },
      profitability_estimate: parsed.profitability_estimate && typeof parsed.profitability_estimate === "object"
        ? parsed.profitability_estimate
        : { level: "UNKNOWN", key_factors: [], time_to_revenue: "" },
      recommendation: parsed.recommendation && typeof parsed.recommendation === "object"
        ? parsed.recommendation
        : { preferred_direction: "", rationale: "", alternatives: [] },
      certainty_notes: typeof parsed.certainty_notes === "string" ? parsed.certainty_notes : ""
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
        temperature: 0.3,
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
        return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_ANALYSIS_SCHEMA" } };
      }
      return { status: "SUCCESS", output: normalized, metadata: { provider: this.name, model: this.model } };
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_JSON_OUTPUT", error: err && err.message ? err.message : String(err) } };
    }
  }
}

module.exports = BusinessAnalysisProvider;
