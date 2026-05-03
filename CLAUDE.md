# CLAUDE.md — Forge Project Rules for Claude Code

> هذا الملف يُقرأ تلقائياً بواسطة Claude Code في بداية كل جلسة.
> يحدد قواعد العمل الصارمة لمشروع Forge.

---

## 1. هوية المشروع

**Forge** هو نظام تشغيل ذكي (AI Operating System) لبناء المشاريع التقنية بشكل محكوم، يشتغل على 3 مراحل:

1. **Stage A — Idea Engine:** بلورة الفكرة وحوار المستخدم لحد الموافقة النهائية
2. **Stage B — Documentation Engine:** ترجمة الفكرة لوثائق + حلقة كشف فجوات ذاتية
3. **Stage C — Code Engine:** تنفيذ الكود مع تتبع لكل وحدة مقابل وثيقتها + اختبار

السلطة المطلقة هي ملفات `docs/**` و `progress/status.json`.

---

## 2. قراءة إجبارية قبل أي تعديل

قبل أي عمل، اقرأ هذه الملفات بالكامل (لا تستنتج، لا تخمّن):

```
INSTRUCTIONS.md                                  ← بروتوكول التنفيذ الإجباري
progress/status.json                             ← الحالة الحالية للنظام
docs/12_ai_os/03_CONVERSATION_LAYER_CONTRACT.md  ← قواعد طبقة المحادثة
docs/12_ai_os/06_DISCUSSION_AND_IDEATION_LOOP.md ← حلقة الإيجاد
docs/01_system/01_Idea_Admission_Contract.md     ← عقد قبول الفكرة
```

ثم اكتب: `READ COMPLETE: <قائمة الملفات>` قبل البدء.

---

## 3. القواعد الذهبية (Hard Rules — لا تُكسر)

### 3.1 لا تعدّل الوثائق إلا بإذن صريح
ملفات `docs/**` هي السلطة. أي تعديل عليها يحتاج إذن واضح من المستخدم في الرسالة الحالية.

### 3.2 لا تعدّل status.json بدون تسجيل قرار
أي تغيير في `progress/status.json` يستلزم تسجيل قرار في `artifacts/decisions/` قبل الكتابة.

### 3.3 لا تستنتج نية المستخدم بـ keyword matching
ممنوع منعاً باتاً استخدام `String.includes()` أو regex على نص المستخدم لتصنيف النية (موافقة/رفض/نوع طلب).
كل تصنيف لازم يمر عبر مزود ذكاء (provider) — ده اللي بيقوله العقد في
`docs/12_ai_os/03_CONVERSATION_LAYER_CONTRACT.md §13.7.3`.

### 3.4 لا تنفذ بدون تطابق مع الوثائق
لو الكود اللي بتكتبه ما عندوش وثيقة موثوقة بتدعمه → اوقف، اطلب توضيح أو تعديل وثيقة الأول.

### 3.5 احترم Fail-Closed
لو في غموض، فشل، أو حالة غير محددة → ارجع `BLOCKED` مع `reason` واضح. ممنوع الـ silent fallback.

### 3.6 استخدم اللغة العربية في الردود الموجهة للمستخدم
المستخدم بيتعامل بالعربية. الكود والـ comments بالإنجليزية. الـ user-facing strings بالعربية (مع دعم en كـ fallback).

---

## 4. قواعد الكتابة في الكود

- **JS بدون TypeScript** — المشروع كله Vanilla Node.js (`"use strict"`)
- **CommonJS modules** — `require/module.exports`، مش ESM
- **لا dependencies جديدة بدون موافقة** — افحص `package.json` الأول
- **كل provider بيرث نفس الواجهة:** `executeTask({ task_id, context })` → `{ status, output, metadata }`
- **JSON files دايماً تُكتب بـ:** `JSON.stringify(payload, null, 2)` و `utf8`
- **مسارات نسبية لـ root المشروع:** استخدم `path.resolve(options.root || process.cwd())`

---

## 5. أولوية المهام الحالية (المسار التنفيذي)

المستخدم حدد المشاكل التالية بترتيب الأولوية. اشتغل عليها بنفس الترتيب:

### المهمة P1 — تمرير تاريخ المحادثة الكامل للموديل (Critical)
**الملفات:**
- `code/src/providers/conversationalResponseProvider.js`
- `code/src/providers/ideationExpansionProvider.js`
- `code/src/ai_os/conversationEngine.js`
- `code/src/workspace/apiServer.js` (نقطة `/api/ai-os/chat`)

**المطلوب:**
- المزودان حالياً يبعتوا رسالتين بس (`system + user`).
- المطلوب: يستقبلوا `conversation_history` كـ array من `{role, content}` ويبعتوها داخل `messages` array للـ OpenAI API.
- المصدر: `conversationMemoryManager.loadContext(projectId)` → خد آخر 20 رسالة كحد أقصى (token budget).
- حول كل entry من `{role: "user|assistant", content}` لشكل OpenAI messages مباشرة.

**معيار النجاح:**
لما المستخدم يقول "زي اللي قلتلك قبل كده" — الموديل يفهم بدون ما يحتاج تذكير.

### المهمة P2 — إزالة keyword matching للموافقة (Critical)
**الملف:** `code/src/ai_os/conversationEngine.js` السطور 268-303

**المطلوب:**
- استبدال array الـ keywords (`["yes", "نعم", "اه"...]`) بـ provider جديد اسمه `IntentClassificationProvider`.
- المزود بياخد رسالة المستخدم + الـ pending action، ويرجع `{intent: "AFFIRM" | "REJECT" | "MODIFY" | "UNCLEAR", confidence: 0-1}`.
- لو `confidence < 0.75` → ارجع `PENDING_CONFIRMATION` مع رسالة استيضاح.

**معيار النجاح:**
"تمام بس عايز اعدل حاجة" → `MODIFY` مش `AFFIRM`.
"مش متأكد لسه" → `UNCLEAR` مش `REJECT`.

### المهمة P3 — تحسين system prompt للحوار البشري
**الملف:** `code/src/providers/conversationalResponseProvider.js` السطور 26-38

**المطلوب:**
- توسيع التعليمات لتشمل صلاحيات صريحة:
  - تحدي افتراضات المستخدم بأدب
  - اقتراح أمثلة محسوسة من مشاريع شبيهة
  - كشف التناقضات بين رسائل المستخدم
  - اقتراح MVP / تجارب صغيرة قبل التوسع
- إضافة few-shot examples في الـ system prompt (3 أمثلة لردود نموذجية).
- خفض temperature من 0.7 لـ 0.6 لاتساق أعلى.

**معيار النجاح:**
لو المستخدم قال "عايز app يبيع كل حاجة" — الموديل ما يقولش "تمام، كم منتج؟"، يرد بـ "ده نطاق واسع، ممكن نبدأ بفئة واحدة؟ زي مثلاً..."

### المهمة P4 — Quick-reply chips في الواجهة لمرحلة Discovery
**الملف:** `web/index.html` (يوجد `strategy-choice-btn` بالفعل، نوسعه)

**المطلوب:**
- لما الـ provider يرجع `follow_up_question` مع حقل اختياري `suggested_answers: [string]`
- الواجهة تعرض الأزرار دي كـ chips تحت سؤال الـ AI
- الضغط على chip = إرسال نصه فوراً كـ user message

**التنسيق المطلوب من الـ provider:**
```json
{
  "follow_up_question": "إيه نوع المستخدم المستهدف؟",
  "suggested_answers": ["B2B شركات", "B2C أفراد", "Marketplace", "أكتب إجابة مختلفة"]
}
```

### المهمة P5 — Streaming للردود
**الملفات:** `apiServer.js` + `web/index.html`
**المطلوب:** استخدم OpenAI streaming + Server-Sent Events. مرحلة لاحقة.

### المهمة P6 — Function calling بدل JSON parsing
**كل ملفات providers**
**المطلوب:** التحول لـ `tools: [{type: "function", ...}]` و `tool_choice` بدل regex على النص. مرحلة لاحقة.

---

## 6. خطوات العمل لكل مهمة

لكل مهمة من P1 → P6:

1. **اقرأ كامل الملفات المتأثرة** قبل أي تعديل
2. **اكتب تشخيص قبل التعديل:** ما هو السلوك الحالي بالظبط؟
3. **اقترح التعديل بـ diff واضح** قبل التنفيذ، انتظر موافقة المستخدم
4. **بعد التعديل، اكتب اختبار يدوي:** أمر curl أو سيناريو محادثة قصير
5. **سجل التغيير في `artifacts/decisions/`** بصيغة:
   ```
   artifacts/decisions/DECISION-<timestamp>-<slug>.md
   ```
6. **حدّث `progress/status.json`** فقط لو المهمة كاملة وموثقة

---

## 7. ممنوعات صريحة

- ❌ تثبيت npm packages جديدة بدون موافقة
- ❌ تعديل `package.json` بدون موافقة
- ❌ حذف ملفات
- ❌ تعديل `docs/**` بدون مهمة صريحة من المستخدم
- ❌ كتابة كود فيه `TODO` أو `placeholder` (العقد بيمنع كده — `docs/03_pipeline/03_13`)
- ❌ تنفيذ مهام موازية. مهمة واحدة في كل مرة.
- ❌ تخطي اختبار يدوي قبل الانتقال للمهمة التالية
- ❌ استخدام `console.log` دائم (للـ debug فقط، يُحذف قبل commit)

---

## 8. إجراءات الطوارئ

- **لو لقيت تعارض بين وثيقتين:** اوقف، أبلغ المستخدم، اطلب قرار.
- **لو طلب المستخدم خرق إحدى القواعد دي:** نبّهه إن ده ضد العقد، اطلب تأكيد صريح بصيغة "أنا فاهم إن ده ضد القاعدة X وأقبل المخاطرة".
- **لو مش متأكد من نية المستخدم:** اسأل قبل ما تنفذ. ممنوع الافتراض.

---

## 9. تنسيق التواصل مع المستخدم

- **لغة الرد:** عربية
- **النبرة:** مباشرة، تقنية، بدون تملق
- **عند عرض كود:** استخدم Markdown code blocks مع تحديد اللغة
- **عند عرض diff:** استخدم `--- before / +++ after` clearly
- **عند الانتهاء من مهمة:** أكتب ملخص مختصر يشمل:
  - الملفات المعدّلة
  - السلوك الجديد
  - كيفية الاختبار
  - أي مخاطر متبقية

---

## 10. نقطة البداية

أول ما تشتغل، نفّذ:
```bash
cat progress/status.json
ls artifacts/decisions/ 2>/dev/null | tail -5
node -e "console.log(require('./package.json').dependencies)"
```

ثم اطلب من المستخدم تأكيد بدء المهمة P1.

---

**END OF CLAUDE.md**
