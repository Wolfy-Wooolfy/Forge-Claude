"use strict";

class OpenAiExecutionFilesProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = "openai_execution_files";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_EXECUTION_FILES_MODEL || "gpt-4.1-mini";
  }

  extractJsonText(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return "";
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch && fencedMatch[1]) return fencedMatch[1].trim();
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1).trim();
    }
    return text;
  }

  buildPrompt(task = {}) {
    const ctx = task.context && typeof task.context === "object" ? task.context : {};
    const outputBase = String(ctx.output_base_path || "artifacts/projects/project/output");
    return [
      "You are the Execution Files Generator for a governed AI Operating System.",
      "",
      "Your task is to generate complete, self-contained implementation files for the approved project.",
      "",
      "Rules:",
      `- All file paths MUST start with: ${outputBase}/`,
      "- Generate only the files required to implement the approved scope (index.html, style.css, game.js, etc.).",
      "- Each file must be complete and immediately usable without modification.",
      "- Do not include placeholder content — generate real working code.",
      "- Return valid JSON only. No prose.",
      "",
      "Required JSON shape:",
      "{",
      "  \"files\": [",
      "    {",
      `      "path": "${outputBase}/filename.ext",`,
      "      \"content\": \"complete file content\",",
      "      \"allow_overwrite\": false",
      "    }",
      "  ]",
      "}",
      "",
      "Domain: " + String(ctx.domain || ""),
      "User Goal: " + String(ctx.user_goal || ""),
      "",
      "Selected Option:",
      JSON.stringify(ctx.selected_option || {}, null, 2),
      "",
      "Documentation:",
      String(ctx.documentation || ""),
      "",
      "Requirement Model:",
      JSON.stringify(ctx.requirement_model || {}, null, 2)
    ].join("\n");
  }

  normalizeOutput(parsed) {
    const files = Array.isArray(parsed && parsed.files) ? parsed.files : null;
    if (!files || files.length === 0) return null;

    const normalized = files
      .map((file) => ({
        path: typeof file.path === "string" ? file.path.trim().replace(/\\/g, "/") : "",
        content: typeof file.content === "string" ? file.content : "",
        allow_overwrite: file.allow_overwrite === true
      }))
      .filter((file) => file.path.length > 0);

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

    const { getClient } = require("./_contract/openAiAdapter");
    let completion;
    try {
      const client = getClient();
      completion = await client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Return valid JSON only. No markdown. No prose outside JSON."
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
        ? completion.choices[0].message.content
        : "";

    try {
      const parsed = JSON.parse(this.extractJsonText(content));
      const normalized = this.normalizeOutput(parsed);

      if (!normalized) {
        return {
          status: "FAILED",
          output: null,
          metadata: { provider: this.name, reason: "INVALID_FILES_SCHEMA" }
        };
      }

      return {
        status: "SUCCESS",
        output: { files: normalized },
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

module.exports = OpenAiExecutionFilesProvider;
