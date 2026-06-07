################################################################################
# PROMPT-STAGE-23 — REVIEWER SPEC BRIDGE (REVIEWER_SPEC, Phase A)
# Authority: DECISION-2026-06-07-phase-23-reviewer-spec-bridge.md (PROPOSED → GO after §0)
# Mirrors PHASE-22 (spec_writer bridge). One new element: the verdict branch. §0 GO required.
################################################################################

GOAL: wire the reviewer role (Phase A = spec review) into the orchestration loop. After
SPEC_WRITER_FORMALIZE → REVIEWER_SPEC (PHASE-22), the reviewer reviews the formalized spec +
architect design and produces a verdict that drives the next transition. The graph ALREADY has
both edges — the verdict selects which fires:
  APPROVED / APPROVED_WITH_CONCERNS → COST_ESTIMATE
  REJECTED                          → ESCALATED

Reviewer role (code/src/runtime/agents/roles/reviewer_role.js), already tested S89/S90:
  INPUT  (required): phase ("A"|"B"), spec (object), design (object), project_id
  OUTPUT (required): verdict ("APPROVED"|"APPROVED_WITH_CONCERNS"|"REJECTED"), findings, summary

────────────────────────────────────────────────────────────────────────────────
§0  STATE INHERITANCE + INSPECTION  — **STOP for GO, do NOT implement**
────────────────────────────────────────────────────────────────────────────────
Read Blueprint + Roadmap + status.json + this decision artifact + the PHASE-22 closure
(DECISION-2026-06-07-phase-22-closure.md) and the PHASE-22 spec-writer decision. Then produce a
written inspection (no code changes):

0.1  Read conversationEngine.formalizeSpec END TO END (the PHASE-22 method). Quote its shape:
     how it resolves loopId, how it reads the design from disk, the state guard, the 30s
     Promise.race timeout, the backend-owned provider/model override
     (specProvider/specModel + model_used), and the no-advance-on-failure return. reviewSpec
     will mirror this EXACTLY — list every piece you will mirror.

0.2  Confirm the exact on-disk read-paths under orchestration/${loopId}/:
       - the architect design (the file formalizeSpec already reads), and
       - the formalized spec (where spec_writer / formalizeSpec PERSISTED the spec on success).
     Quote the write site that produced the spec file and its exact filename. reviewSpec needs
     BOTH spec and design as the reviewer's input.

0.3  Quote the two REVIEWER_SPEC transitions from
     code/src/runtime/orchestration/conversation_graph.js (→ COST_ESTIMATE and → ESCALATED) and
     confirm neither has an owner-gate trigger (the verdict alone drives them). Confirm how
     formalizeSpec performs its advance (the state-write / advance helper) so reviewSpec uses the
     SAME mechanism for both branch targets.

0.4  Confirm the reviewer role input/output schema (phase A path) and how spec_writer's role was
     invoked via reg.invoke in formalizeSpec, so reviewSpec invokes the reviewer the same way with
     provider "openai" + model "gpt-4o".

0.5  Propose the EXACT diff: the reviewSpec(body) method (mirroring formalizeSpec + the D6 branch),
     the POST /api/ai-os/project/review-spec endpoint, and the scenario list (start at S261). Show
     the branch logic: verdict APPROVED|APPROVED_WITH_CONCERNS → advance to COST_ESTIMATE; REJECTED
     → advance to ESCALATED; surface findings/summary + concerns in the return. Then STOP for GO.

DO NOT add a new graph edge, a new dependency, a new role, a new Doctor check, or a new §ARC.
§ARC stays 8. Mirror PHASE-22 completely — do not invent a different shape.

════════════════════════════════════════════════════════════════════════════════
AFTER GO — implement in this order. Mid-checkpoint STOP before the FE (§5).
════════════════════════════════════════════════════════════════════════════════

§1  reviewSpec(body) backend method — mirror formalizeSpec exactly, plus:
    - read spec + design from disk (0.2), invoke reviewer (phase "A", spec, design, project_id)
      via reg.invoke with provider "openai", model "gpt-4o" (backend-owned; FE sends no model).
    - 30s Promise.race timeout; on timeout/role-failure → no advance, return typed failure with
      model_used, state stays REVIEWER_SPEC.
    - state guard: WRONG_STATE if active state ≠ REVIEWER_SPEC.
    - D6 branch on verdict: APPROVED|APPROVED_WITH_CONCERNS → advance REVIEWER_SPEC → COST_ESTIMATE;
      REJECTED → advance REVIEWER_SPEC → ESCALATED. Return verdict, findings, summary, model_used,
      and the resulting to_state.

§2  Endpoint POST /api/ai-os/project/review-spec — same registration shape as formalize-spec.

§3  Scenarios (start S261), mock-only $0:
    - reviewer APPROVED → to_state COST_ESTIMATE.
    - reviewer REJECTED → to_state ESCALATED.
    - reviewer APPROVED_WITH_CONCERNS → to_state COST_ESTIMATE, findings present in response.
    - wrong-state guard → WRONG_STATE, no advance.
    - timeout/failure → no advance, state stays REVIEWER_SPEC, model_used present.
    - provider/model coherence → assert model_used === "gpt-4o".
    Mirror the spec_writer scenarios' mock mechanism. If you need an early-return test hook, prefer
    a clean approach over embedding a production hook (note: PHASE-22 left a _test_force_timeout in
    formalizeSpec — do NOT copy that smell; if you must, isolate it).

§4  MID-CHECKPOINT — STOP and report:
    - full suite total/pass/fail/skip + any failure names (sandbox env-deltas expected; Windows 0).
    - Track A grep clean (no new fs.*Sync/fetch/new OpenAI/child_process outside §ARC); §ARC = 8.
    - files touched (backend method + endpoint + scenarios only).
    Wait for CTO verification + GO before §5.

§5  FE — ReviewCard.tsx (renders verdict badge + summary + findings list + the resulting
    transition) + ChatView action wired after the spec card. Minimal, no new dependency. Arabic
    labels fine. APPROVED_WITH_CONCERNS surfaces the concerns prominently.

§6  BUILD + FINAL VERIFY — STOP: npm run build (report NEW bundle hash, old replaced), TS clean,
    re-run full suite, report. STOP for CTO verification from a fresh zip before Gate #10.

§7  GATE #10 (owner) + CLOSURE — owner runs a real spec review through the UI: sees the verdict
    card; loop advances to COST_ESTIMATE on approve (or ESCALATED on reject). On pass: closure note
    + artifacts/decisions/_phase_23_checkpoints/stage_23_final.md + status.json (phase_23 CLOSED,
    next_phase → the phase after REVIEWER_SPEC, i.e. COST_ESTIMATE bridge) + commit + push.

NOTES:
- Every claim independently re-verified by the CTO from a fresh zip.
- Cost: scenarios $0 (mock). Gate #10 = ONE real reviewer call (gpt-4o) ≈ $0.02–0.04, within $3.
- Any deviation from PHASE-22's shape, or anything §0 reveals unexpectedly → STOP and report.
################################################################################
