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
      "DOMAIN DETECTION RULES (Critical):",
      "- You MUST detect the project domain from 'User Goal' and 'User Refinement Input'. Do NOT copy previous_domain.",
      "- If the current message indicates a different domain than previous_domain → set pivot_detected=true, detected_domain=<new domain>.",
      "- All suggested_directions, missing_components, and follow_up_question MUST be in the detected_domain ONLY.",
      "- Domain Lock: " + (ctx.domain_locked ? "LOCKED — user confirmed this domain. Only ask a pivot question if they explicitly request a domain change." : "OPEN — re-detect domain freely from the current user message."),
      "",
      "SUGGESTED ANSWERS RULES:",
      "- suggested_answers is an array of chip objects: { label, value, exclusive, multi_select }",
      "- multi_select: true → user can select multiple chips before sending (use for feature lists, goals, etc.)",
      "- multi_select: false → single click sends immediately (use for yes/no, confirmation questions)",
      "- exclusive: true → this chip clears all others and sends immediately (use for 'All of the above', 'None')",
      "- Always include an 'اكتب إجابة مختلفة' chip with exclusive:false, multi_select:false at the end when multi_select chips exist.",
      "",
      "General Rules:",
      "- Respond in the same language as the user_goal.",
      "- Never make decisions for the user — only present directions and suggestions.",
      "- Suggest 2-4 possible directions with reasoning.",
      "- Identify what key components are missing from the current idea.",
      "- Propose improvements with clear reasoning.",
      "",
      "Previous Domain (for reference only — do NOT use as the answer): " + String(ctx.previous_domain || "none"),
      "User Goal: " + String(ctx.user_goal || ""),
      "",
      "Current Requirement Model:",
      JSON.stringify(ctx.requirement_model || {}, null, 2),
      "",
      "User Refinement Input (current message):",
      String(ctx.refinement_input || "")
    ].join("\n");
  }

  normalizeChip(raw) {
    if (typeof raw === "string") {
      return { label: raw, value: raw, exclusive: false, multi_select: true };
    }
    if (raw && typeof raw === "object") {
      return {
        label: typeof raw.label === "string" ? raw.label : String(raw.value || raw.label || ""),
        value: typeof raw.value === "string" ? raw.value : String(raw.label || ""),
        exclusive: raw.exclusive === true,
        multi_select: raw.multi_select !== false
      };
    }
    return null;
  }

  normalizeOutput(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const chips = Array.isArray(parsed.suggested_answers)
      ? parsed.suggested_answers.map((a) => this.normalizeChip(a)).filter(Boolean).slice(0, 6)
      : [];
    return {
      expanded_summary: typeof parsed.expanded_summary === "string" ? parsed.expanded_summary : "",
      missing_components: Array.isArray(parsed.missing_components) ? parsed.missing_components : [],
      suggested_directions: Array.isArray(parsed.suggested_directions) ? parsed.suggested_directions : [],
      improvement_proposals: Array.isArray(parsed.improvement_proposals) ? parsed.improvement_proposals : [],
      readiness_assessment: parsed.readiness_assessment && typeof parsed.readiness_assessment === "object"
        ? { ready_for_options: parsed.readiness_assessment.ready_for_options === true, blocking_gaps: Array.isArray(parsed.readiness_assessment.blocking_gaps) ? parsed.readiness_assessment.blocking_gaps : [] }
        : { ready_for_options: false, blocking_gaps: [] },
      follow_up_question: typeof parsed.follow_up_question === "string" ? parsed.follow_up_question.trim() : "",
      suggested_answers: chips,
      detected_domain: typeof parsed.detected_domain === "string" ? parsed.detected_domain.trim() : "",
      pivot_detected: parsed.pivot_detected === true,
      domain_confidence: typeof parsed.domain_confidence === "number" ? Math.min(1, Math.max(0, parsed.domain_confidence)) : 1
    };
  }

  async executeTask(task = {}) {
    if (!this.apiKey) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "OPENAI_API_KEY_MISSING" } };
    }

    const rawHistory = Array.isArray(task.context && task.context.conversation_history)
      ? task.context.conversation_history : [];
    const historyMessages = rawHistory
      .map((h) => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: String(h.content || h.message || "")
      }))
      .filter((h) => h.content);

    const expandIdeaTool = {
      type: "function",
      function: {
        name: "expand_idea",
        description: "Expand and enrich the user's project idea with constructive analysis.",
        parameters: {
          type: "object",
          properties: {
            expanded_summary: { type: "string" },
            missing_components: { type: "array", items: { type: "string" } },
            suggested_directions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  direction: { type: "string" },
                  description: { type: "string" },
                  pros: { type: "array", items: { type: "string" } },
                  cons: { type: "array", items: { type: "string" } }
                },
                required: ["direction", "description", "pros", "cons"]
              }
            },
            improvement_proposals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  area: { type: "string" },
                  proposal: { type: "string" },
                  reasoning: { type: "string" }
                },
                required: ["area", "proposal", "reasoning"]
              }
            },
            readiness_assessment: {
              type: "object",
              properties: {
                ready_for_options: { type: "boolean" },
                blocking_gaps: { type: "array", items: { type: "string" } }
              },
              required: ["ready_for_options", "blocking_gaps"]
            },
            follow_up_question: { type: "string" },
            suggested_answers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label:        { type: "string" },
                  value:        { type: "string" },
                  exclusive:    { type: "boolean" },
                  multi_select: { type: "boolean" }
                },
                required: ["label", "value", "exclusive", "multi_select"]
              }
            },
            detected_domain:   { type: "string",  description: "Domain detected from current user message (not from cache)" },
            pivot_detected:    { type: "boolean", description: "True if domain changed from previous_domain" },
            domain_confidence: { type: "number",  description: "Confidence 0-1 in detected domain" }
          },
          required: ["expanded_summary", "missing_components", "suggested_directions", "improvement_proposals", "readiness_assessment", "follow_up_question", "suggested_answers", "detected_domain", "pivot_detected", "domain_confidence"]
        }
      }
    };

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.4,
          tools: [expandIdeaTool],
          tool_choice: { type: "function", function: { name: "expand_idea" } },
          messages: [
            { role: "system", content: "You are the Ideation Expansion Engine for a governed AI Operating System. Detect domain from the current user message — never copy the previous domain blindly." },
            ...historyMessages,
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
    const toolCall = payload.choices && payload.choices[0] && payload.choices[0].message &&
      Array.isArray(payload.choices[0].message.tool_calls) && payload.choices[0].message.tool_calls[0];

    if (!toolCall || toolCall.type !== "function") {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "NO_TOOL_CALL" } };
    }

    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      const normalized = this.normalizeOutput(parsed);
      if (!normalized) {
        return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_EXPANSION_SCHEMA" } };
      }
      return { status: "SUCCESS", output: normalized, metadata: { provider: this.name, model: this.model } };
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { provider: this.name, reason: "INVALID_TOOL_ARGUMENTS", error: err && err.message ? err.message : String(err) } };
    }
  }
}

module.exports = IdeationExpansionProvider;
