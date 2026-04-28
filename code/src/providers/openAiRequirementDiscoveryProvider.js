class OpenAiRequirementDiscoveryProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "openai_requirement_discovery";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_REQUIREMENT_MODEL || "gpt-4.1-mini";
  }

  extractJsonText(rawText) {
    const text = String(rawText || "").trim();

    if (!text) {
      return "";
    }

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

    if (fencedMatch && fencedMatch[1]) {
      return fencedMatch[1].trim();
    }

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1).trim();
    }

    return text;
  }

  normalizeOutput(output) {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
      return null;
    }

    if (
      typeof output.domain !== "string" ||
      !output.requirement_model ||
      typeof output.requirement_model !== "object" ||
      Array.isArray(output.requirement_model) ||
      typeof output.completeness !== "boolean" ||
      !Array.isArray(output.open_questions)
    ) {
      return null;
    }

    return {
      domain: output.domain,
      requirement_model: output.requirement_model,
      completeness: output.completeness,
      open_questions: output.open_questions.map((question) => String(question || "")).filter(Boolean),
      reasoning_summary: typeof output.reasoning_summary === "string" ? output.reasoning_summary : ""
    };
  }

  buildPrompt(task = {}) {
    const context = task.context && typeof task.context === "object" ? task.context : {};
    const previousRequirementModel =
      context.previous_requirement_model && typeof context.previous_requirement_model === "object"
        ? context.previous_requirement_model
        : null;

    return [
      "You are the Requirement Discovery Engine for a governed AI Operating System.",
      "",
      "Your task is to perform universal, domain-agnostic requirement discovery.",
      "",
      "Rules:",
      "- Always detect the language of the user's input and respond in the same language.",
      "- Do not change the language unless explicitly requested by the user.",
      "- Understand the user's intent from natural language.",
      "- Detect the project domain.",
      "- Build or update a structured requirement_model.",
      "- Identify missing requirements.",
      "- Generate targeted follow-up questions.",
      "- Re-evaluate completeness after every user answer.",
      "- Do not assume missing information.",
      "- Do not generate implementation plans.",
      "- Do not generate code.",
      "- Return valid JSON only.",
      "",
      "Required JSON shape:",
      "{",
      "  \"domain\": \"string\",",
      "  \"requirement_model\": {},",
      "  \"completeness\": false,",
      "  \"open_questions\": [],",
      "  \"reasoning_summary\": \"string\"",
      "}",
      "",
      "Completeness must be true only when no execution-impacting ambiguity remains.",
      "",
      "User input:",
      String(task.request || ""),
      "",
      "Previous requirement_model:",
      previousRequirementModel ? JSON.stringify(previousRequirementModel, null, 2) : "null"
    ].join("\n");
  }

  async executeTask(task = {}) {
    if (!this.apiKey) {
      return {
        status: "FAILED",
        output: null,
        metadata: {
          provider: this.name,
          reason: "OPENAI_API_KEY_MISSING"
        }
      };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Return valid JSON only. Do not include markdown or prose outside JSON."
          },
          {
            role: "user",
            content: this.buildPrompt(task)
          }
        ]
      })
    });

    if (!response.ok) {
      return {
        status: "FAILED",
        output: null,
        metadata: {
          provider: this.name,
          reason: "OPENAI_HTTP_ERROR",
          status_code: response.status,
          response_text: await response.text()
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
          metadata: {
            provider: this.name,
            reason: "INVALID_REQUIREMENT_DISCOVERY_SCHEMA"
          }
        };
      }

      return {
        status: "SUCCESS",
        output: normalized,
        metadata: {
          provider: this.name,
          model: this.model
        }
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

module.exports = OpenAiRequirementDiscoveryProvider;