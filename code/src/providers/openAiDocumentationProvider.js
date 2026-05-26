"use strict";

class OpenAiDocumentationProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "openai_documentation";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_DOCUMENTATION_MODEL || "gpt-4.1-mini";
  }

  buildPrompt(task = {}) {
    const ctx = task.context && typeof task.context === "object" ? task.context : {};
    return [
      "You are the Documentation Generation Engine for a governed AI Operating System.",
      "",
      "Your task is to generate complete, well-structured project documentation in Markdown.",
      "",
      "Rules:",
      "- Write in the same language the user used in their goal.",
      "- Cover all sections: project overview, goals, requirements, selected option, technical scope, execution plan.",
      "- Be thorough but avoid filler. Write only content that adds clarity.",
      "- Return only the Markdown document. Do not wrap in code fences. No JSON output.",
      "",
      "Domain: " + String(ctx.domain || ""),
      "User Goal: " + String(ctx.user_goal || ""),
      "",
      "Selected Option:",
      JSON.stringify(ctx.selected_option || {}, null, 2),
      "",
      "Requirement Model:",
      JSON.stringify(ctx.requirement_model || {}, null, 2)
    ].join("\n");
  }

  async executeTask(task = {}) {
    if (!this.apiKey) {
      return {
        status: "FAILED",
        output: null,
        metadata: { provider: this.name, reason: "OPENAI_API_KEY_MISSING" }
      };
    }

    const { getClient } = require("./_contract/openAiAdapter");
    let completion;
    try {
      const client = getClient();
      completion = await client.chat.completions.create({
        model: this.model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "Return only clean Markdown documentation. No JSON. No code fence wrapping the entire document."
          },
          {
            role: "user",
            content: this.buildPrompt(task)
          }
        ]
      });
    } catch (err) {
      return {
        status: "FAILED",
        output: null,
        metadata: {
          provider: this.name,
          reason: err.code || "FETCH_ERROR",
          error: err && err.message ? err.message : String(err)
        }
      };
    }

    const content =
      completion &&
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message &&
      typeof completion.choices[0].message.content === "string"
        ? completion.choices[0].message.content.trim()
        : "";

    if (!content) {
      return {
        status: "FAILED",
        output: null,
        metadata: { provider: this.name, reason: "EMPTY_DOCUMENTATION_OUTPUT" }
      };
    }

    return {
      status: "SUCCESS",
      output: { content },
      metadata: { provider: this.name, model: this.model }
    };
  }
}

module.exports = OpenAiDocumentationProvider;
