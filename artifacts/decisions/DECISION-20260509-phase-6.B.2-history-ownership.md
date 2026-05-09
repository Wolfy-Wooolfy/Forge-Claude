# DECISION-20260509-phase-6.B.2-history-ownership

| Field     | Value                                                                          |
|-----------|--------------------------------------------------------------------------------|
| Status    | OWNER_APPROVED — 2026-05-09                                                    |
| Authored  | 2026-05-09                                                                     |
| Related   | DECISION-20260509-phase-6.B.1-conversation-assertions (FINDINGS-WARN-4)       |

---

## 1. Context

PHASE-6.B.1 logged FINDINGS-WARN-4: "conversation_history is read by
loadConversationHistory but never written by processMessage." Review prior
to PHASE-6.B.2 surfaced the actual situation — `saveContext` IS being called,
but from `apiServer.js` (4 sites), not from the engine, and via direct
`fs.writeFileSync` (bypassing L2/L3).

This phase moves history ownership into the conversation engine and routes
the writes through L2 Tool Runtime, so they are subject to L3 Permission
Policy. The scenario harness (which calls processMessage directly) gains
real history persistence under test.

---

## 2. Decision (6 Fronts)

### F1 — conversationMemoryManager.js (L2 migration)

- `writeJson` → async; uses `reg.invoke("fs.write_file", ...)` instead of
  `fs.writeFileSync`. No `ensureDir` mkdirSync — `fs.write_file` tool
  auto-creates parents (verified in PHASE-6.A).
- `saveContext` → async (was sync). Internally awaits writeJson.
- `clearContext` → async. Internally awaits writeJson.
- `loadContext` stays sync (read-only path; no L2 routing for reads).
- `getLastUserMessage`, `getLastAssistantMessage` stay sync (read-only).
- `generateContextSummary` already async; unchanged behavior.

### F2 — conversationEngine.js (history persistence + DI)

- `createConversationEngine(options)` accepts `options.conversationMemoryManager`.
  Falls back to lazy-instantiating one if not provided (backward compat;
  logs a warning on use).
- `persistTurn(projectId, userMessage, result)` helper: called AFTER the
  result object is constructed, BEFORE returning from processMessage.
  Saves user turn + assistant turn when `result.ok === true`.
- **Wrap discipline (per owner note):** wrap is on the OUTER return from
  processMessage only. Where processMessage calls `confirmTransition(...)`,
  save the awaited result, call persistTurn on it, then return it.
  confirmTransition internally calls `saveState` (project_state only,
  not history) — no double-save risk.
- Best-effort: persistTurn catches errors, sets `result.history_persisted = false`,
  does NOT fail the turn.
- Do NOT wrap: `!message` (ok:false), `!state` (ok:false), any ok:false path.
- Do NOT wrap: `confirmTransition`, `generateCheckpoint`, `getProjectSummary`
  at their own boundary — they are separate API entry points, not
  processMessage turns.

### F3 — apiServer.js (removals only + DI wire)

- Pass `conversationMemoryManager` to `createConversationEngine` at line ~74.
- Remove the 4 `saveContext` call sites (lines 3018, 3024, 3074, 3076).
- Keep `loadContext` (line 3153) and `generateContextSummary` (line 3159)
  — read endpoints, unchanged.
- No other changes to apiServer.js.

### F4 — scenario_runner.js (deferred cleanup + recursive rmSync)

- `_runConversation` moves fixture cleanup OUT of the inner `finally`.
  Instead, attaches a `_cleanup` closure to the result via
  `Object.defineProperty(..., { enumerable: false, writable: false })`.
- `_runOne` invokes `execResult._cleanup()` AFTER assertions complete,
  inside a `try/finally` wrapper so cleanup always runs even on exception.
- **Leak guard (per owner note):** `enumerable: false` prevents the `_cleanup`
  function from appearing in `JSON.stringify`. Verified post-edit by:
  `grep -rn "JSON.stringify.*execResult\|JSON.stringify.*result" verify/ code/src/testing/`
  to confirm no site bypasses enumerable filtering.
- Cleanup body: `fs.rmSync(projectDir, { recursive: true, force: true })`
  to handle the new `ai_os/` subdirectory that F2 creates.

### F5 — S11 scenario (assertion enhancement)

Add one assertion:
```json
{ "type": "artifact_exists", "path": "artifacts/projects/test_conv_s11/ai_os/conversation_context.json" }
```
Total: 7 assertions. Runs BEFORE `_cleanup` due to F4 deferred ordering.

### F6 — Documentation

- This decision artifact.
- `progress/status.json`: `current_task → PHASE-6.B.2-CLOSED`,
  `next_phase → PHASE-6.B.3`.
- Bug-9 disclosed (resolved naturally by F3).
- FINDINGS-WARN-4 status: RESOLVED.
- Exit Report.

---

## 3. Bug-9 (newly surfaced; resolved naturally)

**Title:** apiServer chat/stream saves user message before checking result.ok
**File:** `code/src/workspace/apiServer.js:~3074`
**Behavior:** `/api/ai-os/chat/stream` calls saveContext for the user message
unconditionally after processMessage, even when `result.ok === false`. Contrast
with `/api/ai-os/chat` (line ~3017) which guards on `if (result.ok && body.project_id)`.
Effect: failed turns leave orphan user-only entries in history.
**Resolution:** Naturally fixed by F3 — both paths delegate to engine, which
applies the guard uniformly via persistTurn.

---

## 4. Acceptance Criteria

1. ✓ `node bin/forge-test.js` → **13 PASS / 0 FAIL / 0 SKIP**
2. ✓ S11 has 7 assertions including `artifact_exists`, all PASS
3. ✓ `grep -E "fs\.(writeFileSync|unlinkSync|mkdirSync|rmSync)" code/src/ai_os/conversationMemoryManager.js` → **0 matches**
4. ✓ `grep "saveContext" code/src/workspace/apiServer.js` → **0 matches**
5. ✓ `grep "saveContext" code/src/ai_os/conversationEngine.js` → **≥2 matches**
6. ✓ §3.7 negative test: comment persistTurn body → S11 `artifact_exists` FAILS
7. ✓ §3.8 L3 reach: READ_ONLY mode → DENIED audit entries for conversation_context.json
8. ✓ §3.9 audit spot check: SUCCESS entries for conversation_context.json writes
9. ✓ `artifacts/projects/` has no leftover `test_conv_*` after harness
10. ✓ All 5 smoke suites still PASS
11. ✓ `grep -rn "JSON.stringify.*execResult\|JSON.stringify.*result" verify/ code/src/testing/` — no site bypasses enumerable filtering

---

## 5. Rollback Plan

```bash
git checkout HEAD~1 -- \
  code/src/ai_os/conversationMemoryManager.js \
  code/src/ai_os/conversationEngine.js \
  code/src/workspace/apiServer.js \
  code/src/testing/scenario_runner.js \
  code/src/testing/scenarios/S11_multi_turn_state_preserved.json
```

---

## 6. Risks

- **R1. apiServer wiring break.** F2 lazy-fallback logs a warning if
  memoryManager not injected. Will surface in test output.
- **R2. Cleanup ordering subtle.** F4 deferred _cleanup is the trickiest
  piece. §3.5 explicit cleanup verification after positive run.
- **R3. PROMPT-mode auto-deny.** No conversation scenario uses PROMPT mode.
  History saves would fail-silently in that mode — correct behavior.
- **R4. persistTurn best-effort.** Catches errors, sets history_persisted=false,
  does NOT fail the turn. History is best-effort under permission constraints.
- **R5. Sequential saveContext adds ~5-15ms latency per turn.** Acceptable.
- **R6. Legacy entries in conversation_context.json.** saveContext already
  handles `Array.isArray(current) ? current : []` fallback.

---

## 7. Owner Approval

Approval: **OWNER_APPROVED — "approved — ملاحظتين تاخدهم في §3: 1. في §3.2 wrap sites: ميّز بين الـ outer return من processMessage والـ inner return من confirmTransition... 2. في §3.4 deferred cleanup: تأكد بـ grep..."**
