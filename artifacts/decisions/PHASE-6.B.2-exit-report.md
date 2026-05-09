# PHASE-6.B.2 — Exit Report

**Date:** 2026-05-09
**Decision artifact:** `artifacts/decisions/DECISION-20260509-phase-6.B.2-history-ownership.md`
**Status:** CLOSED

---

## الملفات المعدّلة

| File | Change |
|------|--------|
| `code/src/ai_os/conversationMemoryManager.js` | writeJson async via reg.invoke; saveContext + clearContext async; ensureDir/fs.writeFileSync removed |
| `code/src/ai_os/conversationEngine.js` | DI for memoryManager (getMemoryManager + lazy fallback); persistTurn helper; wrap all 8 ok:true return paths |
| `code/src/workspace/apiServer.js` | Pass conversationMemoryManager to createConversationEngine; remove 4 saveContext call sites |
| `code/src/testing/scenario_runner.js` | Pass conversationMemoryManager to createConversationEngine; deferred _cleanup via Object.defineProperty(enumerable:false); recursive rmSync |
| `code/src/testing/scenarios/S11_multi_turn_state_preserved.json` | Added artifact_exists assertion (7th assertion) |
| `artifacts/decisions/DECISION-20260509-phase-6.B.2-history-ownership.md` | Decision artifact (OWNER_APPROVED) |
| `progress/status.json` | current_task → PHASE-6.B.2-CLOSED; WARN-4 resolved; next → PHASE-6.B.3 |

---

## السلوك الجديد

**L2 routing:** `conversationMemoryManager.writeJson` يستخدم الآن `reg.invoke("fs.write_file", ...)` بدل `fs.writeFileSync` مباشرة. هذا يعني أن كل عملية كتابة للـ conversation_context.json تمر عبر L3 Permission Policy.

**Engine ownership:** `conversationEngine.processMessage` يملك الآن history persistence. كل return path بـ `ok: true` يستدعي `persistTurn` — تُسجّل رسالة المستخدم ورسالة الـ assistant في `ai_os/conversation_context.json`. الـ wrap على الـ outer return فقط؛ `confirmTransition` داخلياً يحفظ project_state لا history — لا double-save.

**apiServer simplified:** أُزيلت 4 saveContext call sites. الـ engine أصبح single source of truth للـ history.

**scenario_runner hardened:** الـ cleanup بالـ deferred pattern — assertions تشتغل قبل حذف الـ fixture. بعد assertions، `execResult._cleanup()` يُشغّل `fs.rmSync(projectDir, { recursive: true, force: true })` لمعالجة الـ `ai_os/` subdirectory.

---

## Scenarios اللي عدت

| ID | Result | Notes |
|----|--------|-------|
| S06 | PASS | 5 assertions + history write verified in audit |
| S07 | PASS | 5 assertions + history write verified in audit |
| S09 | PASS | 4 assertions + history write verified in audit |
| S11 | PASS | 7 assertions incl. artifact_exists on conversation_context.json |
| All 13 | 13 PASS / 0 FAIL / 0 SKIP | |

**Negative test verified:** تعطيل persistTurn → S11 `artifact_exists` أنتج:
`FAIL assertion [artifact_exists]: file NOT found: artifacts/projects/test_conv_s11/ai_os/conversation_context.json`
ثم revert → 13/13 PASS.

**L3 reach verified:** تشغيل conversation scenarios بـ `permission: "READ_ONLY"` أنتج:
`history persistence failed: writeJson failed [...]: SCOPE_READ_ONLY`
والـ engine يُرجع ok:true (best-effort per R4).

**Audit spot check (AC #8+9):** SUCCESS entries لـ `fs.write_file` في `**/ai_os/conversation_context.json` لكل scenario (S07: 2 entries، S09: 2 entries، S11: 4 entries للـ 2 turns).

---

## Bug-9 (resolved naturally)

`apiServer:~3074` كان يحفظ user message قبل التحقق من `result.ok` في الـ stream path — orphan entries عند failure. أُزيل في F3.

## FINDINGS-WARN-4: RESOLVED

`loadConversationHistory()` كانت دايماً ترجع فاضية لأن processMessage ما كانت تكتب. الآن كل ok:true turn يُكتب. S11 `artifact_exists` يثبت ذلك.

---

## Risks متبقية

| Risk | Status |
|------|--------|
| FINDINGS-WARN-1 (carry-over from 5.1) | Open — deferred |
| FINDINGS-WARN-2 (carry-over from 5.1) | Open — deferred |
| 13 ai_os engines remain on direct fs.* writes | Open — PHASE-6.B.3+ scope |

---

## Closure Gate

- [x] `node bin/forge-test.js` → 13 PASS / 0 FAIL / 0 SKIP
- [x] S11 has 7 assertions including artifact_exists, all PASS
- [x] AC #3: 0 direct fs.* writes in conversationMemoryManager
- [x] AC #4: 0 saveContext in apiServer
- [x] AC #5: 2 saveContext calls in conversationEngine (inside persistTurn)
- [x] AC #6: negative test verified (artifact_exists → FAIL when persistTurn disabled)
- [x] AC #7: L3 reach verified (SCOPE_READ_ONLY in audit when READ_ONLY mode)
- [x] AC #8/9: audit log has SUCCESS fs.write_file entries for conversation_context.json
- [x] AC #10: no leftover test_conv_* dirs after harness
- [x] AC #11: no JSON.stringify(*execResult|*result) sites in verify/ or code/src/testing/
- [x] All 5 smoke suites PASS
- [x] Decision artifact OWNER_APPROVED
- [x] `progress/status.json.current_task` = `PHASE-6.B.2-CLOSED`

---

## الخطوة التالية

**PHASE-6.B.3:** migrate next batch of ai_os engines (ideationEngine + 2-3 others).
انتظر prompt جديد في session جديدة.
