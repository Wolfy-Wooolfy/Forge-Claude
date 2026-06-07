# DECISION-2026-06-07 — PHASE-23: Reviewer Spec Bridge (REVIEWER_SPEC, Phase A)

> **Status:** PROPOSED — pending Step 0 inspection + CTO GO. Authorized to begin by owner
> delegation ("قرر بنفسك طالما باعلى درجات الاحترافية", 2026-06-07) per Track B activation rule.
> **Pattern:** Mirrors PHASE-22 (spec_writer bridge) — same wiring shape, one new element (the
> verdict branch). When mirroring PHASE-22, mirror it COMPLETELY (lesson from PHASE-22).
> **Authored by:** CTO advisor, grounded in the actual reviewer role contract + conversation_graph.

---

## §1 Goal

Wire the **reviewer** role (Phase A = spec review) into the orchestration loop. After
spec_writer transitions `SPEC_WRITER_FORMALIZE → REVIEWER_SPEC` (PHASE-22), the reviewer reviews
the formalized spec + the architect design and produces a verdict that drives the next transition.

The conversation_graph ALREADY defines both outgoing transitions from REVIEWER_SPEC — no new
graph edges are needed; the reviewer's verdict selects which one fires:

```
REVIEWER_SPEC → COST_ESTIMATE      (forward / approved path — already in graph)
REVIEWER_SPEC → ESCALATED          (reject path, surfaces to owner — already in graph)
```

Reviewer role contract (verified in code/src/runtime/agents/roles/reviewer_role.js):
- INPUT  (required): `phase` ("A"|"B"), `spec` (object), `design` (object), `project_id`
- OUTPUT (required): `verdict` ("APPROVED"|"APPROVED_WITH_CONCERNS"|"REJECTED"), `findings`, `summary`
- Already tested by S89/S90.

## §2 Decisions

| # | Decision | Mirrors |
|---|---|---|
| D1 | Separate endpoint `POST /api/ai-os/project/review-spec` — NOT chained into `formalizeSpec`; the FE triggers it explicitly after the spec card. | PHASE-22 D1 |
| D2 | **Backend-owned provider/model.** The reviewer is invoked with `provider: "openai"`, `model: "gpt-4o"` (ANTHROPIC_API_KEY is absent, and the role's default model is anthropic). FE sends no model. Add `model_used` to the response (success/timeout/failure). | PHASE-22 D2 (amended) |
| D3 | **Read inputs from disk.** Read the formalized spec (spec_writer's persisted output) and the architect design under `orchestration/${loopId}/`. Step 0 confirms the exact filenames by reading how `formalizeSpec` reads the design and where spec_writer wrote the spec. | PHASE-22 D3 |
| D4 | **State guard.** Return `WRONG_STATE` if the active runtime state ≠ `REVIEWER_SPEC`. | PHASE-22 D4 |
| D5 | **Timeout + fail-safe.** 30s `Promise.race`; on timeout or role failure, do NOT advance — return a typed failure with `model_used`, state stays REVIEWER_SPEC. | PHASE-22 D5 |
| D6 | **Verdict branch (NEW).** The reviewer verdict drives the transition: `APPROVED` and `APPROVED_WITH_CONCERNS` → advance to `COST_ESTIMATE`; `REJECTED` → advance to `ESCALATED` (findings surfaced to the owner). `APPROVED_WITH_CONCERNS` advances but the concerns are surfaced prominently in the review card (owner sees them, not blocked). No new graph edges. | new — graph already supports both |

## §3 §ARC / dependency impact

**§ARC unchanged at 8.** The reviewer call goes through the same `reg.invoke` role-invocation path
spec_writer uses; no direct `fetch`/`new OpenAI`/`child_process`/`fs.*Sync`, no new dependency, no
new §ARC. One new endpoint (same shape as PHASE-22's), one new backend method, FE card — none add a
forbidden pattern.

## §4 Closure gates (deterministic)

1. New scenarios (next free id is **S261**) — mock-only, $0:
   - reviewer APPROVED → loop advances REVIEWER_SPEC → COST_ESTIMATE.
   - reviewer REJECTED → loop advances REVIEWER_SPEC → ESCALATED.
   - reviewer APPROVED_WITH_CONCERNS → advances to COST_ESTIMATE with concerns present in the response.
   - wrong-state guard: calling review-spec when state ≠ REVIEWER_SPEC → WRONG_STATE, no advance.
   - timeout/failure → no advance, state stays REVIEWER_SPEC, `model_used` present.
   - provider/model coherence: reviewer invoked with provider openai + model gpt-4o (assert `model_used === "gpt-4o"`).
2. FULL suite green (0 failed; sandbox = documented env-deltas only).
3. FE **ReviewCard** renders verdict + findings + summary + the resulting transition; ChatView wires
   the action after the spec card. TypeScript clean; FE rebuilt (new bundle).
4. §ARC 8, Doctor 35, roles 13 unchanged; L2 tools unchanged.
5. **Gate #10:** owner runs a real spec review through the UI end-to-end — sees the verdict card, and
   the loop advances to COST_ESTIMATE on approve (or ESCALATED on reject). Screenshot.
6. Closure artifacts (decision closure note + `_phase_23_checkpoints/stage_23_final.md`) + status.json
   (phase_23 CLOSED, next_phase → the phase after REVIEWER_SPEC) + commit + push.

## §5 Mid-checkpoint

After the backend (reviewSpec method + endpoint + scenarios), before the FE. Claude Code STOPs;
CTO verifies from a fresh zip (full suite + Track A + the branch scenarios) before the FE GO.

## §6 Cost

Scenarios mock-only: $0.00. Gate #10 runs ONE real reviewer call (gpt-4o) ≈ $0.02–0.04, within the
$3 dev bar. No other real calls. Real key use only at Gate #10, owner-initiated.
