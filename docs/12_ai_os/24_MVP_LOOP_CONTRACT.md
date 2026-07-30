# 24. MVP Loop Contract (PHASE-54 — Slice 1: Owner Review Loop Core)

**Document ID:** DOC-12-24
**Status:** FINAL (Slice 1) — finalized at PHASE-54 D5
**Authority:** `artifacts/decisions/DECISION-2026-07-29-phase-54-iterative-mvp-loop.md` (rulings R-1..R-22) + PROMPT-STAGE-54 §1
**Applies to:** projects with `project_state.mvp_loop.enabled = true` ONLY

---

## 1. Purpose + flag (R-1)

The MVP loop gives the owner an early, iterative review point: Forge derives a minimal
slice from the approved spec, builds+tests ONLY that slice through the EXISTING
materializer/harness path (R-2 — no parallel loop machinery), presents a plain-language
report assembled from the real harness verdicts (R-11), waits for the owner, interprets
the reply as a structured decision (R-3/R-12/R-20), threads REFINE changes into the
existing loopback rebuild (R-8), and on acceptance resumes the normal pipeline.

**Flag path:** `project_state.mvp_loop.enabled`. An ABSENT `mvp_loop` block means OFF.
Flag-off behavior is byte-identical to PHASE-53 — SU-proven at prompt level (S335 strict
string equality across arities) and end-to-end (S381: full AC set in every prompt, no MVP
annotations/markers/files/payload fields; S374 control leg: normal advance).

## 2. `mvp_loop` block schema (additive-only)

```json
"mvp_loop": {
  "enabled": true,
  "status": "INACTIVE | SCOPE_DERIVED | BUILDING | AWAITING_OWNER_REVIEW | ACCEPTED | CAP_REACHED",
  "iteration": 0,
  "mvp_scope": null,
  "feedback_history": [],
  "provider": "openai",
  "model": "gpt-4o",
  "accepted_with_failing_tests": false
}
```

- `iteration` is a **display echo** of `graph.iteration_count` — NEVER an enforcement
  source. The single cap authority is `ITERATION_CAP` in `conversation_graph.js`,
  enforced by `iteration_controller` (R-4/R-9). A second cap constant is forbidden.
- `mvp_scope`: `null` until derived; then
  `{ slice_name, acceptance_criteria_ids[], excluded_acceptance_criteria_ids[], files[], rationale }`.
- `feedback_history[]` entries: `{ at, iteration, decision, changes[] }` with
  `decision ∈ {ACCEPT, ACCEPT_WITH_FAILING_TESTS, REFINE, UNCLEAR}` (R-19/R-20);
  an ACCEPT_WITH_FAILING_TESTS entry additionally carries
  `{ report_path, failing_assertion_ids[] }` (R-20 iii).
- `provider`/`model` (optional strings): the EXPLICIT LLM config for the MVP steps.
  Wiring paths require them (or a `body.mvp_*` override) — typed `MVP_PROVIDER_REQUIRED`
  otherwise; no default fallthrough can reach a real provider (R-18).
- `accepted_with_failing_tests` (optional boolean): set ONLY on an
  ACCEPT_WITH_FAILING_TESTS exit; surfaced downstream forever (R-20 iii).
- Validation: `mvpLoopEngine.validateMvpLoopBlock` (shape) + `validateScope`
  (spec cross-check).

## 3. Status state machine (ai_os layer — R-7)

The owner-review gate is **NOT** a conversation-graph state. The graph is contract-frozen
at 17 states and boot-locked twice (count + set equality); the gate lives here:

```
INACTIVE → SCOPE_DERIVED → BUILDING → AWAITING_OWNER_REVIEW → ACCEPTED   (terminal)
                              ↑ ↺              │ ↺ (UNCLEAR self-loop, R-12/R-20 i)
                              └────── REFINE ──┘
BUILDING → CAP_REACHED / AWAITING_OWNER_REVIEW → CAP_REACHED             (terminal, R-9)
```

- **Host graph state while AWAITING_OWNER_REVIEW = `RUN_TESTS`** (R-7):
  flag ON + tests PASS ⇒ the `runTests` advance is SUPPRESSED (persist-then-BLOCK,
  `advanced:false`), and the owner-attention signal is `mvp_review_pending: true` —
  NEVER `gate_pending` (that field is bound to the Gate 1/2/3 respondGate contract).
- ACCEPT (and ACCEPT_WITH_FAILING_TESTS) ⇒ the DEFERRED advance fires,
  parameter-identical to today's runTests advance (to_state
  `REVIEWER_CODE_AND_SECURITY`, same transition_type, same role_invoked) — the flag-ON
  accept trajectory converges on the flag-off graph trajectory (R-7 ii).
- REFINE ⇒ `orchestration.loop_back` fires from `RUN_TESTS` (production-proven,
  PHASE-29 evidence) — cap-aware, no new mechanism (R-2/R-9).
- Anti-bypass lock (R-7 v): while `status === AWAITING_OWNER_REVIEW`, `reviewProject`
  returns `WRONG_STATE` (the graph never left RUN_TESTS). SU-asserted (S374).
- Transition guard is fail-closed: `assertTransition` → `MVP_INVALID_TRANSITION`.

### 3.b Slice-1 limitation — no re-engagement after ACCEPTED (R-17)

`ACCEPTED` is TERMINAL for Slice 1. Consequence, stated explicitly: if the owner later
answers Gate 2 with REJECT_AND_LOOP, the graph returns to BUILDER but the MVP loop does
NOT re-engage — that rebuild goes through the pre-PHASE-54 blind path with no owner MVP
review. Rationale: re-engagement semantics (what slice? what scope? which feedback
survives?) deserve their own decision artifact; a half-specified re-engage would be worse
than none. Guaranteed by SU (S375 R-17 leg — scoping limit in §6.b): post-ACCEPTED
loop-backs neither crash nor half-engage. Re-engagement is a later slice with its own
decision artifact.

## 4. MVP scope derivation (D2)

- Provider-driven ONLY: `reg.invoke("agent.invoke", …, { role_id: "mvp_scope" })` —
  materializer precedent; the 13-role registry does NOT grow (agent_budget_rule never
  registry-checks `ctx.role_id`).
- Schema-validated fail-closed (`validateScope`): included + excluded acceptance-criteria
  ids must **partition** the spec's AC id set (every AC accounted for exactly once — no
  silent drops); `files` is a non-empty duplicate-free subset of the spec's
  `files_to_create` paths; non-empty `slice_name`/`rationale`.
- Failure modes (all typed, never a silent fallback, never a HALT): `SPEC_INCOMPLETE`,
  `AGENT_INVOKE_ERROR`, `SCOPE_AGENT_FAILED`, `INVALID_SCOPE_JSON`, `INVALID_SCOPE`,
  `SCOPE_WRITE_FAILED`, `MVP_PROVIDER_REQUIRED`.
- Persistence: `artifacts/projects/<pid>/orchestration/<loopId>/mvp_scope.json`
  (`{ derived_at, mvp_scope }`) via L2 `fs.write_file`.
- Wiring: `designTests` pre-step derives on INACTIVE (explicit provider/model only),
  transitions INACTIVE→SCOPE_DERIVED, and threads the SCOPED spec (AC-filtered,
  files-filtered, scope text annotated `MVP slice '<name>'`) to the test_designer;
  `buildProject` threads the same scoped spec to builder + materializer and flips
  SCOPE_DERIVED→BUILDING after a successful build (S379).
- Hermeticity: SU mocks key off `SCENARIO_TAG` in the prompt (mock adapter).
- **Budget (R-18):** `deriveScope` and `interpretFeedback` default `budget_usd = 0.05`.
  Precedent: the ONLY other production `agent.invoke` caller passing `budget_usd` is the
  materializer (0.50 — full codegen, a far larger generation). A single scope derivation /
  feedback interpretation is ~$0.01–0.03, so 0.05 gives ~2–5x headroom without importing
  the codegen ceiling. Every wiring path threads provider+model EXPLICITLY (`body.mvp_*`
  or the block's fields; typed `MVP_PROVIDER_REQUIRED` when absent) — no default
  fallthrough can reach a real provider, and no SU depends on a default.

## 5. Owner review gate + report (D3 — R-7/R-11)

- Entry points: runTests PASS with an active MVP build (R-7 i), and runTests FAIL with an
  outstanding owner REFINE (R-10). Both suppress state movement, persist the report, flip
  the block to AWAITING_OWNER_REVIEW, and return
  `{ advanced: false, mvp_review_pending: true, mvp_report }`.
- Report facts are **artifact-derived with zero provider involvement** (R-11): files
  built (+count) from `build_manifest.json` paths, scenario names + pass/fail + failing
  assertion reasons verbatim from the harness run output, run instructions from the
  derived entry. The deterministic `summary_ar`/`summary_en` strings are presentation
  templates over those facts — never an interpretation. A FAIL_REVIEW summary states
  plainly that tests are failing (R-20 i). Persisted at
  `artifacts/projects/<pid>/orchestration/<loopId>/mvp_report.json`.
- Report-persist failure is fail-closed: no status flip, no advance, typed
  `MVP_REPORT_WRITE_FAILED` (retryable; graph still at RUN_TESTS).

## 6. Feedback interpretation + REFINE threading (D4 — R-8/R-10/R-12/R-19/R-20)

- The provider is the ONLY interpreter (R-12 — no `String.includes`/keyword matching;
  `_hasTransitionIntent`'s pattern must not be reused or imitated). Decisions:
  `ACCEPT` · `ACCEPT_WITH_FAILING_TESTS` · `REFINE{changes[]}` · `UNCLEAR`.
  UNCLEAR or ANY interpreter failure ⇒ clarifying question, stay in review, no state
  movement, no HALT, forensic UNCLEAR entry (R-19).
- **R-20 (named Blueprint Part D.2 exception — see the decision artifact):**
  a bare ACCEPT against a FAIL_REVIEW report downgrades to UNCLEAR with a plain-language
  warning (tests failing; accepting means proceeding with them). Advancing on failing
  tests requires the DISTINCT decision `ACCEPT_WITH_FAILING_TESTS` from an unambiguous
  owner turn; it records `{ report_path, failing_assertion_ids[] }` in feedback_history,
  sets `accepted_with_failing_tests: true`, and the marker
  `mvp_accepted_with_failing_tests: true` is carried by the reviewProject payload, the
  persisted review_report.json, and the judgeQuality (Gate-2) payload — no downstream
  stage sees a clean picture. ACCEPT_WITH_FAILING_TESTS without a FAIL_REVIEW report is
  contextually invalid ⇒ UNCLEAR. SU: S380.
- REFINE changes[] enter the materializer prompt via a DEDICATED `owner_changes` block
  (R-8): marker `OWNER REFINE REQUESTS`, structurally separate from the A-5 repair block;
  empty ⇒ byte-identical prompt; ordering when both non-empty: owner_changes FIRST,
  repair block LAST; owner_changes PERSIST across internal loopbacks
  (`mvp_owner_feedback.json`) until superseded by the owner's next review turn. SU: S376.
- Post-REFINE test failure routes to the OWNER review gate, not the blind A-5 loop
  (R-10): with outstanding owner changes, a RUN_TESTS FAIL re-presents with the failing
  assertions in plain language — the owner arbitrates their change vs the frozen test
  plan. First-build behavior (no owner changes yet) is unchanged. SU: S377.

### 6.b SU scoping limit (R-21)

S375's R-17 leg proves ONLY that mvp_loop does not re-engage after ACCEPTED (no crash, no
half-engagement; the blind internal loop-back fires). Because its fixture manifest is
hand-restored before the forced-FAIL run, it is NOT end-to-end proof of the post-ACCEPT
rebuild path on real build output. Do not cite it as such.

## 7. Iteration cap (R-9)

Owner REFINEs and internal test-failure loopbacks share the single `ITERATION_CAP = 5`
counter. `CAP_REACHED` must surface to the owner in plain language (what happened, what
they can do) — a silent ESCALATED is a phase failure. Both surfacing points are wired:
the REFINE-at-cap reply (`MVP_CAP_REACHED` mode + message) and the internal-loop
escalation (`mvp_cap_message` on the runTests payload). SU: S378.

**Known Slice-1 limitation (data-driven revisit trigger):** a flaky build can starve the
owner's REFINE budget, because internal repair loopbacks consume the same counter.
Revisit ONLY via a separate decision artifact if Gate #10 / real usage shows REFINE
starvation — never via a second cap constant.

## 8. Track A / §ARC

All side effects via `reg.invoke`; `mvpLoopEngine` performs no direct fs access.
§ARC frozen at 10 — this contract adds NO exception. Offline-safe: without provider
keys the flag-off tree is exactly PHASE-53; flag-on derivation fails typed
(`SCOPE_AGENT_FAILED`), never HALTs the flag-off path.

## 9. SU coverage (final — N = 9, S373–S381)

| SU | Proves |
|---|---|
| S373 | state model + derivation schema/partition + fail-closed legs + persistence |
| S374 | R-7 review gate on PASS + R-11 artifact-derived report + R-7(v) anti-bypass + flag-off control leg |
| S375 | R-7(ii) deferred advance + ACCEPTED terminal + R-17 no-re-engage (scoping limit §6.b) |
| S376 | R-8 threading: verbatim changes in the owner block, persistence + supersede, owner-FIRST repair-LAST |
| S377 | R-10 routing: no-changes ⇒ internal A-5 unchanged; outstanding ⇒ owner gate with plain-language failures |
| S378 | R-9 cap plain-language + no increment at cap; R-12 UNCLEAR + provider-failure; R-19 forensics |
| S379 | derivation wiring + scoped-spec threading (td/builder/materializer prompts) + R-18 explicit provider |
| S380 | R-20 both legs: bare-ACCEPT downgrade; ACCEPT_WITH_FAILING_TESTS forensic trail + downstream markers |
| S381 | R-1 flag-off E2E invariance (prompts, payloads, files, state) |

Plus the S335 extension (R-8 ii byte-identity across all arities + block ordering).

---

**END OF DOCUMENT**
