# DECISION-2026-06-04 — PHASE-22: Spec-Writer Bridge (second orchestration state)

> **Status:** APPROVED — owner go on 2026-06-04 ("فوانس على توصيتك طالما باعتماد درجات الاحترافية").
> **Type:** Phase plan / authorization artifact (precedes build).
> **Authored by:** CTO advisor. Verified independently from disk against the PHASE-21-CLOSED build.
> **Builds on:** PHASE-20 (vision→pipeline bridge + architect sync). Does NOT amend the Blueprint, the state machine table, the spec_writer role, or any §ARC.

---

## §1 Goal

Wire the **`spec_writer`** role into the orchestration loop — the state immediately after the architect.
Same pattern as PHASE-20, one transition only:

```
SPEC_WRITER_FORMALIZE  →  REVIEWER_SPEC      (trigger: role.invoke(spec_writer) → SUCCESS)
```

After PHASE-20 the loop is parked at `SPEC_WRITER_FORMALIZE` with the architect design persisted and
shown in the UI. PHASE-22 adds the driver that runs `spec_writer`, persists its output, advances the
state to `REVIEWER_SPEC`, and renders the spec in the UI. The role itself already exists and is tested
(S86 / S87 / S88) — this phase only connects it to the flow.

## §2 Settled decisions (do not re-litigate)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Trigger model = Option B (separate continuation step), NOT chained into confirmIdea.** A new endpoint `POST /api/ai-os/project/formalize-spec` drives the spec_writer step. confirmIdea is unchanged — it still ends at the architect design. | Gives the non-technical owner a review beat between "كيا تصميم نظامي" and "كيا المواصفات"; keeps each HTTP turn to a single ~30s sync LLM call instead of two stacked; lets PHASE-23 (reviewer) wire in by the same pattern. Aligns with the Iterative Build Loop philosophy (Blueprint Part B-2). |
| D2 | **spec_writer provider is passed explicitly: `openai` in production, `mock` in tests.** The wiring overrides the role's `default_provider: "anthropic"`. | `ANTHROPIC_API_KEY` is not in `.env`; the architect already runs on `openai/gpt-4o` as the owner's temporary decision. spec_writer must mirror it or Gate #10 breaks. Temporary — flips to anthropic when the project is complete, same as the architect. |
| D3 | **`design` input for spec_writer is read from disk** (`orchestration/${loopId}/architect_design.json`), not from the request body. | Single source of truth; the design was already persisted by PHASE-20. Avoids the FE round-tripping the full design object. |
| D4 | **State guard:** formalize-spec only runs when the loop's current state is exactly `SPEC_WRITER_FORMALIZE`. Any other state → clean `WRONG_STATE` error, no advance, no spec_writer call. | Prevents double-runs and out-of-order invocation. Idempotency/safety. |
| D5 | **Timeout guard 30s**, mirroring the architect (`Promise.race` + `clearTimeout`). On timeout/failure: no advance, no partial spec persisted, loop stays at `SPEC_WRITER_FORMALIZE`, clean error returned. | Same fail-closed discipline as PHASE-20. |

## §3 Scope (frozen)

**In scope:** one backend method (`conversationEngine.formalizeSpec`) + one endpoint
(`/api/ai-os/project/formalize-spec`) + spec persistence + state advance + one new FE card (`SpecCard.tsx`)
+ a "continue to spec" action in `ChatView.tsx` + the new scenarios.

**Out of scope (frozen — STOP-AND-REPORT if touched):** the architect, idea synthesis, vision lock,
confirmIdea, the spec_writer role internals, the state machine transition table, the reviewer
(REVIEWER_SPEC stays parked for PHASE-23), any new §ARC, any new npm dependency, any new agent role,
any new Doctor check.

## §4 §ARC / dependency impact

**Zero new §ARC. Zero new npm deps. Zero new agent roles. Zero new Doctor checks.**
All side effects route through existing L2 tools via `reg.invoke` (`role.invoke`, `fs.read_file`,
`fs.write_file`, `orchestration.get_status`, `orchestration.advance_state`). Ledger stays at **8**.

## §5 Deterministic closure gates

| # | Gate |
|---|---|
| 1 | New scenarios (S254–S257) added and GREEN on Windows. |
| 2 | Full suite: baseline += new passing scenarios, 0 failed (sandbox shows the documented env-deltas only: S48, S120–S127, S137). |
| 3 | Track A grep clean on all new code (no direct `fs.*Sync` / `fetch()` / `new OpenAI()` / `child_process` outside §ARC). |
| 4 | §ARC = 8, Doctor = 35, roles = 13, L2 tools = 78 (all unchanged). |
| 5 | TypeScript build of `web/apps/forge-workspace` passes. |
| 6 | **Gate #10 (the real closure):** owner confirms an idea in the browser → sees the architect design → triggers "continue to spec" → sees the spec card in Arabic (scope, decisions, acceptance criteria, files) → screenshot. Loop state on disk = `REVIEWER_SPEC`. |
| 7 | Closure decision artifact + `_phase_22_checkpoints/stage_22_final.md` written; `status.json` updated (phase_22 CLOSED, next_phase PHASE-23-PENDING-DECISION, roadmap completed += PHASE-22). |

## §6 Cost budget

Kill bar **$3.00**. Scenarios are mock-only ($0.00). Gate #10 uses one real `openai` spec_writer call
(~$0.01–0.02). No real calls anywhere else in the phase.

## §7 What comes next

PHASE-23 = wire `REVIEWER_SPEC` (the reviewer Phase A, already tested S89/S90) by the same pattern.
Decided separately — no Track B phase auto-starts.
