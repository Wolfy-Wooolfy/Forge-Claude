"use strict";

class IntentClassificationProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_MODEL || "gpt-4o";
  }

  buildPrompt(message, pendingAction, userLanguage) {
    const lang = String(userLanguage || "ar").toLowerCase().startsWith("en") ? "en" : "ar";

    const system = lang === "ar"
      ? `أنت مصنف نوايا. مهمتك تحديد ما إذا كانت رسالة المستخدم تمثل موافقة أو رفضاً أو طلب تعديل أو نية غير واضحة، وذلك استجابةً لإجراء معلق.

صنّف رسالة المستخدم في إحدى هذه الفئات:
- AFFIRM: المستخدم يوافق أو يؤكد أو يريد المتابعة بوضوح.
- REJECT: المستخدم يرفض أو يريد الإلغاء بوضوح.
- MODIFY: المستخدم يريد المتابعة لكن مع تعديلات ("تمام بس عايز أعدل", "موافق مع تغيير").
- UNCLEAR: الرسالة غامضة أو خارج الموضوع أو لا يمكن تصنيفها بثقة.

أعد JSON فقط بهذا الشكل:
{ "intent": "AFFIRM|REJECT|MODIFY|UNCLEAR", "confidence": 0.0..1.0, "clarification_question": "سؤال إذا كانت النية غير واضحة أو الثقة منخفضة، وإلا اتركه فارغاً" }`
      : `You are an intent classifier. Determine whether a user message represents affirmation, rejection, a modification request, or unclear intent in response to a pending action.

Classify into one of:
- AFFIRM: user clearly agrees, confirms, or wants to proceed.
- REJECT: user clearly declines or wants to cancel.
- MODIFY: user wants to proceed but with changes ("yes but change X", "ok with modification").
- UNCLEAR: message is ambiguous, off-topic, or cannot be reliably classified.

Return valid JSON only:
{ "intent": "AFFIRM|REJECT|MODIFY|UNCLEAR", "confidence": 0.0..1.0, "clarification_question": "question if unclear or low confidence, otherwise empty" }`;

    const userPrompt = lang === "ar"
      ? `الإجراء المعلق: ${pendingAction}\nرسالة المستخدم: ${message}\n\nصنّف النية.`
      : `Pending action: ${pendingAction}\nUser message: ${message}\n\nClassify the intent.`;

    return { system, userPrompt };
  }

  async executeTask(task = {}) {
    if (!this.apiKey) {
      return { status: "FAILED", output: null, metadata: { reason: "MISSING_API_KEY" } };
    }

    const ctx = task.context || {};
    const message = String(ctx.message || "");
    const pendingAction = String(ctx.pending_action || "");
    const userLanguage = String(ctx.user_language || "ar");

    if (!message) {
      return { status: "FAILED", output: null, metadata: { reason: "MISSING_MESSAGE" } };
    }

    const { system, userPrompt } = this.buildPrompt(message, pendingAction, userLanguage);

    const { callChatWithTool } = require("./_contract/openAiAdapter");

    let result;
    try {
      result = await callChatWithTool({
        provider_id:     "intent_classification",
        system,
        messages:        [{ role: "user", content: userPrompt }],
        tool_definition: {
          name:        "classify_intent",
          description: "Classify the user's intent in response to a pending action.",
          parameters: {
            type: "object",
            properties: {
              intent:                 { type: "string", enum: ["AFFIRM", "REJECT", "MODIFY", "UNCLEAR"] },
              confidence:             { type: "number", description: "Confidence score between 0.0 and 1.0" },
              clarification_question: { type: "string", description: "Question to ask if intent is unclear or confidence is low, otherwise empty string" }
            },
            required: ["intent", "confidence", "clarification_question"]
          }
        },
        temperature: 0.1,
        model:       this.model
      });
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { reason: err.code || "PROVIDER_ERROR", error: err && err.message ? err.message : String(err) } };
    }

    const args = result.arguments;

    const validIntents = ["AFFIRM", "REJECT", "MODIFY", "UNCLEAR"];
    const intent = validIntents.includes(args.intent) ? args.intent : "UNCLEAR";
    const confidence = typeof args.confidence === "number" ? Math.min(1, Math.max(0, args.confidence)) : 0;
    const clarification_question = typeof args.clarification_question === "string" ? args.clarification_question.trim() : "";

    return {
      status: "SUCCESS",
      output: { intent, confidence, clarification_question },
      metadata: { model: this.model }
    };
  }
}

module.exports = IntentClassificationProvider;
