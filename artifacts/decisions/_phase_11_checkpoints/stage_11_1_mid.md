# Stage 11.1 Mid-Checkpoint — PHASE-11 Existing Project Intake

**Date:** 2026-05-15
**Stage:** 11.1 — Python Analyzer + reverseVisionProvider Implementation
**Status:** IMPLEMENTATION COMPLETE — STOP FOR GO LIVE APPROVAL

---

## Deliverables Status

| Deliverable | Description | Status |
|---|---|---|
| A | Python fixture at `artifacts/test_fixtures/intake/fixture_pycli/` | COMPLETE (prior session) |
| B | `project.analyze_source` full implementation | COMPLETE |
| C | `project.intake_zip` full implementation | COMPLETE |
| D | `reverseVisionProvider` full implementation | COMPLETE |
| E | `reverse_vision_role` full implementation | COMPLETE |
| F | S158–S162 scenarios + `intake_test_helper.js` | COMPLETE |

---

## Files Written/Modified

### New files
- `code/src/runtime/tools/intake_tools.js` — `project.intake_zip` + `project.analyze_source` L2 tools
- `code/src/providers/reverseVisionProvider.js` — LLM provider for reverse vision inference (Deliverable D)
- `code/src/runtime/agents/roles/reverse_vision_role.js` — role wrapping reverseVisionProvider (Deliverable E)
- `code/src/testing/helpers/intake_test_helper.js` — S158–S162 test driver
- `code/src/testing/scenarios/S158_intake_zip.json`
- `code/src/testing/scenarios/S159_analyze_source.json`
- `code/src/testing/scenarios/S160_reverse_vision_mock.json`
- `code/src/testing/scenarios/S161_end_to_end_mock.json`
- `code/src/testing/scenarios/S162_unsupported_language.json`

### Modified files
- `code/src/runtime/agents/_activity_catalog.js` — added `reverse_vision` activity labels

---

## Test Suite

```
ALL PASS — 157 passed, 0 failed, 5 skipped (162 total)
S158 ✓  project.intake_zip directory mode — copies fixture_pycli into project source
S159 ✓  project.analyze_source — parses fixture_pycli and returns SourceTreeAnalysis with AST samples
S160 ✓  reverse_vision_role — mock provider returns valid InferredVision with all 8 required fields
S161 ✓  intake end-to-end mock — intake_zip → analyze_source → reverse_vision_role → vision.md written unlocked
S162 ✓  project.analyze_source — Rust-only directory returns UNSUPPORTED_LANGUAGE
```

---

## Key Bugs Fixed During Implementation

1. **HARD_DENY_SYSTEM_PATH** — `permissionRules.js` blocks all Windows absolute paths. Fixed all `reg.invoke("fs.*")` calls in `intake_tools.js` to use relative paths (via `path.relative(root, absPath)`).
2. **`fs.list_dir` entry type** — registry returns `"type": "dir"` not `"type": "directory"`. Fixed `_walkDir` check.
3. **Wrong require paths** — `reverse_vision_role.js` required provider at `../../providers/` (resolves to `runtime/providers/`, non-existent); fixed to `../../../providers/`. Similarly `intake_test_helper.js` had `../agents/roles/` instead of `../../runtime/agents/roles/`.

---

## Architecture Notes

- **Track A enforced:** all fs I/O in `intake_tools.js` goes through `reg.invoke("fs.*")` with relative paths. No direct `fs.writeFileSync`.
- **Vision lock bypass (intentional):** `reverse_vision_role` calls `reverseVisionProvider.executeTask()` directly — bypasses `agent.invoke` and `agent_budget_rule` vision lock check per INTAKE_CONTRACT §5.
- **WASM lazy init:** `_langPromise` module-level cache (OQ-6/OQ-7) — `Parser.init()` called once.
- **Language matrix (§7):** Python only in Stage 11.1. `UNSUPPORTED_LANGUAGE` returned for non-Python projects (S162).

---

## Pending (requires GO LIVE approval)

- Live demo: `code/src/testing/live/stage_11_1_live_runner.js`
  - Copy `fixture_pycli` → temp project
  - Real OpenAI call via `reverseVisionProvider`
  - Kill switch at $1.50, cap $2.00
- Closure gate: final decision artifact + `progress/status.json` update

---

## Architectural Fix Applied (post-review)

**Issue identified:** `reverse_vision_role` was calling `reverseVisionProvider.executeTask()` directly, bypassing `agent.invoke` and `agent_budget_rule`. This made it the only role that didn't go through the standard budget/permission gate. The module comment cited INTAKE_CONTRACT §5 incorrectly (§5 governs vision lock semantics, not agent_budget_rule bypass).

**Fix applied:**
1. `agent_budget_rule.js` — Added vision-lock exemption for `ctx.role_id === "reverse_vision"`. Section A (vision lock) skipped; Section B (budget) still enforced.
2. `reverse_vision_role.js` — Restored to `reg.invoke("agent.invoke")` pattern (same as all other roles). Prompt built inline from source_tree. JSON response parsed and validated against OUTPUT_SCHEMA.
3. `intake_test_helper.js` — S160/S161 updated: provider cache injection removed; role called with `{ provider: "mock", model: "mock-rv", scenario_id: "S160/S161" }` so mock adapter intercepts.
4. `mock_responses.json` — Added entries for `mock|mock-rv|scenario:S160` and `mock|mock-rv|scenario:S161`.
5. `reverseVisionProvider.js` — Module comment corrected (no longer claims it bypasses agent.invoke; retained as reference implementation).
6. `INTAKE_CONTRACT §5` — Added "reverse_vision exemption in agent_budget_rule" paragraph with implementation reference.

**Verified:** S81 (VISION_NOT_LOCKED still enforced for all other roles) ✓. All 157 pass.

## STOP — Awaiting GO LIVE from owner before proceeding to live demo.
