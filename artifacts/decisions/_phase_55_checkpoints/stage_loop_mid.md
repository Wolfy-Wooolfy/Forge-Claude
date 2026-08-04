# PHASE-55 — Checkpoint C2: stage_loop_mid (after W-2, per PROMPT-STAGE-55 §3)

- Date: 2026-08-04
- Phase: PHASE-55 — HARDENING BATCH
- Decision: DECISION-2026-08-03-phase-55-hardening-batch.md (rulings R-1..R-25, errata E-1, CTO-F-A..F-E)
- GO scope honored: W-2 ONLY, test-first per R-2, predicate R-16 EXACTLY as written.
  W-3/W-4/W-5 untouched. **Cost: $0** (mock-only; zero provider calls). The W-1
  real proof remains NOT run — still awaiting the owner's separate approval.
- §ARC: **10** · L2 tools: **81** · roles: **13** — all untouched.
- Chain (all LOCAL): `eed8f30d` D0 · `88fbb36c` W-1+C1 · `<this commit>` W-2 + S385/S386
  + CTO-F-E correction + R-25/backlog artifact append + this checkpoint.
  CC pushed nothing; the owner may push independently — control point: annotated tag.

---

## 1. W-2 live-file list — confirmed BEFORE code, honored exactly

**`code/src/ai_os/conversationEngine.js` ONLY** (+22/−0, pure insertion inside the
runTests FAIL branch, after the R-10 outstanding-changes branch).
**`mvpLoopEngine.js`: ZERO touches** — `_mvpEnterOwnerReview`, `assembleMvpReport`
(FAIL_REVIEW rendering) and the legal `BUILDING → AWAITING_OWNER_REVIEW` transition
were sufficient as-is, exactly as predicted pre-code.
Test infra: `mvp_loop_test_helper.js` +171 (two new methods) + S385/S386 scenario JSONs.

**Diffstat (verbatim):**

```
 code/src/ai_os/conversationEngine.js             |  22 +++
 code/src/testing/helpers/mvp_loop_test_helper.js | 171 +++++++++++++++++++++++
 2 files changed, 193 insertions(+)
```

## 2. R-16 predicate — implemented term-for-term

| R-16 term | Where it binds |
|---|---|
| (a) `mvpLoop.isMvpEnabled(state) === true` | the existing MVP guard (unchanged) |
| (b) `status === "BUILDING"` | same guard (unchanged) |
| (c) harness verdict FAIL | the branch lives below the PASS return — FAIL region only |
| (d) `outstanding` falsy; R-10 precedence | the R-10 branch is ABOVE and returns first — its lines are untouched (the diff is pure insertion after its closing brace); S377 stays green |
| (e) `iterationCount >= 1` from the graph | the variable bound at conversationEngine.js:2314 from the SAME `orchestration.get_status` call — never `state.mvp_loop.iteration` (display echo) |

On fire: `_mvpEnterOwnerReview(pid, loopId, state, "FAIL_REVIEW", runOutput,
manifestPaths, derivedEntry, iterationCount)` — the same call and the same return
shape as the R-10 branch. `iterationCount === 0` falls through to
`orchestration.loop_back` byte-identically (S385 leg 1 + S377 leg A prove it).

**Written confirmations (R-5):** R-10 fail routing NOT redesigned (precedence + byte
identity proven above) · ITERATION_CAP untouched (conversation_graph.js:19 — no diff
line touches it) · NO new graph state · NO new mvp_loop status.

## 3. Test-first evidence (R-2) — RED then GREEN, verbatim

**RED (before the fix)** — both scenarios failing on exactly the escape surface
while the guard legs pass (`first_fail_loops_back_blind` ✓, `run_tests_endpoint_ok` ✓):

```
  ✗  S385   mvp non-convergence owner escape — second FAIL with no outstanding changes routes to the owner review gate (PHASE-55 W-2, R-16, closes PHASE-54 R-45)
         FAIL assertion [state_field_equals]: state.second_fail_routes_to_owner: expected true, got false
         FAIL assertion [state_field_equals]: state.second_fail_payload_state: expected true, got false
         FAIL assertion [state_field_equals]: state.graph_held_at_run_tests: expected true, got false
         FAIL assertion [state_field_equals]: state.iteration_not_incremented: expected true, got false
         FAIL assertion [state_field_equals]: state.block_awaiting_review: expected true, got false
         FAIL assertion [state_field_equals]: state.report_kind_fail: expected true, got false
         FAIL assertion [state_field_equals]: state.report_failing_reason_plain: expected true, got false
         FAIL assertion [state_field_equals]: state.report_summary_owner_decides: expected true, got false
  ✗  S386   mvp non-convergence owner escape crosses the REAL entry point — POST /api/ai-os/project/run-tests at iteration 1 escapes to the owner, not the blind loop (PHASE-55 W-2, R-10/S382 pattern)
         FAIL assertion [state_field_equals]: state.escaped_to_owner_review: expected true, got false
         FAIL assertion [state_field_equals]: state.payload_state_run_tests: expected true, got false
         FAIL assertion [state_field_equals]: state.not_blind_loop_back: expected true, got false
         FAIL assertion [state_field_equals]: state.graph_held_at_run_tests: expected true, got false
         FAIL assertion [state_field_equals]: state.iteration_stayed_one: expected true, got false
         FAIL assertion [state_field_equals]: state.block_awaiting_review: expected true, got false
         FAIL assertion [state_field_equals]: state.report_kind_fail: expected true, got false
```

RED-stage suite: the same run showed every other scenario green — **377 passed /
2 failed / 5 skipped (384 total)**, the two FAILs being S385+S386 (zero regressions
at the RED stage).

**GREEN (after the fix):**

```
  ✓  S375   mvp ACCEPT — provider-interpreted, deferred advance parameter-identical, ACCEPTED terminal; post-ACCEPT loop-back does NOT re-engage (PHASE-54 D4, R-7ii/R-17)
  ✓  S377   mvp RUN_TESTS FAIL routing — no outstanding owner changes: internal A-5 loop_back unchanged; outstanding changes: routes to OWNER review with plain-language failures (PHASE-54 D4, R-10)
  ✓  S378   mvp cap + UNCLEAR — REFINE at ITERATION_CAP escalates with plain-language CAP_REACHED; UNCLEAR + provider-failure stay in review with forensic history (PHASE-54 D4, R-9/R-12/R-19)
  ✓  S385   mvp non-convergence owner escape — second FAIL with no outstanding changes routes to the owner review gate (PHASE-55 W-2, R-16, closes PHASE-54 R-45)
  ✓  S386   mvp non-convergence owner escape crosses the REAL entry point — POST /api/ai-os/project/run-tests at iteration 1 escapes to the owner, not the blind loop (PHASE-55 W-2, R-10/S382 pattern)
ALL PASS — 379 passed, 0 failed, 5 skipped (384 total)
duration: 52351ms
```

**Declared count: 379 / 0 / 5 (384)** — exactly the figure the W-2 GO specified.

## 4. What S385/S386 prove

- **S385 (direct engine):** FAIL #1 at iteration 0 → blind A-5 loop_back
  byte-identical (R-16(e) false; A-5 keeps its one free repair). FAIL #2 at
  iterationCount 1 → escape: advance suppressed, `mvp_review_pending`, graph held
  at RUN_TESTS with NO increment, block AWAITING_OWNER_REVIEW, persisted
  FAIL_REVIEW report carrying the failing assertion reason verbatim ("expected 201
  but got 200") and the owner-decides Arabic summary.
- **S386 (REAL entry point, R-10/S382 pattern):** in-process workspace API server
  on a temp root; the loop seeded to RUN_TESTS/iteration 1 via the REAL
  orchestration tools (start_loop → advance → loop_back → advance — no hand-built
  graph file); then `POST /api/ai-os/project/run-tests` over live HTTP with a
  forced FAIL verdict. The escape fires through the genuine surface: payload
  `advanced:false` + `mvp_review_pending:true`, no blind loop_back, graph at
  RUN_TESTS iteration 1, block AWAITING, report FAIL_REVIEW on disk.

## 5. Honest notes for CTO

- **(a) Behavioral consequence, disclosed:** R-16(e) is `>= 1`, which includes
  iterations at or near the cap — so for flag-ON MVP builds, the runTests-side
  internal-escalation branch (the `mvp_cap_message` block at the escalated
  loop_back) is now effectively unreachable: a FAIL at ANY iteration ≥ 1 consults
  the owner BEFORE another loop_back can escalate. This is the predicate as ruled,
  and it is strictly aligned with R-9's rationale (a silent ESCALATED is a phase
  failure) — the owner can still reach CAP_REACHED via the REFINE-at-cap path,
  whose plain-language surfacing (S378) is untouched. No SU asserted the
  runTests-side cap branch for MVP builds, so no test moved; flag-OFF builds keep
  the escalation path unchanged.
- **(b) Helper direct-fs disclosure:** the S386 method writes its fixtures with
  direct `fsx` calls confined to a `mkdtemp` root — the exact S382 precedent
  (mvp_loop_test_helper:913-915); Track A on the added helper lines shows zero
  fetch/new OpenAI/child_process.
- **(c) CTO-F-E correction applied** in C1 §6 (in-place, as ordered) and recorded
  in the artifact §6.6: worst case = max(observed) $0.009665 ⇒ 0.01933% of $50 /
  0.96650% of $1.00; explicitly max(observed), not a mean.
- **(d) R-25 recorded** in the artifact (§6.6 + backlog §6.7 by name); the
  owner-facing plain-language disclosure is queued for W-5 as bound.
- **(e) Independent revertibility (R-1):** revert W-2 = delete the one inserted
  block in conversationEngine.js; S385/S386 go RED on exactly the escape
  assertions; W-1 files untouched by this leg (`git diff` scope proves no
  cross-item coupling).

## 6. Gates run (this leg)

| Gate | Result |
|---|---|
| Full SU suite | **ALL PASS — 379 / 0 / 5 (384)**, exit 0 — baseline 377 + S385 + S386, zero regressions |
| Track A (added conversationEngine lines) | **0 matches** (fetch/new OpenAI/child_process/require('fs')/fs.*Sync) |
| Track A (added helper lines) | 0 forbidden; 8 `fsx.*` on the mkdtemp temp root only (S382 precedent, disclosed above) |
| `node --check` | OK: conversationEngine.js + mvp_loop_test_helper.js |
| §ARC / L2 / roles | **10 / 81 / 13** unchanged |
| R-16(d) guard | S377 green post-fix (R-10 precedence + byte identity) · S375/S378/S381 green (terminal-ACCEPT, cap surfacing, flag-off invariance untouched) |

## STOP (HARD)

W-2 complete and gate-proven at **$0**. Awaiting: owner fresh LOCAL-folder zip →
CTO C2 verification GO → then W-3+W-4+W-5. Also still pending separately: the
owner's approval for the W-1 real proof (§7 of C1).
