# PHASE-6.B.3 — Exit Report

**Date:** 2026-05-09
**Decision artifact:** `artifacts/decisions/DECISION-20260509-phase-6.B.3-engine-migration.md`
**Status:** CLOSED

---

## الملفات المعدّلة

| File | Change |
|------|--------|
| `code/src/ai_os/ideationEngine.js` | writeJson async via reg.invoke; appendArrayJson async; ensureDir removed; 5 write sites wrapped in tryWriteJson/tryAppendArrayJson; getDefaultRegistry imported |
| `code/src/ai_os/businessAnalysisEngine.js` | Same pattern; ensureDir removed; single write site (W6) wrapped in tryAppendArrayJson |
| `code/src/testing/mock_openai_service.js` | Added content mode: _buildContentResponse; _buildResponse renamed to _buildToolCallResponse; dispatch in _handle on mockEntry.content |
| `code/src/testing/scenario_runner.js` | Added _normalizeEngineResult + _runDirectEngine + dispatch in _runOne; resetDefaultPolicy() fix |
| `code/src/testing/scenarios/S14_ideation_provider_returns_expansion.json` | New direct_provider scenario (3 assertions) |
| `code/src/testing/scenarios/S15_ideation_engine_persists_log.json` | New direct_engine scenario (4 assertions incl. artifact_exists) |
| `code/src/testing/scenarios/S16_business_analysis_persists_log.json` | New direct_engine scenario, content mode mock (4 assertions incl. artifact_exists) |
| `artifacts/decisions/DECISION-20260509-phase-6.B.3-engine-migration.md` | Decision artifact (OWNER_APPROVED) |
| `progress/status.json` | current_task → PHASE-6.B.3-CLOSED; next → PHASE-6.B.4 |

---

## السلوك الجديد

**ideationEngine L2:** كل writes في `expandIdea` و `conductResearch` تمر عبر `reg.invoke("fs.write_file", ...)` → L3 Permission Policy. `tryWriteJson`/`tryAppendArrayJson` wrappers تضمن best-effort (failure يُسجّل كـ warn ولا يُفشّل الـ turn). R3 ordering محفوظ: W3 (domain pivot state) awaited قبل W4 (IDEA_EXPANSION log) بترتيب sequential.

**businessAnalysisEngine L2:** Write site واحد (W6، `business_analysis_log.json`) مغلّف بـ `tryAppendArrayJson`.

**MockOpenAiService content mode:** `mockEntry.content` (object) → `_buildContentResponse` → `choices[0].message.content = JSON.stringify(content)`, `tool_calls: []`, `finish_reason: "stop"`. يدعم providers التي تستخدم `response_format: json_object` (كـ businessAnalysisProvider).

**direct_engine scenario type:** `_runDirectEngine` يُنشئ fixture من `scenario.fixture`، يُشغّل engine method مباشرة، يدعم mock (tool_calls + content modes)، deferred cleanup بـ `enumerable: false`. `_normalizeEngineResult`: `Object.assign({ defaults }, raw || {})` — defaults أولاً، raw يـ override.

**Bug Fix (resetDefaultPolicy):** `getDefaultPolicy()` singleton كانت تُعيد نفس الـ policy بغض النظر عن `FORGE_PERMISSION_MODE` المُعيّن. Fix: `_runDirectEngine` يستدعي `resetDefaultPolicy()` مع `resetDefaultRegistry()` في البداية والنهاية — تضمن re-creation بالـ mode الصحيح لكل scenario.

---

## Scenarios التي عدت

| ID | Result | Notes |
|----|--------|-------|
| S14 | PASS | direct_provider → ideationExpansionProvider returns tool_call shape |
| S15 | PASS | direct_engine → ideation_log.json موجود بعد expandIdea |
| S16 | PASS | direct_engine (content mode mock) → business_analysis_log.json موجود |
| All 16 | 16 PASS / 0 FAIL / 0 SKIP | |

**Negative test (AC #13):** تعطيل W4 (appendArrayJson لـ ideation_log) → S15 `artifact_exists` أنتج:
`FAIL assertion [artifact_exists]: file NOT found: artifacts/projects/test_engine_s15/ai_os/ideation_log.json`
ثم revert → 16/16 PASS. ✓

**L3 reach test (AC #14):** S15 بـ `permission: "READ_ONLY"` بعد fix الـ resetDefaultPolicy أنتج:
`[ideationEngine] append warn: writeJson failed [...]: SCOPE_READ_ONLY: READ_ONLY mode cannot write to 'artifacts/projects/test_engine_s15/ai_os/ideation_log.json'`
والـ artifact_exists assertion أنتج FAIL. ثم revert → 16/16 PASS. ✓

---

## Bug مكتشف أثناء التنفيذ

**policy-singleton leakage:** قبل fix الـ `resetDefaultPolicy()`, كانت `installDefaultPolicy` تُعيد الـ singleton policy القديمة — فـ S15 بـ READ_ONLY كان يمرّر artifact_exists لأن الـ policy كانت لا تزال WORKSPACE_WRITE من test سابق. Fix: `resetDefaultRegistry()` + `resetDefaultPolicy()` معاً في بداية ونهاية `_runDirectEngine`.

---

## Risks متبقية

| Risk | Status |
|------|--------|
| FINDINGS-WARN-1 (carry-over from 5.1) | Open — deferred |
| FINDINGS-WARN-2 (carry-over from 5.1) | Open — deferred |
| Remaining ai_os engines on direct fs.* | Open — PHASE-6.B.4 scope |
| _runConversation has same policy-singleton gap | Low risk (all conversation tests use WORKSPACE_WRITE — gap not observable). Document for PHASE-6.B.4 |

---

## Closure Gate

- [x] `node bin/forge-test.js` → 16 PASS / 0 FAIL / 0 SKIP
- [x] AC #1/2: 0 fs.writeFileSync/mkdirSync in ideationEngine + businessAnalysisEngine
- [x] AC #3: reg.invoke("fs.write_file") in both engines
- [x] AC #4: ensureDir removed from both engines
- [x] AC #5: R3 ordering preserved (W3 sequential before W4)
- [x] AC #6: 5 write sites in ideationEngine → tryWriteJson/tryAppendArrayJson
- [x] AC #7: 1 write site in businessAnalysisEngine → tryAppendArrayJson
- [x] AC #8: MockOpenAiService supports content mode via mockEntry.content
- [x] AC #9: _runDirectEngine + _normalizeEngineResult in scenario_runner.js
- [x] AC #10-12: S14/S15/S16 all PASS
- [x] AC #13: Negative test verified (artifact_exists → FAIL when appendArrayJson disabled)
- [x] AC #14: L3 reach verified (SCOPE_READ_ONLY + artifact_exists FAIL in READ_ONLY mode, after resetDefaultPolicy fix)
- [x] AC #15: No leftover test_engine_* dirs after harness
- [x] Decision artifact OWNER_APPROVED
- [x] `progress/status.json.current_task` = `PHASE-6.B.3-CLOSED`

---

## الخطوة التالية

**PHASE-6.B.4:** migrate remaining ai_os engines (documentationReviewEngine, verificationLoop, projectReviewEngine, deliveryPackageBuilder, etc.).
انتظر prompt جديد في session جديدة.
