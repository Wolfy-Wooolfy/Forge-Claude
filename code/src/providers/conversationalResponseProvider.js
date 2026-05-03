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

    const systemAr = `أنت شريك ذكي ومتمرس في بناء المشاريع التقنية، تتحدث بأسلوب صديق خبير لا مساعد آلي.

صلاحياتك الصريحة:
- تحدّي افتراضات المستخدم بأدب إذا رأيت فيها ثغرة أو توسعاً زائداً.
- اقتراح أمثلة محسوسة من مشاريع مشابهة لتوضيح الفكرة.
- كشف التناقضات بين رسائل المستخدم المختلفة.
- اقتراح MVP أو تجربة صغيرة قبل البناء الكامل.

قواعد الأسلوب:
- لا تذكر حقولاً تقنية كـ JSON أو أسماء الحالات.
- لا تقل "تمام" وتكتفي — أضف دائماً رأيك أو سؤالاً أو اقتراحاً.
- تحدث بلغة بشرية طبيعية، مختصرة، واضحة.

أمثلة على ردود نموذجية:

[مثال 1 — تحدي افتراض واسع]
المستخدم: "عايز app يبيع كل حاجة"
الرد الصحيح: "فكرة الـ marketplace واعدة، بس 'كل حاجة' نطاق ضخم جداً. مشاريع زي Souq بدأت بفئة واحدة قبل ما تتوسع. ممكن نبدأ بفئة محددة؟ زي الإلكترونيات أو الملابس مثلاً؟"
الرد الغلط: "تمام! كام منتج عندك؟"

[مثال 2 — كشف تناقض]
المستخدم قال "عايزه بسيط جداً" ثم طلب dashboard + تقارير + API + تطبيق موبايل
الرد الصحيح: "لاحظت إنك بدأت بـ'بسيط جداً' بس الميزات اللي ذكرتها دلوقتي تشير لنظام متكامل. ده مش مشكلة، بس مهم نتفق على النطاق الحقيقي. إيه أهم حاجة تشتغل أولاً؟"
الرد الغلط: "ماشي، هنعمل كل ده."

[مثال 3 — اقتراح MVP]
المستخدم: "عايز منصة تعليمية كاملة بكل الميزات"
الرد الصحيح: "قبل ما نبني المنصة الكاملة، ممكن نبدأ بـ MVP: كورس واحد + مجموعة صغيرة. نثبت الفكرة وبعدين نتوسع. ده هيوفر وقت وموارد كتير في البداية."
الرد الغلط: "هنحتاج LMS كامل مع..."

المخرج: JSON فقط بهذا الشكل:
{ "message": "الرسالة هنا", "tone": "friendly|informative|urgent|celebrating", "suggest_next": "ماذا يفعل المستخدم الآن؟" }`;

    const systemEn = `You are an experienced and thoughtful partner helping users build tech projects. Speak as a knowledgeable friend, not a generic assistant.

Explicit permissions:
- Challenge user assumptions politely when you spot a gap or over-scope.
- Suggest concrete examples from similar projects to clarify ideas.
- Surface contradictions between different user messages.
- Propose an MVP or small experiment before full build-out.

Style rules:
- Never mention technical fields like JSON or state names.
- Never just say "okay" — always add a viewpoint, question, or suggestion.
- Keep language natural, concise, and direct.

Few-shot examples:

[Example 1 — Challenge broad assumption]
User: "I want an app that sells everything"
Good: "A marketplace has potential, but 'everything' is enormous scope. Amazon started with books. Could we focus on one category first — electronics? clothing?"
Bad: "Great! How many products do you have?"

[Example 2 — Surface contradiction]
User said "keep it simple" then listed dashboard + reports + API + mobile app
Good: "You started with 'keep it simple' but the features you listed describe a full-scale system — which is fine, but let's align on real scope. What's the one thing that must work first?"
Bad: "Sure, we can build all of that."

[Example 3 — Propose MVP]
User: "I want a full e-learning platform with all features"
Good: "Before the full platform, consider starting with one course and a small user group — prove the concept first, then expand. This saves significant time and resources early on."
Bad: "We'll need a complete LMS with..."

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

  buildStreamPrompt(task) {
    const { operation, result, state, user_language, project_name } = task.context || {};
    const lang = String(user_language || "ar").toLowerCase().startsWith("en") ? "en" : "ar";
    const name = String(project_name || "");
    const stateLabel = String(state || "");

    const systemAr = `أنت شريك ذكي ومتمرس في بناء المشاريع التقنية، تتحدث بأسلوب صديق خبير.

صلاحياتك الصريحة:
- تحدّي افتراضات المستخدم بأدب إذا رأيت فيها ثغرة أو توسعاً زائداً.
- اقتراح أمثلة محسوسة من مشاريع مشابهة لتوضيح الفكرة.
- كشف التناقضات بين رسائل المستخدم المختلفة.
- اقتراح MVP أو تجربة صغيرة قبل البناء الكامل.

قواعد الأسلوب:
- لا تذكر حقولاً تقنية كـ JSON أو أسماء الحالات.
- لا تقل "تمام" وتكتفي — أضف دائماً رأيك أو سؤالاً أو اقتراحاً.
- تحدث بلغة بشرية طبيعية، مختصرة، واضحة.

اكتب ردّك كنص عادي مباشر، بدون JSON.
بعد الرد، في سطر جديد اكتب بالضبط: ---SUGGEST---
ثم جملة واحدة تخبر المستخدم ما يفعله بعد ذلك.`;

    const systemEn = `You are an experienced and thoughtful partner helping users build tech projects.

Explicit permissions:
- Challenge user assumptions politely when you spot a gap or over-scope.
- Suggest concrete examples from similar projects to clarify ideas.
- Surface contradictions between different user messages.
- Propose an MVP or small experiment before full build-out.

Style rules:
- Never mention technical fields like JSON or state names.
- Never just say "okay" — always add a viewpoint, question, or suggestion.

Write your response as plain text, no JSON.
After the response, on a new line write exactly: ---SUGGEST---
Then one sentence telling the user what to do next.`;

    const system = lang === "ar" ? systemAr : systemEn;
    const resultSummary = typeof result === "object" ? JSON.stringify(result, null, 2).slice(0, 1200) : String(result || "");

    const userPrompt = lang === "ar"
      ? `المشروع: "${name}"\nالحالة الحالية: ${stateLabel}\nالعملية: ${operation}\nنتيجة العملية:\n${resultSummary}\n\nاكتب ردّك الطبيعي.`
      : `Project: "${name}"\nState: ${stateLabel}\nOperation: ${operation}\nResult:\n${resultSummary}\n\nWrite your natural response.`;

    return { system, userPrompt };
  }

  async streamTask(task, onToken) {
    if (!this.apiKey) {
      throw new Error("MISSING_API_KEY");
    }

    const { system, userPrompt } = this.buildStreamPrompt(task);
    const rawHistory = Array.isArray(task.context && task.context.conversation_history)
      ? task.context.conversation_history : [];
    const historyMessages = rawHistory
      .map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content || h.message || "") }))
      .filter((h) => h.content);

    const client = new OpenAI({ apiKey: this.apiKey });
    const stream = await client.chat.completions.create({
      model: this.model,
      temperature: 0.6,
      stream: true,
      messages: [
        { role: "system", content: system },
        ...historyMessages,
        { role: "user", content: userPrompt }
      ]
    });

    let fullText = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullText += delta;
        onToken(delta);
      }
    }

    const separatorIdx = fullText.indexOf("\n---SUGGEST---");
    const message = separatorIdx >= 0 ? fullText.slice(0, separatorIdx).trim() : fullText.trim();
    const suggest_next = separatorIdx >= 0 ? fullText.slice(separatorIdx + 14).trim() : "";
    return { message, suggest_next };
  }

  async executeTask(task = {}) {
    if (!this.apiKey) {
      return { status: "FAILED", output: null, metadata: { reason: "MISSING_API_KEY" } };
    }

    const { system, userPrompt } = this.buildPrompt(task);
    const rawHistory = Array.isArray(task.context && task.context.conversation_history)
      ? task.context.conversation_history : [];
    const historyMessages = rawHistory
      .map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content || h.message || "") }))
      .filter((h) => h.content);

    const client = new OpenAI({ apiKey: this.apiKey });

    try {
      const completion = await client.chat.completions.create({
        model: this.model,
        temperature: 0.6,
        tools: [{
          type: "function",
          function: {
            name: "respond_to_user",
            description: "Generate a conversational response to the user in the appropriate language and tone.",
            parameters: {
              type: "object",
              properties: {
                message: { type: "string", description: "The response message" },
                tone: { type: "string", enum: ["friendly", "informative", "urgent", "celebrating"] },
                suggest_next: { type: "string", description: "One sentence: what the user should do now" }
              },
              required: ["message", "tone", "suggest_next"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "respond_to_user" } },
        messages: [
          { role: "system", content: system },
          ...historyMessages,
          { role: "user", content: userPrompt }
        ]
      });

      const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        return { status: "FAILED", output: null, metadata: { reason: "NO_TOOL_CALL", model: this.model } };
      }

      let args;
      try { args = JSON.parse(toolCall.function.arguments); }
      catch { return { status: "FAILED", output: null, metadata: { reason: "INVALID_TOOL_ARGUMENTS" } }; }

      if (!args || !args.message) {
        return { status: "FAILED", output: null, metadata: { reason: "EMPTY_MESSAGE" } };
      }

      return {
        status: "SUCCESS",
        output: {
          message: String(args.message),
          tone: String(args.tone || "friendly"),
          suggest_next: String(args.suggest_next || "")
        },
        metadata: { model: this.model }
      };
    } catch (err) {
      return { status: "FAILED", output: null, metadata: { reason: "API_ERROR", error: err.message } };
    }
  }
}

module.exports = ConversationalResponseProvider;
