"use strict";

const { OpenAI } = require("openai");

class ConversationalResponseProvider {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || "gpt-4o";
  }

  extractJsonText(raw) {
    if (!raw) return null;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) return fence[1].trim();
    const brace = raw.match(/(\{[\s\S]*\})/);
    if (brace) return brace[1].trim();
    return raw.trim();
  }

  buildPrompt(task) {
    const { operation, result, state, user_language, project_name } = task.context || {};
    const lang = String(user_language || "ar").toLowerCase().startsWith("en") ? "en" : "ar";
    const name = String(project_name || "");
    const stateLabel = String(state || "");

    const systemAr = `أنت مساعد ذكي ودود متخصص في مساعدة المستخدمين على بناء مشاريعهم التقنية.
أسلوبك: ودي، واضح، مختصر، ومشجع.
لا تعيد ذكر الحقول التقنية كـ JSON أو أسماء الحالات (states).
تحدث بلغة بشرية طبيعية كما لو كنت صديقاً خبيراً يساعد في المشروع.
المخرج: JSON فقط بهذا الشكل:
{ "message": "الرسالة هنا", "tone": "friendly|informative|urgent|celebrating", "suggest_next": "ماذا يفعل المستخدم الآن؟" }`;

    const systemEn = `You are a friendly and smart AI assistant helping users build their tech projects.
Style: warm, clear, concise, encouraging.
Do NOT mention technical fields like JSON or state names.
Speak in natural human language as if you're a knowledgeable friend.
Output: JSON only in this format:
{ "message": "message here", "tone": "friendly|informative|urgent|celebrating", "suggest_next": "what should the user do now?" }`;

    const system = lang === "ar" ? systemAr : systemEn;

    const resultSummary = typeof result === "object" ? JSON.stringify(result, null, 2).slice(0, 1200) : String(result || "");

    const userPrompt = `المشروع: "${name}"
الحالة الحالية: ${stateLabel}
العملية التي تمت: ${operation}
نتيجة العملية:
${resultSummary}

اكتب رسالة طبيعية للمستخدم توضح ما حدث وما هي الخطوة التالية.`;

    return { system, userPrompt };
  }

  normalizeOutput(raw) {
    const text = this.extractJsonText(raw);
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return {
        message: String(parsed.message || ""),
        tone: String(parsed.tone || "friendly"),
        suggest_next: String(parsed.suggest_next || "")
      };
    } catch {
      return { message: text, tone: "informative", suggest_next: "" };
    }
  }

  async executeTask(task = {}) {
    if (!this.apiKey) {
      return {
        status: "FAILED",
        output: null,
        metadata: { reason: "MISSING_API_KEY" }
      };
    }

    const { system, userPrompt } = this.buildPrompt(task);
    const client = new OpenAI({ apiKey: this.apiKey });

    try {
      const completion = await client.chat.completions.create({
        model: this.model,
        temperature: 0.7,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt }
        ]
      });

      const raw = completion.choices[0]?.message?.content || "";
      const output = this.normalizeOutput(raw);

      if (!output || !output.message) {
        return { status: "FAILED", output: null, metadata: { reason: "EMPTY_RESPONSE", raw } };
      }

      return { status: "SUCCESS", output, metadata: { model: this.model } };
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { reason: "API_ERROR", error: err.message } };
    }
  }
}

module.exports = ConversationalResponseProvider;
