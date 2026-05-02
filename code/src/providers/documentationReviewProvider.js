"use strict";

class DocumentationReviewProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "openai_documentation_review";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_DOC_REVIEW_MODEL || "gpt-4.1-mini";
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
      "You are the Documentation Review Engine for a governed AI Operating System.",
      "",
      "Your task is to perform a rigorous self-review of the provided documentation draft.",
      "",
      "Rules:",
      "- Detect gaps, ambiguities, contradictions, and missing sections.",
      "- Suggest concrete improvements for each issue found.",
      "- Evaluate overall quality: readiness for execution handoff.",
      "- Respond in the same language as the documentation.",
      "- Return valid JSON only. No prose outside JSON.",
      "",
      "Required JSON shape:",
      "{",
      "  \"quality_gate\": { \"passed\": false, \"score\": 0 },",
      "  \"issues\": [",
      "    { \"type\": \"GAP|AMBIGUITY|CONTRADICTION|MISSING_SECTION\", \"section\": \"string\", \"description\": \"string\", \"severity\": \"HIGH|MEDIUM|LOW\" }",
      "  ],",
      "  \"suggestions\": [",
      "    { \"section\": \"string\", \"suggestion\": \"string\", \"priority\": \"HIGH|MEDIUM|LOW\" }",
      "  ],",
      "  \"missing_sections\": [],",
      "  \"overall_assessment\": \"string\",",
      "  \"execution_ready\": false",
      "}",
      "",
      "quality_gate.passed must be true only when no HIGH severity issues remain.",
      "quality_gate.score is 0-100 representing overall document quality.",
      "execution_ready must be true only when quality_gate.passed AND all required sections are present.",
      "",
      "Domain: " + String(ctx.domain || ""),
      "User Goal: " + String(ctx.user_goal || ""),
      "",
      "Documentation to Review:",
      String(ctx.documentation_content || "")
    ].join("\n");
  }

  normalizeOutput(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      quality_gate: parsed.quality_gate && typeof parsed.quality_gate === "object"
        ? { passed: parsed.quality_gate.passed === true, score: Number(parsed.quality_gate.score) || 0 }
        : { passed: false, score: 0 },
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      missing_sections: Array.isArray(parsed.missing_sections) ? parsed.missing_sections : [],
      overall_assessment: typeof parsed.overall_assessment === "string" ? parsed.overall_assessment : "",
      execution_ready: parsed.execution_ready === true
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
          temperature: 0.2,
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
        return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_REVIEW_SCHEMA" } };
      }
      return { status: "SUCCESS", output: normalized, metadata: { provider: this.name, model: this.model } };
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_JSON_OUTPUT", error: err && err.message ? err.message : String(err) } };
    }
  }
}

module.exports = DocumentationReviewProvider;
