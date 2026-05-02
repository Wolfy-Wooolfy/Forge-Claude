"use strict";

class ResearchProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "openai_research";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini";
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
      "You are the Research Engine for a governed AI Operating System.",
      "",
      "Your task is to perform structured research and knowledge validation on the given topic.",
      "",
      "Rules:",
      "- Respond in the same language as the query.",
      "- ALWAYS clearly label the certainty of each finding: KNOWN, ESTIMATED, or UNCERTAIN.",
      "- Never present guesses as facts.",
      "- Distinguish between general patterns, logical estimates, and actual uncertainty.",
      "- Consider multiple angles and scenarios.",
      "- Return valid JSON only. No prose outside JSON.",
      "",
      "Required JSON shape:",
      "{",
      "  \"topic\": \"string\",",
      "  \"findings\": [",
      "    { \"finding\": \"string\", \"certainty\": \"KNOWN|ESTIMATED|UNCERTAIN\", \"source_basis\": \"string\" }",
      "  ],",
      "  \"scenarios\": [",
      "    { \"scenario\": \"string\", \"probability\": \"HIGH|MEDIUM|LOW\", \"key_conditions\": [\"string\"] }",
      "  ],",
      "  \"recommendation\": { \"conclusion\": \"string\", \"reasoning\": \"string\", \"alternatives\": [] },",
      "  \"confidence_level\": \"HIGH|MEDIUM|LOW\",",
      "  \"knowledge_gaps\": [\"string\"],",
      "  \"follow_up_questions\": [\"string\"]",
      "}",
      "",
      "Domain: " + String(ctx.domain || ""),
      "Research Query: " + String(ctx.query || ctx.question || ""),
      "Project Context: " + String(ctx.user_goal || ""),
      "",
      "Requirement Model:",
      JSON.stringify(ctx.requirement_model || {}, null, 2)
    ].join("\n");
  }

  normalizeOutput(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      topic: typeof parsed.topic === "string" ? parsed.topic : "",
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [],
      recommendation: parsed.recommendation && typeof parsed.recommendation === "object"
        ? parsed.recommendation
        : { conclusion: "", reasoning: "", alternatives: [] },
      confidence_level: typeof parsed.confidence_level === "string" ? parsed.confidence_level.toUpperCase() : "LOW",
      knowledge_gaps: Array.isArray(parsed.knowledge_gaps) ? parsed.knowledge_gaps : [],
      follow_up_questions: Array.isArray(parsed.follow_up_questions) ? parsed.follow_up_questions : []
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
          temperature: 0.3,
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
        return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_RESEARCH_SCHEMA" } };
      }
      return { status: "SUCCESS", output: normalized, metadata: { provider: this.name, model: this.model } };
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_JSON_OUTPUT", error: err && err.message ? err.message : String(err) } };
    }
  }
}

module.exports = ResearchProvider;
