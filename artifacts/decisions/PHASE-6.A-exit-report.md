# PHASE-6.A Exit Report — Engine Migration Core

| Field | Value |
|---|---|
| **Phase** | PHASE-6.A |
| **Closed** | 2026-05-09 |
| **Decision** | DECISION-20260509-phase-6.A-engine-migration-core |
| **Status** | CLOSED — Closure Gate satisfied |

---

## 1. Files Modified

| File | Change |
|---|---|
| `code/src/ai_os/conversationEngine.js` | async writeJson → reg.invoke("fs.write_file"); saveState async; 5 await sites |
| `code/src/ai_os/activeProjectManager.js` | async writeJson; setActiveProject, clearActiveProject (fs.delete_file), switchProject, registerProject, ensureProjectObjectModel all async |
| `code/src/ai_os/projectRuntime.js` | async writeJson + appendArrayJson + saveProjectState; cascade to all callers (intakeProject, answerClarification, registerOptions, decideOption, saveDocumentationDraft, approveDocumentation, createExecutionHandoff, setPendingOperation, confirmPendingOperation, gated wrappers); 2 direct fs.writeFileSync replaced with reg.invoke |
| `code/src/testing/scenario_runner.js` | _normalizeConversationResult + _runConversation dispatch; removed unconditional conversation SKIP |
| `verify/smoke/test_harness_meta.js` | M5 updated: 4 SKIPs → 0 SKIPs (all conversation scenarios now dispatch) |
| `artifacts/decisions/DECISION-20260509-phase-6.A-engine-migration-core.md` | Status → OWNER_APPROVED; AC outcomes updated; FINDINGS-WARN-3 added |

---

## 2. New Behaviour

- **L2 Tool Runtime gating**: All writes in the 3 engine files now route
  through `reg.invoke("fs.write_file", ...)`. No `fs.writeFileSync` or
  `fs.unlinkSync` calls remain in the engine layer.

- **L3 Permission Policy coverage**: Conversation engine writes are now
  subject to `permissionPolicy.authorize()`. READ_ONLY mode produces
  `DENIED` entries in the audit log (confirmed §3.6).

- **Conversation dispatch wired**: `scenario_runner.js` now runs
  `type: "conversation"` scenarios via `_runConversation`. S06, S07,
  S09, S11 all execute end-to-end instead of SKIP.

- **Harness result**: 13 PASS / 0 FAIL / 0 SKIP (was 9/0/4).

---

## 3. Verification

| Check | Result |
|---|---|
| `grep fs.write* in 3 engines` | CLEAN — 0 matches |
| `node bin/forge-test.js` | 13/13 PASS |
| §3.6 READ_ONLY audit log | PASS — `{ tool: "fs.write_file", status: "DENIED", reason: "SCOPE_READ_ONLY" }` via confirmTransition |
| test_tool_runtime.js | 22/22 PASS |
| test_provider_contract_v2.js | 8/8 PASS |
| test_permission_layer.js | 14/14 PASS |
| test_doctor.js | 7/7 PASS |
| test_harness_meta.js | 13/13 PASS |

---

## 4. Known Findings

### FINDINGS-WARN-3 (raised this phase)

S06, S07, S09, S11 have `"assertions": []`. They PASS trivially via the
new conversation dispatch — the engine runs end-to-end but nothing is
asserted about the result. Integration is confirmed via audit log (§3.6)
not via scenario assertions.

**Impact**: S09 (DANGER_FULL_ACCESS + shell escalation) and S11
(multi-turn state preservation) cannot be used as regression gates until
real assertions are authored.

**Action**: Author real assertions for S06–S11 at PHASE-6.B kickoff.
Until then, regression is covered by §3.6-style audit log inspection.

### FINDINGS-WARN-1, FINDINGS-WARN-2 (carry-over from Phase 5.1)

Still open. No new information this phase.

---

## 5. Risks Remaining

- **Async cascade in apiServer.js**: callers of engine methods that are
  now async receive Promises if not awaited. Not called from apiServer.js
  directly for conversation methods (they use the engine wrapper), but
  any sync callers of `registerProject`, `decideOption`, `approveDocumentation`
  will silently drop writes. Fix in PHASE-6.C (apiServer audit).

- **state.patch not used**: state files are written via fs.write_file
  (full overwrite), not state.patch. If state.patch semantics are
  required later, migration needed.

---

## 6. Closure Gate

```
[x] node bin/forge-test.js → 13/13 PASS (0 FAIL)
[x] node verify/smoke/test_harness_meta.js → 13/13 PASS
[x] §3.6 audit log DENIED entry confirmed in READ_ONLY mode
[x] decision artifact OWNER_APPROVED
[x] progress/status.json.next_step updated → PHASE-6.B
[x] Exit Report written (this file)
```
