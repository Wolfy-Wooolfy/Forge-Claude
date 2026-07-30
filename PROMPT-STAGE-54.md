# PROMPT-STAGE-54 — ITERATIVE MVP LOOP (Slice 1: Owner Review Loop Core)

CTO-authored under owner delegation ("قرر بنفسك"، 2026-07-29). Do NOT write any
code before Step 0 review and explicit CTO GO.

== §0 — MANDATORY STATE INHERITANCE (read before anything else) ==
1. Read: architecture/FORGE_V2_BLUEPRINT.md, architecture/FORGE_V2_PHASE_ROADMAP.md,
   progress/status.json, artifacts/decisions/DECISION-2026-07-09-phase-53-relevance-floor.md,
   artifacts/decisions/DECISION-2026-07-09-phase-53-closure.md,
   artifacts/decisions/_phase_53_checkpoints/ (all three).
2. Verify local repo state: tag phase-53-complete peels to a69de85; origin/main is
   currently 5205c6e (two owner U-commits dated 2026-07-29 touching ONLY
   artifacts/projects/** — expected, not a breach). Baseline for this phase = a69de85
   code surface. status.json: current_task=PHASE-53-RELEVANCE-FLOOR-COMPLETE,
   next_phase=PHASE-54-PENDING-DECISION, SU 365/0/5 (370).
3. INVENTORY the existing loop machinery (read the files, do not assume):
   code/src/runtime/orchestration/iteration_controller.js,
   code/src/runtime/orchestration/materializerEngine.js,
   code/src/runtime/tools/materializer_tools.js,
   code/src/runtime/builtproject/loopback_signal.js (§ARC-10),
   code/src/ai_os/refinementLoopOrchestrator.js, code/src/ai_os/conversationEngine.js
   (state machine + review-adjacent states), scenarios S145, S267-S272, S335-S337.
4. POST a Step 0 summary and STOP. The summary must contain:
   a) Current-state map: what the internal build-test loopback already does end-to-end,
      which iteration-cap constant exists and where, what refinementLoopOrchestrator
      actually covers (docs loop vs build loop).
   b) Proposed seams + exact file list for the deliverables below (new files vs
      modified live surface — keep live surface minimal).
   c) Proposed project_state "mvp_loop" block schema + state name for the owner
      review gate (proposal: AWAITING_OWNER_REVIEW) + flag path.
   d) Proposed provider/prompt surfaces for (i) MVP scope derivation and
      (ii) owner-feedback interpretation — reuse existing provider machinery;
      state whether the 13-role registry must grow (default: it must NOT; if you
      believe it must, argue it as a finding F-#).
   e) SU scenario plan (numbering starts S373) + which existing helpers you reuse.
   f) Risks, open questions, and any conflict with rulings R-1..R-6 below (raise
      as F-# findings — do not silently deviate).
   No code, no file writes before CTO GO.

== §1 — SCOPE + DELIVERABLES (after GO) ==
Capability: on projects with mvp_loop.enabled=true, Forge derives a minimal MVP
scope from the approved spec, builds+tests ONLY that slice via the existing
materializer/harness path, presents a plain-language report to the owner (what was
built, what the tests prove, how to see it), waits in an owner-review state,
interprets the owner's plain-language reply as structured ACCEPT or
REFINE{changes[]}, threads REFINE changes into the existing loopback rebuild path
(A-5 pattern: real evidence into the codegen prompt, never blind re-roll),
re-presents, and on ACCEPT exits into the normal remaining pipeline. Iteration cap
enforced via the single existing cap mechanism (R-4).

Binding rulings (record verbatim in the decision artifact §rulings):
R-1 flag-gated per project, default OFF; flag-off path byte-identical to PHASE-53
    behavior (invariance proven by SU + diff evidence).
R-2 reuse iteration_controller/materializer/loopback machinery; no parallel loop.
R-3 feedback interpretation is provider-driven structured output; zero keyword
    matching; TEST mode = scenario user_inputs script the owner turn (hermetic).
R-4 one iteration-cap source of truth (extend existing constant if present).
R-5 no new §ARC (frozen at 10); any need => STOP-AND-REPORT.
R-6 contract doc = docs/12_ai_os/24_MVP_LOOP_CONTRACT.md.

D0  Decision artifact artifacts/decisions/DECISION-2026-07-29-phase-54-iterative-mvp-loop.md
    (scope, rulings R-1..R-6 + any Step-0 rulings, gates, budget) + PROMPT-STAGE-54.md
    in root + status.json -> current_task=PHASE-54-ITERATIVE-MVP-LOOP (IN_PROGRESS).
D1  State model: project_state mvp_loop block (enabled, iteration, mvp_scope,
    feedback_history[], status) + review-gate state wired into the state machine +
    contract doc skeleton. Additive schema only.
D2  MVP scope derivation: spec -> mvp_scope (provider-driven, schema-validated,
    deterministic mock in SU) + hermetic SUs.
    == MID-CHECKPOINT: write artifacts/decisions/_phase_54_checkpoints/stage_core_mid.md,
    STOP, owner uploads fresh local-folder zip, await CTO verification GO. ==
D3  Owner review gate: assemble the plain-language MVP report FROM the real harness
    verdict artifacts (no invented claims), transition to the review state, minimal
    conversationEngine wiring.
D4  Feedback interpretation provider + REFINE threading into the loopback rebuild
    (changes[] must appear in the materializer prompt trace) + cap behavior +
    ACCEPT exit resumes the normal pipeline.
D5  SU scenarios S373+ (target ~7): derivation schema; flag-off invariance
    (byte-identity of the non-loop path); transition into review state; ACCEPT path;
    REFINE path with threading evidence; cap reached behavior; offline/mock safety.
    Plus: docs finalized, Track A greps clean, full suite green.

== §2 — TRACK A RULES (unchanged, binding) ==
All side effects via reg.invoke; no fetch()/fs.*Sync/child_process/new OpenAI()
outside the 10 §ARC modules. §ARC frozen at 10. kb.ingest_url / http allow-list /
SSRF guard byte-identical. No new HALT paths. Offline-safe: without provider keys,
flag-off behavior is exactly PHASE-53.

== §3 — MID-STAGE CHECKPOINT ==
After D2 as specified above. Fresh zip must come from the LOCAL working folder;
freshness is verified by content markers, not filename.

== §4 — STOP-AND-REPORT TRIGGERS ==
Any new §ARC need; any breaking project_state schema change; touching KB/citation
write paths; role-registry growth without an approved F-# ruling; any SU regression;
live-surface files beyond the Step-0-agreed list; scope creep (multi-slice
ambitions, default-ON flip, browser automation).

== §5 — CLOSURE GATE (deterministic) ==
1. SU exact count: 365+N pass / 0 fail / 5 skip, N = new scenarios (declared at D5).
2. Track A greps clean; doctor 35/35; §ARC still 10; L2 count reported.
3. Gate #10 REAL, owner-witnessed, flag ON on a fresh demo build project: derive ->
   build MVP -> present -> owner sends a real REFINE reply in the UI -> rebuild
   consumes changes[] (prompt-trace evidence) -> re-present -> owner ACCEPT ->
   pipeline advances. Mechanism-based criteria only (loop executed correctly, cap
   respected, zero HALT, flag-off tree untouched); output quality = observed data,
   not a pass criterion. Permanent evidence under artifacts/spikes/phase54_gate10/
   + script scripts/spikes/phase54_gate10.js. REAL SPEND REQUIRES SEPARATE OWNER
   APPROVAL IN CHAT WITH THE ESTIMATE SHOWN FIRST — $0 preflight/DRY before it.
4. Closure artifact + status.json + closure checkpoint; closure commit stays LOCAL
   until CTO push GO after fresh-zip closure-diff (diff must be exactly the closure
   files); then annotated tag phase-54-complete on the closure commit hash.

== §6 — COST ==
Kill bar $3.00. Mock-default throughout D0-D5 ($0). Gate #10 real estimate to be
computed at preflight (ballpark 8-12 gpt-4o calls, ~= $0.15-0.40); report ledger
delta AND real cash both. Create output folders before any call that persists.

FIRST ACTION NOW: execute §0 and post the Step 0 summary. STOP after posting.
