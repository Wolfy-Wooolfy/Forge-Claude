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
      suggested_answers: Array.isArray(output.suggested_answers)
        ? output.suggested_answers.map((a) => String(a || "")).filter(Boolean).slice(0, 4)
        : [],
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
      "  \"suggested_answers\": [],",
      "  \"reasoning_summary\": \"string\"",
      "}",
      "",
      "suggested_answers: 2-4 short answer options for the FIRST open_question only. Empty array if completeness is true or no questions.",
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

    const discoverTool = {
      type: "function",
      function: {
        name: "discover_requirements",
        description: "Perform universal, domain-agnostic requirement discovery from user input.",
        parameters: {
          type: "object",
          properties: {
            domain: { type: "string", description: "Detected project domain" },
            requirement_model: { type: "object", description: "Structured requirement model" },
            completeness: { type: "boolean", description: "True only when no execution-impacting ambiguity remains" },
            open_questions: { type: "array", items: { type: "string" }, description: "Targeted follow-up questions for missing requirements" },
            suggested_answers: { type: "array", items: { type: "string" }, description: "2-4 short answer options for the first open_question, empty if complete" },
            reasoning_summary: { type: "string", description: "Brief explanation of the discovery reasoning" }
          },
          required: ["domain", "requirement_model", "completeness", "open_questions", "suggested_answers", "reasoning_summary"]
        }
      }
    };

    const { callChatWithTool } = require("./_contract/openAiAdapter");

    let result;
    try {
      result = await callChatWithTool({
        provider_id:     this.name,
        system:          "You are the Requirement Discovery Engine for a governed AI Operating System.",
        messages:        [{ role: "user", content: this.buildPrompt(task) }],
        tool_definition: discoverTool.function,
        temperature:     0.2,
        model:           this.model
      });
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: err.code || "PROVIDER_ERROR", error: err && err.message ? err.message : String(err) } };
    }

    try {
      const normalized = this.normalizeOutput(result.arguments);
      if (!normalized) {
        return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_REQUIREMENT_DISCOVERY_SCHEMA" } };
      }
      return { status: "SUCCESS", output: normalized, metadata: { provider: this.name, model: this.model } };
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_TOOL_ARGUMENTS", error: err && err.message ? err.message : String(err) } };
    }
  }
}

module.exports = OpenAiRequirementDiscoveryProvider;