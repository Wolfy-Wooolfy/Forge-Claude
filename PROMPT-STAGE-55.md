# PROMPT-STAGE-55 — HARDENING BATCH

CTO-authored under owner delegation ("قرر بنفسك … موافق على توصياتك بأعلى درجات
الاحترافية", 2026-08-03). Do NOT write any code before Step 0 review and explicit
CTO GO. This phase is HARDENING ONLY — zero new capability.

== §0 — MANDATORY STATE INHERITANCE (read before anything else) ==
1. Read: architecture/FORGE_V2_BLUEPRINT.md, architecture/FORGE_V2_PHASE_ROADMAP.md,
   progress/status.json,
   artifacts/decisions/DECISION-2026-07-29-phase-54-iterative-mvp-loop.md,
   artifacts/decisions/DECISION-2026-08-03-phase-54-closure.md,
   artifacts/decisions/_phase_54_checkpoints/ (all five),
   docs/12_ai_os/24_MVP_LOOP_CONTRACT.md.
2. Verify local repo state. CTO has independently verified the following from
   GitHub — confirm your local tree agrees, and report any divergence as F-#:
   - tag phase-54-complete = annotated e0a988261ece6359c16456d746554e74917caac7,
     peels to closure commit 9e35e46e6c5d001ee7896e1743aa8543e7f6c3b2
   - origin/main = b498565, i.e. TWO commits above the closure commit
     (a1df629 = R-51 note appended to stage_closure.md; b498565 =
     .claude/settings.local.json). Neither touches live code. Expected owner
     behavior, NOT a breach.
   - BASELINE for this phase = the 9e35e46e code surface.
   - status.json: current_task=PHASE-54-ITERATIVE-MVP-LOOP-COMPLETE,
     next_phase=PHASE-55-PENDING-DECISION, SU 376/0/5 (381), §ARC=10,
     L2 tools=81, agent roles=13, doctor checks=35.
3. INVENTORY the five work-item surfaces (READ the files, do not assume):
   W-1: code/src/runtime/agents/cost_ledger.js (§ARC), the agent-ledger write
        path, providerTrace / artifacts/llm/metadata writers, the cap-enforcement
        call site, AND the legacy Stage-A provider call path that bypasses both
        (start from code/src/providers/ideationExpansionProvider.js and
        code/src/providers/_contract/ — establish EXACTLY where the two paths
        diverge). Also read the ledger cost estimator.
   W-2: code/src/ai_os/mvpLoopEngine.js, the R-10 fail-routing block,
        the single ITERATION_CAP source of truth,
        code/src/runtime/orchestration/iteration_controller.js.
   W-3: code/src/testing/scenario_runner.js:914-920 (requires_binary pattern) and
        the 5 docker scenarios that already declare it; then S57 itself.
   W-4: RUN_FORGE.bat, INSTALL_FORGE.bat, the pm2 invocation surface.
   W-5: the commit-message convention text, plus every contract doc touched by
        W-1/W-2 (24_MVP_LOOP_CONTRACT.md and the cost/ledger contract).
4. POST a Step 0 summary and STOP. The summary MUST contain:
   a) W-1 root-cause map: the exact divergence point between the metered agent
      path and the unmetered legacy provider path, named by file:line. State
      whether the fix is at the provider-contract seam (preferred: ONE seam) or
      requires per-provider edits (if so, argue it as F-#).
      Reproduce the live evidence: an ideationExpansionProvider call produced a
      real Arabic expansion on 2026-08-02 while the ledger gained ZERO rows and
      artifacts/llm/metadata gained ZERO files. Confirm or refute this from code.
   b) W-2 seam: where non-convergence is detected and where the owner prompt is
      emitted. Confirm in writing that R-10 is NOT redesigned, ITERATION_CAP is
      NOT touched, and NO new graph state is introduced.
   c) W-3: the exact requires_binary declaration S57 needs, AND the resulting
      closure-gate arithmetic stated BOTH ways (count with Python present, count
      with Python absent). This is a ruling requirement (R-6), not a nicety.
   d) W-4: the reproduction of the pm2 failure ("Process 0 not found" then
      TypeError at API.js:1718) and the proposed restart-safe sequence.
   e) The COMPLETE list of live files you will modify, per work item. Anything not
      on this list later = STOP (R-8).
   f) SU plan: numbering starts S384. For each work item, name the RED test that
      proves the defect exists BEFORE any fix (R-2).
   g) Risks, open questions, and any conflict with rulings R-1..R-10 below, raised
      as F-# findings. Do not silently deviate.
   No code, no file writes before CTO GO.

== §1 — BINDING RULINGS (record verbatim in the decision artifact §rulings) ==
R-1  HARDENING ONLY. Zero new capability. Every work item must be independently
     revertible — no cross-item coupling, no shared refactor that makes W-3
     un-revertible without also reverting W-1.
R-2  TEST-FIRST MANDATORY. For every work item: write the failing test FIRST, run
     it, capture the RED output, THEN fix, then capture GREEN. The RED output is
     the evidence the defect existed. Paste both into the checkpoint file. A work
     item with no RED evidence is NOT done.
R-3  §ARC FROZEN AT 10. Any perceived need for a new exception => STOP-AND-REPORT
     immediately; decision artifact + owner approval BEFORE any code.
R-4  MOCK-DEFAULT / $0 throughout, with exactly ONE exception: the single W-1 real
     proof (~$0.02). That call requires separate explicit owner approval in chat
     with the estimate shown first. General delegation does NOT cover real spend.
     Run a $0 preflight/DRY before it.
R-5  W-2 IS NARROW. Forbidden: redesigning R-10 fail routing, changing
     ITERATION_CAP or its semantics, adding a new graph/state-machine state.
     Permitted: detecting non-convergence and routing to the owner in plain
     language using the EXISTING review-gate surface.
R-6  W-3 MUST DECLARE ITS GATE IMPACT. The closure SU count must be stated for
     both environments (Python present / Python absent) in the decision artifact
     and the closure checkpoint. Silent count drift = closure blocked.
R-7  W-4 IS VERIFIED BY EXECUTION, NOT BY READING. Proof = an actual
     stop → start → stop → start cycle with captured stdout, not a script diff.
R-8  LIVE-SURFACE LOCK. The file list agreed at Step 0 is binding. Touching any
     live file outside it => STOP-AND-REPORT before the edit, not after.
R-9  GITIGNORED-ARTIFACT RULE (carried from PHASE-54). Evidence living in
     gitignored paths (.env, progress/uid_pin.json, artifacts/health/,
     artifacts/projects/phase4*) is NOT verifiable from the zip. Paste the raw
     JSON and command tails INTO the checkpoint files so they become verifiable
     artifacts. Do not merely cite them.
R-10 REAL-PATH COVERAGE (carried from PHASE-54 §3). W-2 is owner-facing.
     It requires at least ONE scenario crossing the REAL entry point
     (in-process server, HTTP request, then the engine) in the S382 pattern —
     not only a direct-engine-call scenario. "Scenario green / real path broken"
     has now cost this project twice.

== §2 — WORK ITEMS (scope-locked; one at a time, in this order) ==
W-1  SPEND VISIBILITY (priority — closes R-40).
     Every real provider call appears in ONE ledger that the cap can read. Today
     the cap covers the agent ledger only; legacy Stage-A providers spend
     unmetered. Deliver: the single-seam fix, the RED test proving an unmetered
     call today, GREEN proving it is metered after, plus ONE real ~$0.02 proof
     (separate owner approval). Additionally: assess the ledger cost-estimator
     accuracy and write a RECOMMENDATION only — do NOT change the estimator in
     this phase (R-37 context: the estimate ran ~2.5-4.0x actual).
W-2  OWNER ESCAPE ON NON-CONVERGENCE (closes R-45).
     Detect that the loop is not converging and route to the owner in plain
     language, using the existing review-gate surface. Narrow per R-5.
     Real-path scenario required per R-10.
W-3  ENVIRONMENT GUARD FOR S57 (closes R-14).
     Apply the same requires_binary pattern already used by the 5 docker
     scenarios (scenario_runner.js:914-920). Declare gate impact per R-6.
W-4  RESTART-SAFE RUN_FORGE.bat.
     pm2 currently throws "Process 0 not found" then a TypeError on pm2_env at
     API.js:1718. Fix and verify by an actual stop/start cycle per R-7.
W-5  DOCS + CONVENTION.
     Reword the "(LOCAL; no push/tag)" commit convention so it describes CC
     behavior without asserting repository state (it was factually wrong: the
     owner's own pushes carried the chain to origin during PHASE-54; the real
     control point is the annotated tag). Update every contract doc touched by
     W-1/W-2.

D0 (before W-1): decision artifact
   artifacts/decisions/DECISION-2026-08-03-phase-55-hardening-batch.md
   (scope, rulings R-1..R-10 + any Step-0 rulings, gates, budget)
   + PROMPT-STAGE-55.md in root
   + status.json -> current_task=PHASE-55-HARDENING-BATCH (IN_PROGRESS).

== §3 — CHECKPOINTS (3 — each followed by HARD STOP) ==
C1 after W-1  -> artifacts/decisions/_phase_55_checkpoints/stage_spend_mid.md
C2 after W-2  -> artifacts/decisions/_phase_55_checkpoints/stage_loop_mid.md
C3 after W-3+W-4+W-5 -> artifacts/decisions/_phase_55_checkpoints/stage_preclosure.md
Each checkpoint: STOP, owner uploads a FRESH zip from the LOCAL working folder,
await CTO verification GO. Freshness is proven by content markers, not filename.
Each checkpoint must embed the RED and GREEN evidence per R-2 and the raw
gitignored evidence per R-9.

== §4 — STOP-AND-REPORT TRIGGERS ==
Any new §ARC need · any breaking project_state schema change · any change to
R-10 fail routing or ITERATION_CAP · role-registry growth · any SU regression ·
any live file outside the Step-0-agreed list · any real API spend without a fresh
separate owner "أيوه" in chat · scope creep of any kind (Slice 2 re-engagement,
browser automation, provider switch, estimator rewrite) · discovering that a work
item is larger than scoped — report it, do not absorb it silently.

== §5 — CLOSURE GATE (deterministic) ==
1. SU exact count: 376+N pass / 0 fail / 5 skip, N declared at Step 0 — AND the
   W-3 alternate count stated per R-6 (Python-absent environment).
2. Track A greps clean (zero raw fetch(), zero new OpenAI() outside
   openAiAdapter.js, zero write-side fs.*Sync outside the 10 §ARC modules and
   the L2 tool implementations, zero new child_process) · doctor 35 checks,
   0 FAIL · §ARC still 10 · L2 tools and agent roles reported unchanged.
3. Every work item W-1..W-5 has RED-then-GREEN evidence pasted in a checkpoint
   (R-2), and W-4 has an executed stop/start transcript (R-7).
4. W-1 real proof executed with owner approval, with BOTH the ledger delta AND
   the real cash reported.
5. Closure artifact + status.json flip + closure checkpoint written.
6. Closure commit stays LOCAL until CTO push GO after a fresh-zip closure-diff
   (the diff must contain exactly the closure files, nothing else). Then the
   annotated tag phase-55-complete goes on the CLOSURE COMMIT HASH, not HEAD.

== §6 — COST ==
Kill bar $3.00 for the phase. Mock-default / $0 throughout, except the single
W-1 real proof (~$0.02) which requires separate owner approval in chat with the
estimate shown FIRST. Report ledger delta AND real cash for every real call.
Create output folders before any call that persists evidence.

FIRST ACTION NOW: execute §0 and post the Step 0 summary. STOP after posting.
Write no code and create no files before CTO GO.
