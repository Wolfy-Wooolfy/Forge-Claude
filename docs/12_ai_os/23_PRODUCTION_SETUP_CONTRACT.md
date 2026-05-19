# 23 — Production Setup Contract

| Field | Value |
|---|---|
| **Authority** | Layer-0 (peer to Blueprint Part A) |
| **Status** | ADOPTED — Stage 12.6 |
| **Version** | 1.0.0 |
| **Authored** | 2026-05-19 |
| **Authorization** | `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md` §2 D1–D5 |
| **Stage** | Stage 12.6 — Documentation |

> هذه الوثيقة هي المرجع المُلزِم لنشر Forge في بيئة الإنتاج الشخصية.
> أي قرار تشغيلي حول إعداد الخدمة، تخزين الأسرار، النسخ الاحتياطية،
> المراقبة، أو الأمان يخضع لهذه الوثيقة والقرارات D1–D5 المُشار إليها.
> أي تعارض بين هذه الوثيقة وأي مصدر آخر → هذه الوثيقة هي السلطة (ماعدا Blueprint Part A).

---

## 1. Authority

هذه الوثيقة هي **Layer-0 contract** للنشر الإنتاجي في Forge. وضعها في التسلسل الهرمي:

```
Blueprint Part A (frozen principles — single-owner, local-first, not SaaS)
      │
      ├── Blueprint Part B (L1-L4 runtime layers)
      ├── docs/03_pipeline/* (pipeline governance)
      ├── docs/04_autonomy/* (autonomy + permission policy)
      └── docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md  ← هذه الوثيقة
```

**التفويض:** صدر عبر `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md`
بعد موافقة صريحة من المالك على القرارات D1–D5 في 2026-05-18.

**الصلاحية:** كل تغيير في السياسة الإنتاجية (خدمة النظام، تخزين الأسرار، النسخ
الاحتياطية، المراقبة، نموذج الأمان) يستلزم قرار تعديل جديد (vision-amendment decision)
مُوثّق في `artifacts/decisions/` قبل تطبيق أي تغيير.

---

## 2. Scope

هذه الوثيقة تحكم **النشر الإنتاجي فقط** — أي تشغيل Forge كخدمة مستمرة على
جهاز شخصي مخصص للإنتاج. لا تغطي:

- إعداد بيئة التطوير (تغطيه `INSTALL.md §Quick Start`)
- اختبار الـ scenarios (يحكمه `docs/09_verify/19_FORGE_SELF_TEST_HARNESS.md`)
- إضافة features جديدة لـ Forge نفسه (يحكمه Blueprint + Roadmap)

الإنتاج يبدأ عند تشغيل Forge كـ **system service** ينشأ تلقائياً عند الإقلاع
ويُعيد التشغيل عند الانهيار.

---

## 3. Decisions D1–D5 (Binding — Owner-Ratified 2026-05-18)

القرارات التالية مُصادق عليها من المالك بتاريخ 2026-05-18 وهي مُلزِمة.
أي مراجعة تستلزم decision artifact جديدة + موافقة صريحة.

---

### D1 — Service Supervisor Strategy

**المرجع:** `DECISION-2026-05-18T11-30-phase-12-plan.md` §2 D1

**الطبقة الأولى — Primary (Windows):**
المنصة الأساسية للتحقق من الإغلاق في PHASE-12. خياران متكافئان — المالك يختار عند الإعداد:

| الخيار | الأداة | المتطلبات | الاستخدام الموصى به |
|---|---|---|---|
| **Option A** | NSSM 2.24 | يستلزم صلاحيات Administrator | للإنتاج — استعادة تلقائية غنية |
| **Option B** | Windows Task Scheduler | بدون صلاحيات إضافية (LOGON_S4U) | للأجهزة الشخصية — بدون برامج إضافية |

- NSSM: النسخة المثبّتة `2.24`، URL رسمي: `https://nssm.cc/release/nssm-2.24.zip`
- SHA-256 موثّق في `INSTALL.md §Windows Service` (محسوب في Stage 12.6)
- سكريبتات الخدمة في `scripts/service/` — ليست جزءاً من `code/src/` ولا تحتاج §ARC

**الطبقة الأولى — Ship + Review (Linux / macOS):**
- Linux: `scripts/service/forge.service` (systemd) — مراجعة صحة، بدون تحقق إقلاع في PHASE-12
- macOS: `scripts/service/com.forge.api.plist` (launchd) — نفس الوضع

**الطبقة الثانية — اختياري:**
- Docker/Podman: `scripts/service/Dockerfile` + `compose.yml` — يعتمد على `container_tools.js` من PHASE-7-C. لا سيناريو إغلاق مطلوب.

**معيار الإعادة التلقائية:** الخدمة تُعيد التشغيل خلال 10 ثوانٍ من أي انهيار. هذا قابل للتحقق بـ `kill -9` على عملية Node.js.

---

### D2 — Secret Storage Strategy

**المرجع:** `DECISION-2026-05-18T11-30-phase-12-plan.md` §2 D2

**الواجهة:** `code/src/runtime/secrets/secret_provider.js`

ترتيب الاستخدام (الأول المتاح يفوز):

| الأولوية | المزوّد | الملف | التفعيل |
|---|---|---|---|
| 1 | Windows Credential Manager | `windows_credential_manager.js` | Windows تلقائياً |
| 2 | macOS Keychain | `mac_keychain.js` | macOS تلقائياً |
| 3 | Linux Secret Service (libsecret) | `linux_secret_service.js` | Linux + libsecret |
| 4 | Encrypted File (libsodium sealed box) | `encrypted_file_provider.js` | fallback دائم |

**سياسة المرحلة الانتقالية:** `process.env` يستمر في العمل. Doctor check `secrets_in_env_var`
يُصدر WARN (ليس FAIL) عند وجود `OPENAI_API_KEY` في env **مع** توفر keychain — يحث على
الهجرة دون كسر الإعدادات الحالية.

**§ARC-5:** المزودات الأصيلة (Windows/Mac/Linux) مشمولة بـ §ARC-5 المُسجّل في
`docs/10_runtime/18_AGENT_ROLES_CONTRACT.md`. `encrypted_file_provider.js` يستخدم
L2 `fs_tools.write_file` وليس `fs.*Sync` مباشرةً.

---

### D3 — Backup Scope + Retention

**المرجع:** `DECISION-2026-05-18T11-30-phase-12-plan.md` §2 D3

**أدوات L2:** `code/src/runtime/tools/backup_tools.js` (4 tools: create / verify / export / restore)

**تنسيق الأرشيف:** `.zip` (DEFLATE عبر adm-zip)
> ملاحظة: الخطة الأصلية ذكرت `.tar.gz` — استُبدل بـ `.zip` في Stage 12.3 لتجنب
> إضافة dependency جديدة. القرار موثّق في `artifacts/decisions/DECISION-2026-05-19T08-30-phase-12-stage-12-3-closure.md`.

**قائمة الاستثناءات الافتراضية (ملزِمة):**

```js
const DEFAULT_EXCLUDE = [
  'artifacts/llm/requests/**',  // محتوى كامل للـ prompts — خطر PII
  'artifacts/llm/responses/**', // محتوى كامل للردود — خطر PII
  'artifacts/backups/**',       // منع backup داخل backup
  '.env',
  '*.env',
  'node_modules/**'
];
// artifacts/llm/metadata/** مُضمَّن في النسخة — لا PII (metadata = tokens/latency/cost فقط)
```

المالك يمكنه إضافة استثناءات عبر `FORGE_BACKUP_EXCLUDE` (لا يمكن حذف الافتراضيات).

**سياسة الاحتفاظ (grandfather-father-son):**

| الفئة | العدد |
|---|---|
| يومية | 7 |
| أسبوعية | 4 |
| شهرية | 12 |

**Doctor check:** `backup_status` — WARN إذا لم تُنشأ نسخة احتياطية منذ 7+ أيام.

---

### D4 — Monitoring Surface

**المرجع:** `DECISION-2026-05-18T11-30-phase-12-plan.md` §2 D4

**ملفات السجل:**

| الملف | المحتوى | الحجم الأقصى |
|---|---|---|
| `logs/forge.log` | INFO + WARN + ERROR | 10 MB × 5 ملفات (rotation) |
| `logs/forge.error.log` | ERROR فقط | نفس السياسة |

التنسيق: `<ISO-ts> | <LEVEL> | <message> | <JSON-context>` (§ARC-6)

**نافذة المقاييس (24 ساعة):** حقل `runtime_health.metrics_window_24h` في `progress/status.json`
يتضمن: `api_requests_total`, `api_errors_total`, `provider_calls_total`, `provider_cost_usd`,
`backup_last_created_ts`, `backup_last_verified_ts`.

**Doctor endpoint:**
- CLI: `node bin/forge-doctor.js` (exit 0 = سليم، exit 1 = فشل)
- HTTP: `GET /api/system/doctor` (معفى من المصادقة)

**التنبيهات:** معطّلة افتراضياً. تُفعَّل بـ `FORGE_ALERT_WEBHOOK_URL`.
الأهداف المدعومة: Discord webhook، Slack incoming webhook، SMTP.
الـ payload يُرسَل عند انتقال أي Doctor check إلى FAIL.

---

### D5 — Security Baseline

**المرجع:** `DECISION-2026-05-18T11-30-phase-12-plan.md` §2 D5
**التنفيذ:** Stage 12.5 (CLOSED 2026-05-19)

**ربط الشبكة:**
الخادم يربط على `127.0.0.1` افتراضياً. تغيير عبر `FORGE_BIND_HOST` مع تسجيل WARN.
`web/` **لا يجوز** تقديمها عبر أي خادم HTTP خارجي.

**رمز القدرة (Capability Token):**
- 32-byte cryptographically random، يُولَّد عند كل تشغيل
- مطلوب على جميع endpoints كـ `Authorization: Bearer <token>`
- ما عدا: `GET /api/system/health` و`GET /api/system/doctor`
- يُحقَن في `web/.forge-session` (سطر حارس + JSON)
- `apiServer.js` يحجب أي طلب لـ `**/.forge-session` بـ HTTP 404

**تثبيت هوية المستخدم (UID Pinning):**
- عند أول تشغيل: تُسجَّل هوية المستخدم في `progress/uid_pin.json`
- عند التشغيلات التالية: مقارنة الهوية — رفض FAIL_CLOSED عند التعارض
- Doctor check: `uid_pin_match`

**Doctor checks المُضافة في Stage 12.5:**
`api_binding`, `api_auth_token`, `uid_pin_match`

---

## 4. Compliance Gates

يُعدّ النشر الإنتاجي **مُتوافقاً مع هذه الوثيقة** عند تحقق **جميع** الشروط التالية:

| # | الشرط | طريقة التحقق |
|---|---|---|
| 1 | `forge-doctor` يخرج بـ exit 0 | `node bin/forge-doctor.js` — كل checks PASS أو WARN (لا FAIL) |
| 2 | الأسرار ليست في ملف `.env` نصّ صريح مع توفر keychain | Doctor check `secrets_in_env_var` = PASS (لا WARN). إذا ظلّ WARN بعد الهجرة → راجع §Secret Storage في `INSTALL.md` |
| 3 | النسخ الاحتياطية تعمل + تحقق الاستعادة مرة واحدة على الأقل | `backup.create` تُنتج archive صالحاً → `backup.verify` = ok → `backup.restore` على نسخة اختبارية + `forge-doctor` exit 0 بعدها |
| 4 | الخدمة تُعيد التشغيل تلقائياً عند الانهيار | تنفيذ `kill -9` على عملية Node.js → الخدمة تُعيد الإقلاع خلال 10 ثوانٍ → Doctor check `recent_execution` = PASS |

**تنبيه:** الشرط 2 يُقيّم بعد منح فترة زمنية كافية لإتمام هجرة الأسرار إلى keychain.
النشر الجديد يجب أن يستوفي الشرط 2 فور الإعداد.

---

## 5. Out of Scope

ما يلي خارج نطاق هذه الوثيقة وخارج نطاق Forge كليّاً في إصداره الحالي:

- **Multi-tenant deployment** — Forge مصمّم لمالك واحد. لا مستخدمون متعددون، لا فصل بيانات.
- **Cloud orchestration** — لا Kubernetes، لا ECS، لا Nomad. Forge يعمل كعملية Node.js واحدة.
- **High Availability / Failover** — لا primary/replica، لا health check endpoints للـ load balancer، لا blue/green.
- **Multi-machine deployment** — خادم واحد، قاعدة بيانات محلية (LanceDB)، ملفات محلية.

**المبدأ المُثبَّت (Blueprint Part A §1):**
> "Forge is a personal AI Operating System for building software projects.
> **Single-owner, local-first, not SaaS, not multi-tenant.**"

أي طلب يتعارض مع هذا المبدأ يستلزم vision-amendment decision يُعدَّل فيه Blueprint Part A
أولاً — وهو قرار خارج نطاق PHASE-12.

---

## 6. Relationship to Other L0 Contracts

| الوثيقة | العلاقة |
|---|---|
| `architecture/FORGE_V2_BLUEPRINT.md` Part B (L1-L5) | النشر الإنتاجي يستهلك L4 (Doctor) كبوابة صحة. كل Doctor check من §4 يستند إلى L4. |
| `docs/10_runtime/12_DOCTOR_CONTRACT.md` | المراقبة الإنتاجية تمتد checks الـ Doctor — جميع الـ 34 check مُسجَّلة في `_registry.js`. §4 Compliance Gate #1 يعتمد مباشرةً على Doctor Contract. |
| `docs/04_autonomy/08_PERMISSION_POLICY_CONTRACT.md` | النشر الإنتاجي يعمل في وضع `WORKSPACE_WRITE` افتراضياً. `backup.restore` يستلزم `DANGER_FULL_ACCESS`. جميع L2 tool calls تمر عبر `permissionPolicy.authorize()`. |

---

## 7. Amendment Process

أي تعديل على هذه الوثيقة يستلزم:

1. قرار تعديل موثّق في `artifacts/decisions/DECISION-<ts>-production-contract-amendment-<slug>.md`
2. موافقة صريحة من المالك في chat
3. تحديث حقل `Version` في هذه الوثيقة
4. تحديث `progress/status.json` إن اقتضى الأمر

تعديل القرارات D1–D5 يستلزم نفس الإجراء + إشارة صريحة إلى القرار الأصلي.

---

## 8. Cross-references

| المستند | الصلة |
|---|---|
| `INSTALL.md` | الدليل التطبيقي لتنفيذ هذه الوثيقة على كل منصة |
| `DECISION-2026-05-18T11-30-phase-12-plan.md` | مصدر القرارات D1–D5 الأصلية |
| `DECISION-2026-05-18T12-00-roadmap-phase-12-amendment.md` | تعديل الـ roadmap (Windows Tier-1، نطاق الأمان) |
| `code/src/runtime/secrets/secret_provider.js` | تنفيذ D2 |
| `code/src/runtime/tools/backup_tools.js` | تنفيذ D3 |
| `code/src/runtime/logging/log_writer.js` | تنفيذ D4 (§ARC-6) |
| `code/src/runtime/production/uid_pin.js` | تنفيذ D5 (UID Pinning) |
| `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC | §ARC-5 (secret storage) + §ARC-6 (log writer) |

---

**END OF CONTRACT v1.0.0**
