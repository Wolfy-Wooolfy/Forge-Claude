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

## 5. خريطة الـ Phases الحالية

> Phase 0 (Foundation Repair) **خلصت**. التركيز الآن على Lean v2 path.
> المرجع الكامل: `architecture/FORGE_V2_PHASE_ROADMAP.md`.

### الـ Phases المعتمدة (Lean v2 path)

| Phase | الحالة | الفصل الموجز |
|---|---|---|
| PHASE-0 | CLOSED | Foundation Repair (4 fixes) |
| PHASE-0.5 | NEXT | Contradiction sweep على docs/12_ai_os/ + 04_autonomy/ + 11_ai_layer/ |
| PHASE-1 | PENDING | Provider Contract v2 |
| PHASE-2 | PENDING | Tool Runtime Layer |
| PHASE-3 | PENDING | Permission/Safety Layer (incl. Module Audit) |
| PHASE-4 | PENDING | Doctor / Health |
| PHASE-5 | PENDING | Self-Test Harness (chat + tool calling) |
| PHASE-5.1 | PENDING | Complexity Review checkpoint |
| 🏁 **Lean v2 Exit** | — | نقطة توقف اختيارية. PHASE-6+ تحتاج قرار جديد |

### بعد Lean v2 Exit (اختياري — يحتاج قرار صريح)

| Phase | الفصل |
|---|---|
| PHASE-6 | apiServer migration (incl. Endpoint Audit) |
| PHASE-7 | Vision Authority System |
| PHASE-8 | Built-Project Test Harness |
| PHASE-9 | Knowledge Base & Research |
| PHASE-10 | Frontend Refactor (React) |
| PHASE-11 | Existing Project Intake |
| PHASE-12 | Personal Production Setup |

### قاعدة الانتقال

كل phase prompt بيوصل في session منفصل. قبل ما تبدأ، شغّل:

```bash
node bin/forge-doctor.js   # لازم exit 0 (متاح بعد PHASE-4)
node bin/forge-test.js     # لازم all PASS أو SKIP (متاح بعد PHASE-5)
cat progress/status.json   # تأكد إن next_step بيشير للـ phase الصح
```

لو في حاجة واحدة فشلت — **ما تبدأش الـ phase**. أبلغ المستخدم.

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

أول ما تشتغل في أي session جديدة:

```bash
# 1) صحة النظام (متاح بعد PHASE-4)
node bin/forge-doctor.js

# 2) صحة الـ regressions (متاح بعد PHASE-5)
node bin/forge-test.js

# 3) الحالة الحالية
cat progress/status.json

# 4) آخر القرارات
ls -t artifacts/decisions/ | head -5
```

ثم **لو ما عندكش phase prompt صريح من المستخدم**، ما تبدأش. اطلب منه يبعت phase prompt من `architecture/FORGE_V2_PHASE_ROADMAP.md`.

**Interim period (قبل PHASE-4):** الكوماندز `bin/forge-doctor.js` مش موجود. استبدله بـ:
```bash
node -e "require('./code/src/orchestrator/runner.js')"
```

---

## 11. قواعد Forge v2.0 (Runtime Layers + Closure Gate)

> هذه القواعد إضافية على القواعد الذهبية في §3. صدرت بقرار `DECISION-20260508-phase-0-closure-and-blueprint-prep.md`.

### 11.1 Runtime Layers Authority

أي تعديل على Forge بعد PHASE-1 لازم يحترم الـ 4 layers:

1. **L1 — Provider Contract v2:** أي LLM call يمر عبر `code/src/providers/_contract/`. مممنوع `new OpenAI()` خارج `_contract/openAiAdapter.js`.
2. **L2 — Tool Runtime:** أي side effect (write/shell/http/state mutation) يمر عبر Tool مسجّل في `code/src/runtime/tools/`. ممنوع `fs.writeFileSync` مباشر خارج الـ tools.
3. **L3 — Permission Policy:** كل Tool execution لازم يعدى على `permissionPolicy.authorize()`. ممنوع bypass.
4. **L4 — Doctor:** كل feature جديدة تحتاج check واحد على الأقل في `code/src/runtime/doctor/checks/`.

### 11.2 Closure Gate (إجباري لكل phase)

ما يوجد phase "نص خلصت". الـ phase بتكون مكملة **لو** الشروط دي كلها تتحقق:

```
[ ] node bin/forge-doctor.js → exits 0
[ ] node bin/forge-test.js → all baseline scenarios PASS or SKIPPED (none FAIL)
[ ] decision artifact مسجّل في artifacts/decisions/ بـ owner approval موثّق
[ ] progress/status.json.next_step بيشير للـ phase اللي بعدها
[ ] Exit Report مكتوب للمستخدم (الملفات، السلوك، الـ scenarios، الـ risks)
```

أي شرط ما اتحققش → الـ phase بتفضل مفتوحة. ممنوع نقل `current_task` لـ phase جاية قبل اكتمال الكل.

### 11.3 Lean v2 Exit (نقطة توقف اختيارية)

بعد PHASE-5.1 (Complexity Review) يوجد **Lean v2 Exit Point**. PHASE-6 إلى PHASE-12 **مش تلقائية**. كل واحدة تحتاج:

- decision artifact جديد
- موافقة المستخدم الصريحة في chat
- تحديث `progress/status.json.lean_v2_exit_status` من `"AT_EXIT"` إلى `"CONTINUING_TO_PHASE_<N>"`

افتراض إن المشروع هيكمل لـ PHASE-12 = خرق للقاعدة دي.

### 11.4 ممنوعات Forge v2.0

إضافة على §7:

- ❌ `String.includes()` أو regex على نص المستخدم لتصنيف نية أو حاجة (مش بس domain)
- ❌ `fs.writeFileSync` / `fs.unlinkSync` / `fs.rmSync` مباشر خارج `code/src/runtime/tools/fs_tools.js`
- ❌ `new OpenAI()` خارج `code/src/providers/_contract/openAiAdapter.js`
- ❌ صياغة "scenario" بـ assertions فعلها "هل الرد كويس". الـ assertions لازم تكون deterministic (`tool_called`, `state.equals`, `count`, ...)
- ❌ تخطي Closure Gate ولو من "تجربة سريعة"
- ❌ تعديل أكثر من ملف واحد في turn واحد بدون تسجيل diff واضح

### 11.5 Test-First Discipline

أي feature جديدة، الترتيب الإجباري:

1. اكتب الـ scenario(s) في `code/src/testing/scenarios/` **قبل** الكود.
2. شغّل `node bin/forge-test.js <scenario_name>` → لازم يفشل (scenario red).
3. اكتب الكود.
4. شغّل scenario → لازم يعدّل (green).
5. شغّل full suite → لازم all pass.
6. سجّل decision artifact.

ممنوع كتابة الكود الأول.

### 11.6 Built-Project Test Discipline

لما Forge بيبني مشروع للمستخدم (Stage C):

- قبل أي كود يتولّد، `projectTestPlanProvider` بيقترح scenarios.
- المستخدم بيوافق.
- بعد كل module من الكود، الـ scenarios بتشتغل.
- module ما بيتم mark له COMPLETE إلا لو scenarios بتاعته PASS.
- ممنوع تخطي ده.

---

**END OF CLAUDE.md**
