"use strict";

class OpenAiOptionsProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "openai_options";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_OPTIONS_MODEL || "gpt-4.1-mini";
  }

  extractJsonText(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return "";
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch && fencedMatch[1]) return fencedMatch[1].trim();
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      return text.slice(firstBracket, lastBracket + 1).trim();
    }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1).trim();
    }
    return text;
  }

  buildPrompt(task = {}) {
    const ctx = task.context && typeof task.context === "object" ? task.context : {};
    return [
      "You are the Options Generation Engine for a governed AI Operating System.",
      "",
      "Your task is to generate 2 to 3 distinct project options based on the provided requirement model.",
      "",
      "Rules:",
      "- Generate exactly 2 to 3 options.",
      "- Each option must represent a meaningfully different approach or scope.",
      "- Options must be grounded entirely in the requirement model — do not invent new domains.",
      "- Respond in the same language the user used in their goal.",
      "- Return a valid JSON array only. No prose. No markdown fences.",
      "",
      'Required JSON shape (array at root):',
      '[',
      '  {',
      '    "option_id": "OPTION-1",',
      '    "title": "short option title",',
      '    "description": "clear description of this option scope and approach",',
      '    "impact_level": "HIGH",',
      '    "risk_level": "LOW"',
      '  }',
      ']',
      "",
      "impact_level and risk_level must each be one of: HIGH, MEDIUM, LOW",
      "",
      "Domain: " + String(ctx.domain || ""),
      "",
      "User Goal:",
      String(ctx.user_goal || ""),
      "",
      "Requirement Model:",
      JSON.stringify(ctx.requirement_model || {}, null, 2)
    ].join("\n");
  }

  normalizeOutput(parsed) {
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed && Array.isArray(parsed.options) ? parsed.options : null);

    if (!list || list.length < 1) return null;

    const normalized = list.slice(0, 3).map((item, idx) => ({
      option_id: typeof item.option_id === "string" && item.option_id.trim()
        ? item.option_id.trim()
        : `OPTION-${idx + 1}`,
      title: typeof item.title === "string" ? item.title.trim() : `Option ${idx + 1}`,
      description: typeof item.description === "string" ? item.description.trim() : "",
      impact_level: typeof item.impact_level === "string"
        ? item.impact_level.trim().toUpperCase()
        : "MEDIUM",
      risk_level: typeof item.risk_level === "string"
        ? item.risk_level.trim().toUpperCase()
        : "MEDIUM"
    }));

    return normalized.length > 0 ? normalized : null;
  }

  async executeTask(task = {}) {
    if (!this.apiKey) {
      return {
        status: "FAILED",
        output: null,
        metadata: { provider: this.name, reason: "OPENAI_API_KEY_MISSING" }
      };
    }

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: "Return a valid JSON array only. No markdown fences. No prose outside the array."
            },
            {
              role: "user",
              content: this.buildPrompt(task)
            }
          ]
        })
      });
    } catch (err) {
      return {
        status: "FAILED",
        output: null,
        metadata: {
          provider: this.name,
          reason: "FETCH_ERROR",
          error: err && err.message ? err.message : String(err)
        }
      };
    }

    if (!response.ok) {
      return {
        status: "FAILED",
        output: null,
        metadata: {
          provider: this.name,
          reason: "OPENAI_HTTP_ERROR",
          status_code: response.status
        }
      };
    }

    const payload = await response.json();
    const content =
      payload &&
      payload.choices &&
      payload.choices[0] &&
      payload.choices[0].message &&
      typeof payload.choices[0].message.content === "string"
        ? payload.choices[0].message.content
        : "";

    try {
      const parsed = JSON.parse(this.extractJsonText(content));
      const normalized = this.normalizeOutput(parsed);

      if (!normalized) {
        return {
          status: "FAILED",
          output: null,
          metadata: { provider: this.name, reason: "INVALID_OPTIONS_SCHEMA" }
        };
      }

      return {
        status: "SUCCESS",
        output: { options: normalized },
        metadata: { provider: this.name, model: this.model }
      };
    } catch (err) {
      return {
        status: "FAILED",
        output: null,
        metadata: {
          provider: this.name,
          reason: "INVALID_JSON_OUTPUT",
          error: err && err.message ? err.message : String(err)
        }
      };
    }
  }
}

module.exports = OpenAiOptionsProvider;
