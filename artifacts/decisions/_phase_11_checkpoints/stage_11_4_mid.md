# Stage 11.4 Mid-Checkpoint

**Date:** 2026-05-16
**Stage:** 11.4 — Intake UX + Orchestration Integration + Architectural Cleanup
**Status:** IMPLEMENTATION COMPLETE — awaiting GO LIVE authorization

---

## Deliverables Completed

### A — reverseVisionProvider v1 → v2
- `code/src/providers/reverseVisionProvider.js`: switched to `loadPrompt("reverse_vision_v2")`, version bumped to "2.0.0", `_buildUserPrompt` fully ported from role (all manifest blocks including go_mod, detected_framework)
- Equivalence test passed (13/13) before v1 deletion
- S160, S161, S166, S167, S170, S171 all green after upgrade

### B — Intake Conversation Handler (NEW FILE)
- `code/src/ai_os/intake_conversation_handler.js` (443 lines)
- State machine: AWAIT_INTAKE_TRIGGER → AWAIT_VISION_APPROVAL → APPROVED | REJECTED
- Trigger: structural signal (zip_path or directory_path), no keyword matching
- Intent classification via `IntentClassificationProvider` (injected via opts for DI)
- Edit parsing: EDIT_RE regex applied only on MODIFY intent
- All reads: direct `fs.readFileSync` | All writes: `reg.invoke("fs.write_file", ...)`

### C — State machine persistence
- `intake_state.json` written via `reg.invoke("fs.write_file", ...)` (Track A compliant)
- States: AWAIT_VISION_APPROVAL → APPROVED | REJECTED
- Auto-lock PROHIBITED: `vision.lock_vision` only called after explicit AFFIRM

### D — orchestration.start_loop intake seeding
- `code/src/runtime/tools/orchestration_tools.js`: added `owner_intent_source` parameter
- `owner_intent_source: "vision_locked_intake"` path: appends audit row OWNER_INTENT→ARCHITECT_DESIGN, sets state to ARCHITECT_DESIGN atomically
- Confirmed: audit row has all required fields per appendAuditRow contract

### E — formatVisionForChat + EDIT_RE
- `formatVisionForChat(iv)`: renders InferredVision as markdown for chat display
- `EDIT_RE = /^edit\s+(\w+(?:\.\w+)?):\s*(.+)$/i`
- Editable fields: project_name, domain, goals.primary, goals.secondary, constraints, non_goals

### F — INTAKE_CONTRACT updates
- `docs/10_runtime/20_INTAKE_CONTRACT.md`: §6 updated (owner_intent_source convention, IMPLEMENTED Stage 11.4), §10 added (Intake Conversation Flow state machine), §11 added (LLM Trace Files), footer updated to v1.1

### G — Scenario suite S172–S181
- 10 new scenario files in `code/src/testing/scenarios/`
- 10 runner functions in `code/src/testing/helpers/intake_test_helper.js`
- Mock response added for S181 in `mock_responses.json`

---

## Scenario Suite Result (initial — post-G)

```
ALL PASS — 176 passed, 0 failed, 5 skipped (181 total)
```

5 skips are docker-unavailable scenarios (S58, S62, S65, S67, S68) — unchanged from prior stages.

---

## Architectural Cleanup (Pre-Live-Demo Patch)

**Approach:** Approach 1 — mock branch moved to provider level; role reduced to single path.

### Files Changed

| File | Delta | Change |
|---|---|---|
| `code/src/providers/reverseVisionProvider.js` | +50 | Added `path` require, `_MOCK_RESPONSES_PATH` constant, `scenario_id` to INPUT_SCHEMA, canonical mock branch (~33 lines) with 12-line comment block |
| `code/src/runtime/agents/roles/reverse_vision_role.js` | −110 | Removed `loadPrompt`, `SYSTEM_PROMPT`, `_buildPrompt()` (~70 lines), `isMock`/`scenarioTag` dual-path; single `run()` path passing `scenario_id` to provider |
| `code/src/testing/helpers/intake_test_helper.js` | −35 | `runS179ProviderWritesTraceFiles` simplified: removed require.cache manipulation; now calls `provider.executeTask` directly with `context.provider = "mock"` |
| `code/src/runtime/agents/adapters/mock_responses.json` | +1 | Added `"mock|mock-rv|scenario:S179"` entry for simplified S179 runner |

Net role line count: ~155 lines (was ~265). `_buildPrompt` — **0 references** remain in reverse_vision_role.js.

### Post-Cleanup Regression Result

```
ALL PASS — 176 passed, 0 failed, 5 skipped (181 total)
```

Critical regression scenarios confirmed PASS: S160, S161, S166, S167, S170, S171 (mock-mode reverse_vision e2e), S179 (provider writes trace files), S180 (role_id propagation), S181 (full mock e2e), S81 (vision-lock for non-exempt roles).

### Track A Grep (0 violations)

Grep for `fs\.writeFileSync|fs\.unlinkSync|fs\.rmSync|new OpenAI\(\)` across all 3 modified production files:
- `reverseVisionProvider.js` — 0 matches
- `reverse_vision_role.js` — 0 matches
- `intake_test_helper.js` — 0 matches (line 6 is a comment, not code)

### `_buildPrompt` Verification

`grep -n "_buildPrompt" code/src/runtime/agents/roles/reverse_vision_role.js` → **0 matches**

---

## Architectural Constraints Verified

- ✓ Auto-lock PROHIBITED: only `_doApprove` calls `vision.lock_vision`, only after AFFIRM intent
- ✓ No String.includes() / regex on user text for intent classification: uses IntentClassificationProvider LLM
- ✓ Edit field extraction by regex only AFTER LLM returns MODIFY (two-phase)
- ✓ All state writes via `reg.invoke("fs.write_file", ...)` (Track A)
- ✓ Direct fs reads for state load (reads do not require L2 tool per §10)
- ✓ agent_budget_rule exemption: `ctx.role_id === "reverse_vision"` skips vision-lock check (S180 verifies)
- ✓ Loop starts at ARCHITECT_DESIGN when owner_intent_source=vision_locked_intake (S178 verifies)
- ✓ Mock branch at provider level (Approach 1): `context.provider === "mock"` in reverseVisionProvider handler; role has no mock knowledge
- ✓ `require(_MOCK_RESPONSES_PATH)` — Node module cache, NOT fs.readFileSync (Track A compliant)

---

## Cost

$0.00 — all implementation is mock-based. Live demo pending GO LIVE authorization.

---

## Pending: GO LIVE Authorization

**Do not proceed** until owner sends explicit: `GO LIVE Stage 11.4`

Live demo plan:
- Budget: ≤$3.00 | Kill switch: $2.25
- Expected actual: $0.10–0.30
- Target: fixture_gocli → real OpenAI call → real reverse_vision → owner approval chat → lock vision → loop at ARCHITECT_DESIGN
