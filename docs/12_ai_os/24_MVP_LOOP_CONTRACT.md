# 24. MVP Loop Contract (PHASE-54 — Slice 1: Owner Review Loop Core)

**Document ID:** DOC-12-24
**Status:** SKELETON — §1–§4 binding as written; §5–§7 semantics locked by rulings, wiring lands at D3/D4; §9 finalized at D5
**Authority:** `artifacts/decisions/DECISION-2026-07-29-phase-54-iterative-mvp-loop.md` (rulings R-1..R-15) + PROMPT-STAGE-54 §1
**Applies to:** projects with `project_state.mvp_loop.enabled = true` ONLY

---

## 1. Purpose + flag (R-1)

The MVP loop gives the owner an early, iterative review point: Forge derives a minimal
slice from the approved spec, builds+tests ONLY that slice through the EXISTING
materializer/harness path (R-2 — no parallel loop machinery), presents a plain-language
report assembled from the real harness verdicts (R-11), waits for the owner, interprets
the reply as structured ACCEPT / REFINE{changes[]} (R-3/R-12), threads REFINE changes
into the existing loopback rebuild (R-8), and on ACCEPT resumes the normal pipeline.

**Flag path:** `project_state.mvp_loop.enabled`. An ABSENT `mvp_loop` block means OFF.
Flag-off behavior is byte-identical to PHASE-53 (SU-proven invariance).

## 2. `mvp_loop` block schema (additive-only)

```json
"mvp_loop": {
  "enabled": true,
  "status": "INACTIVE | SCOPE_DERIVED | BUILDING | AWAITING_OWNER_REVIEW | ACCEPTED | CAP_REACHED",
  "iteration": 0,
  "mvp_scope": null,
  "feedback_history": []
}
```

- `iteration` is a **display echo** of `graph.iteration_count` — NEVER an enforcement
  source. The single cap authority is `ITERATION_CAP` in `conversation_graph.js`,
  enforced by `iteration_controller` (R-4/R-9). A second cap constant is forbidden.
- `mvp_scope`: `null` until derived; then
  `{ slice_name, acceptance_criteria_ids[], excluded_acceptance_criteria_ids[], files[], rationale }`.
- `feedback_history[]` entries: `{ at, iteration, decision: "REFINE"|"ACCEPT", changes[] }`.
- Validation: `mvpLoopEngine.validateMvpLoopBlock` (shape) + `validateScope` (spec cross-check).

## 3. Status state machine (ai_os layer — R-7)

The owner-review gate is **NOT** a conversation-graph state. The graph is contract-frozen
at 17 states and boot-locked twice (count + set equality); the gate lives here:

```
INACTIVE → SCOPE_DERIVED → BUILDING → AWAITING_OWNER_REVIEW → ACCEPTED   (terminal)
                              ↑ ↺              │ ↺ (UNCLEAR self-loop, R-12)
                              └────── REFINE ──┘
BUILDING → CAP_REACHED / AWAITING_OWNER_REVIEW → CAP_REACHED             (terminal, R-9)
```

- **Host graph state while AWAITING_OWNER_REVIEW = `RUN_TESTS`** (R-7 amendment):
  flag ON + tests PASS ⇒ the `runTests` advance is SUPPRESSED (persist-then-BLOCK,
  `advanced:false`), and the owner-attention signal is `mvp_review_pending: true` —
  NEVER `gate_pending` (that field is bound to the Gate 1/2/3 respondGate contract).
- ACCEPT ⇒ the DEFERRED advance fires, parameter-identical to today's runTests advance
  (to_state `REVIEWER_CODE_AND_SECURITY`, same transition_type, same role_invoked) —
  the flag-ON ACCEPT trajectory converges on the flag-off graph trajectory (R-7 ii).
- REFINE ⇒ `orchestration.loop_back` fires from `RUN_TESTS` (production-proven,
  PHASE-29 evidence) — cap-aware, no new mechanism (R-2/R-9).
- Anti-bypass lock (R-7 v): while `status === AWAITING_OWNER_REVIEW`, `reviewProject`
  returns `WRONG_STATE` (the graph never left RUN_TESTS). SU-asserted.
- Transition guard is fail-closed: `assertTransition` → `MVP_INVALID_TRANSITION`.

## 4. MVP scope derivation (D2 — delivered)

- Provider-driven ONLY: `reg.invoke("agent.invoke", …, { role_id: "mvp_scope" })` —
  materializer precedent; the 13-role registry does NOT grow (agent_budget_rule never
  registry-checks `ctx.role_id`).
- Schema-validated fail-closed (`validateScope`): included + excluded acceptance-criteria
  ids must **partition** the spec's AC id set (every AC accounted for exactly once — no
  silent drops); `files` is a non-empty duplicate-free subset of the spec's
  `files_to_create` paths; non-empty `slice_name`/`rationale`.
- Failure modes (all typed, never a silent fallback, never a HALT): `SPEC_INCOMPLETE`,
  `AGENT_INVOKE_ERROR`, `SCOPE_AGENT_FAILED`, `INVALID_SCOPE_JSON`, `INVALID_SCOPE`,
  `SCOPE_WRITE_FAILED`.
- Persistence: `artifacts/projects/<pid>/orchestration/<loopId>/mvp_scope.json`
  (`{ derived_at, mvp_scope }`) via L2 `fs.write_file`.
- Hermeticity: SU mocks key off `SCENARIO_TAG` in the prompt (mock adapter); S373.
- **Budget (R-18):** `deriveScope` and `interpretFeedback` default `budget_usd = 0.05`.
  Precedent: the ONLY other production `agent.invoke` caller passing `budget_usd` is the
  materializer (0.50 — full codegen, a far larger generation). A single scope derivation /
  feedback interpretation is ~$0.01–0.03, so 0.05 gives ~2–5x headroom without importing
  the codegen ceiling. Every wiring path threads provider+model EXPLICITLY (`body.mvp_*`
  or the block's fields; typed `MVP_PROVIDER_REQUIRED` when absent) — no default
  fallthrough can reach a real provider, and no SU depends on a default.

## 5. Owner review gate + report (D3 — SKELETON; semantics locked by R-7/R-11)

- Report facts are **artifact-derived with zero provider involvement** (R-11): files
  built (+count) from `build_manifest.json`, scenario names + pass/fail counts from the
  harness `last_report.json`, run instructions from the derived entry. A provider may
  add prose framing as an additive wrapper only. Persisted at
  `artifacts/projects/<pid>/orchestration/<loopId>/mvp_report.json`.
- Wiring, payload shape, and SU assertions land at D3 (post mid-checkpoint GO).

## 6. Feedback interpretation + REFINE threading (D4 — SKELETON; locked by R-8/R-10/R-12)

- ACCEPT/REFINE/UNCLEAR comes from structured provider output ONLY (R-12 — no
  `String.includes`/keyword matching; `_hasTransitionIntent`'s pattern must not be
  reused or imitated). UNCLEAR or provider failure ⇒ clarifying question, stay in
  review, no state movement, no HALT.
- REFINE changes[] enter the materializer prompt via a DEDICATED `owner_changes` block
  (R-8): distinct marker, structurally separate from the A-5 repair block; empty ⇒
  byte-identical prompt; ordering when both non-empty: owner_changes FIRST, repair
  block LAST; owner_changes PERSIST across internal loopbacks until superseded by the
  owner's next review turn.
- Post-REFINE test failure routes to the OWNER review gate, not the blind A-5 loop
  (R-10): with outstanding owner changes, a RUN_TESTS FAIL re-presents with the failing
  assertions in plain language — the owner arbitrates their change vs the frozen
  test plan. First-build behavior (no owner changes yet) is unchanged.

### 6.b SU scoping limit (R-21)

S375's R-17 leg proves ONLY that mvp_loop does not re-engage after ACCEPTED (no crash, no
half-engagement; the blind internal loop-back fires). Because its fixture manifest is
hand-restored before the forced-FAIL run, it is NOT end-to-end proof of the post-ACCEPT
rebuild path on real build output. Do not cite it as such.

## 7. Iteration cap (R-9)

Owner REFINEs and internal test-failure loopbacks share the single `ITERATION_CAP = 5`
counter. `CAP_REACHED` must surface to the owner in plain language (what happened, what
they can do) — a silent ESCALATED is a phase failure.

**Known Slice-1 limitation (data-driven revisit trigger):** a flaky build can starve the
owner's REFINE budget, because internal repair loopbacks consume the same counter.
Revisit ONLY via a separate decision artifact if Gate #10 / real usage shows REFINE
starvation — never via a second cap constant.

## 8. Track A / §ARC

All side effects via `reg.invoke`; `mvpLoopEngine` performs no direct fs access.
§ARC frozen at 10 — this contract adds NO exception. Offline-safe: without provider
keys the flag-off tree is exactly PHASE-53; flag-on derivation fails typed
(`SCOPE_AGENT_FAILED`), never HALTs the flag-off path.

## 9. SU coverage (finalized at D5)

S373 (delivered at D2): state model + derivation + fail-closed legs + persistence.
Planned (≥9 total per CTO §D): flag-off invariance; review-gate transition; ACCEPT;
REFINE threading evidence; cap behavior; offline/mock safety; R-7(v) anti-bypass;
R-10 post-REFINE failure routing. Exact numbering declared at D5.

---

**END OF DOCUMENT (SKELETON)**
