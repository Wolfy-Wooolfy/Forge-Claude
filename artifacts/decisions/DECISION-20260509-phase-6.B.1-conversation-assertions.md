# DECISION-20260509-phase-6.B.1-conversation-assertions

| Field     | Value                                                                     |
|-----------|---------------------------------------------------------------------------|
| Status    | OWNER_APPROVED — 2026-05-09                                               |
| Authored  | 2026-05-09                                                                |
| Related   | DECISION-20260509-phase-6.A-engine-migration-core (FINDINGS-WARN-3)      |

---

## 1. Context

PHASE-6.A wired the `conversation` scenario dispatch in `scenario_runner.js`.
S06/S07/S09/S11 flipped from SKIP to PASS — but with `assertions: []`.
They PASS trivially. PHASE-6.B.1 authors real assertions for each, and fixes
two enabling bugs in the runner that surfaced during review.

---

## 2. Decision (3 Fronts)

### F1 — scenario_runner.js (runtime fix, ~30 lines net)

**Action A (Bug-8 fix):** `_normalizeConversationResult` currently hardcodes
`status: "PASS"` at line 94. Change to:
- `status = "PASS"` if `raw && raw.ok === true`
- `status = "FAIL"` otherwise (raw missing, raw.ok=false, exception)

This makes `status_equals: "PASS"` actually test something. Without this,
all subsequent assertion work is theater.

New shape:

```js
function _normalizeConversationResult(raw, audit) {
  const ok = !!(raw && raw.ok);
  return {
    status: ok ? "PASS" : "FAIL",
    output: {
      response:   (raw && raw.message) || "",
      tool_calls: [],
      state: {
        ok,
        mode:          (raw && raw.mode)          || "UNKNOWN",
        current_state: (raw && raw.current_state) || null,
        project_id:    (raw && raw.project_id)    || null,
        reason:        (raw && raw.reason)        || null,
        turn_count:    (raw && raw.turn_count)    || 1
      }
    },
    audit: audit || []
  };
}
```

**Action B (turns support):** `_runConversation` reads `scenario.input.message`
only (line 293). Extend to detect `scenario.input.turns` (array of
`{ role: "user", message: string }`) and:
1. Create the project_state fixture once (before any turn).
2. Loop turns sequentially, calling `engine.processMessage` for each user-role turn.
3. Persist the fixture across turns (do NOT delete between turns).
4. Cleanup the fixture after all turns complete.
5. Return a synthesized `raw` shape: `ok` = AND of all turn `ok` values;
   `mode` = last turn's mode; `current_state` = last turn's state;
   `project_id` stable; plus a new `turn_count` field with the count.
   The audit log accumulates naturally because `since_ts` is set before
   the first turn.

If both `input.message` and `input.turns` are present → use `turns`, ignore
`message`. If neither → `raw = { ok: false, mode: "BLOCKED", reason: "NO_INPUT" }`.

### F2 — Scenario assertions (4 files, ~80 lines net)

| Scenario | Decision                                                                  |
|----------|---------------------------------------------------------------------------|
| **S06**  | Keep name/input. Add `permission: "WORKSPACE_WRITE"`. 5 assertions.      |
| **S07**  | Rename + repurpose. New name: "conversation turn falls back gracefully when provider has no API key". 5 assertions on actual behavior. |
| **S09**  | Rename + repurpose. New name: "DANGER_FULL_ACCESS does not change conversation engine output shape". 4 assertions. |
| **S11**  | Keep name/input. Add `permission: "WORKSPACE_WRITE"`. 6 assertions on state + turn_count. |

Rationale for rename (S07, S09): The original scenario names described
aspirational behavior that doesn't exist and would violate C-2 (no
keyword-driven tool dispatch from natural language). Renaming makes the
regression suite truthful. Filenames stay (S07_*, S09_*) to avoid file churn.

### F3 — Documentation

- This decision artifact.
- `progress/status.json`: `current_task → PHASE-6.B.1-CLOSED`,
  `next_phase → PHASE-6.B.2`.
- Bug-8 disclosed below.
- FINDINGS-INFO-1: S07/S09 rename rationale.
- FINDINGS-WARN-4: conversation_history is read by `loadConversationHistory()`
  but never written by `processMessage`. Address in PHASE-6.B.2.

---

## 3. Bug-8 (newly surfaced)

**Title:** scenario_runner conversation status hardcoded to "PASS"
**File:** `code/src/testing/scenario_runner.js:94` (`_normalizeConversationResult`)
**Behavior:** Returns `status: "PASS"` regardless of `raw.ok`. Any
`status_equals: "PASS"` assertion against a conversation result is a no-op.
Combined with the empty-assertions hazard (FINDINGS-WARN-3), S06/S07/S09/S11
had **two** layers of silent passing.
**Surfaced by:** PHASE-6.B.1 review prior to writing real assertions.
**Fix:** Action A above. Verified by negative test (§3.5).

---

## 4. Acceptance Criteria

1. ✓ `node bin/forge-test.js` → **13 PASS / 0 FAIL / 0 SKIP**
2. ✓ S06, S07, S09, S11 each have ≥4 assertions and 0 unknown types
3. ✓ `_normalizeConversationResult` honors `raw.ok` (Bug-8 fix)
4. ✓ `_runConversation` supports `input.turns` array
5. ✓ Negative test (§3.5): assertion failure produces FAIL, not PASS
6. ✓ `node verify/smoke/test_harness_meta.js` → all PASS
7. ✓ All 5 smoke suites still PASS
8. ✓ §3.7 audit-log spot check: S11 audit slice is empty or contains only
   fixture-cleanup writes (fs.delete_file / rmdirSync). Zero engine-initiated
   fs.write_file entries expected — the engine takes the "All other states"
   branch and produces no tool side-effects under DISCUSSION state.

---

## 5. Rollback Plan

```bash
git checkout HEAD~1 -- \
  code/src/testing/scenario_runner.js \
  code/src/testing/scenarios/S06_full_conversation_turn.json \
  code/src/testing/scenarios/S07_conversation_with_tool_use.json \
  code/src/testing/scenarios/S09_danger_mode_allows_shell.json \
  code/src/testing/scenarios/S11_multi_turn_state_preserved.json
```

---

## 6. Risks

- **R1. Renaming S07/S09 invalidates aspirational coverage.** Mitigation:
  FINDINGS-INFO-1 explicitly says "if true tool-from-conversation dispatch
  becomes a feature, write new scenarios; don't repurpose these."
- **R2. turns support changes audit semantics.** `since_ts` is set before
  turn 1, so the audit slice naturally covers the whole run. No semantic
  change for single-turn scenarios.
- **R3. Negative test temporarily breaks the suite.** The negative test is
  a single edit-run-revert cycle inside §3.5, uncommitted. Before the final
  commit, `git diff` must be empty (no staged or unstaged changes from the
  negative-test edit remain).
- **R4. Bug-8 fix may surface latent failures in OTHER conversation paths.**
  Today there are only 4 conversation scenarios, all owned by this phase.
  So no external surface.

---

## 7. Owner Approval

Approval: **OWNER_APPROVED — "approved — تأكد إن AC #8 بيوضح إن audit slice لـ S11 المتوقع يكون فاضي أو cleanup writes فقط (مش engine writes)، و R3 بيشترط `git diff` فاضي قبل الـ commit. لو موجودين، كمل §3. لو ناقصين، عدّلهم وكمل بدون انتظار."**
