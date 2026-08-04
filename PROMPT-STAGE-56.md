# PROMPT-STAGE-56 — MVP LOOP SLICE 2 (RE-ENGAGEMENT AFTER ACCEPTED) + BOOT REPAIR

CTO-authored under owner delegation ("قرر بنفسك وانا موافق على توصياتك طالما باعلى
درجات الاحترافية", 2026-08-04). Do NOT write any code before Step 0 review and an
explicit CTO GO.

== §0 — MANDATORY STATE INHERITANCE ==
1. Read: architecture/FORGE_V2_BLUEPRINT.md · architecture/FORGE_V2_PHASE_ROADMAP.md
   · progress/status.json · docs/12_ai_os/24_MVP_LOOP_CONTRACT.md ·
   docs/10_runtime/17_AGENT_RUNTIME_CONTRACT.md ·
   artifacts/decisions/DECISION-2026-07-29-phase-54-iterative-mvp-loop.md ·
   DECISION-2026-08-03-phase-54-closure.md ·
   DECISION-2026-08-03-phase-55-hardening-batch.md ·
   DECISION-2026-08-04-phase-55-closure.md · all of _phase_55_checkpoints/.
2. Verify repo state. CTO has verified from GitHub — confirm locally, report any
   divergence as F-#:
   - tag phase-55-complete = annotated c487d1724fc8cefe9a5d96caee848cb1d5c0b3d0,
     peels to closure commit da8c6f05760236bf3784533bdf462c34178b2338
   - the closure commit contains EXACTLY 4 files (I verified this from a clone)
   - BASELINE for this phase = the da8c6f05 code surface
   - status.json: current_task=PHASE-55-HARDENING-BATCH-COMPLETE,
     next_phase=PHASE-56-PENDING-DECISION, SU 380/0/5 (385), §ARC 10, L2 81,
     roles 13, doctor 35
   - origin/main will have moved past the closure commit. Expected, not a breach.
3. INVENTORY — READ the files, do not assume:
   W-0: scripts/service/windows_task_scheduler_install.bat ·
        scripts/service/resurrect_hidden.vbs · INSTALL_FORGE.bat (esp. :73-80) ·
        RUN_FORGE.bat (post-W-4) · ecosystem.config.js. The MEASURED fact from
        PHASE-55: dump.pm2 = [] so the AtLogOn task resurrects nothing.
   W-1/W-2: code/src/ai_os/mvpLoopEngine.js (full) — especially MVP_STATUSES,
        MVP_TRANSITIONS (ACCEPTED has NO outgoing transitions today), the R-17
        no-re-engagement guard, assembleMvpReport, readOwnerFeedback ·
        code/src/ai_os/conversationEngine.js — _mvpEnterOwnerReview, the ACCEPT
        deferred-advance path, the R-10 and R-16 FAIL branches ·
        code/src/runtime/orchestration/conversation_graph.js (17 frozen states,
        ITERATION_CAP) · iteration_controller.js · _registry.js boot-locks.
        ANSWER PRECISELY: after a plain ACCEPT, where is the graph left, and what
        exactly would have to change for a second slice to run? Name it file:line.
   W-3: code/src/runtime/agents/budget_enforcer.js (post-W-1 of PHASE-55,
        including _legacySpendSince) · cost_ledger.js · the vision cap source.
   W-5: 24_MVP_LOOP_CONTRACT.md · 17_AGENT_RUNTIME_CONTRACT.md.
4. POST a Step 0 summary and STOP. It MUST contain:
   a) W-0: the minimal change that makes a logon resurrect actually restore Forge,
      and an explicit statement of whether it can coexist with the post-W-4
      RUN_FORGE.bat without either fighting the other. If the minimal change is
      not small and independently revertible, say so — R-12 lets you defer it.
   b) The re-engagement seam, named file:line: where ACCEPTED is terminal today
      and what the second slice needs. State whether you can do it WITHOUT a new
      mvp_loop status and WITHOUT a new graph state. If you believe a new status
      is unavoidable, argue it as an F-# — do not assume approval.
   c) Your proposed answer to the cap question (R-4): what happens to
      iteration_count when a new slice starts, and what bounds the total across
      slices. This is the load-bearing design decision of the phase.
   d) Budget re-check design (R-5) and where the plain-language surfacing goes.
   e) The COMPLETE list of live files you will modify, per work item (R-10).
   f) SU plan: numbering starts S388. For each behavior, name the RED test.
      Identify which scenarios cross the REAL entry point per R-9.
   g) Risks, open questions, conflicts with R-1..R-14 as F-# findings.
   No code, no file writes before CTO GO.

== §1 — BINDING RULINGS ==
R-1  SCOPE LOCK. This phase is MVP Loop Slice 2 plus W-0 only. No other backlog
     item — not Browser Automation, not the estimator reconciliation, not the
     Anthropic switch, not the legacy async refactor.
R-2  §ARC FROZEN AT 10. Any need => STOP + decision artifact + owner approval.
R-3  NO NEW GRAPH STATE. The 17 conversation-graph states are frozen and their
     boot-lock is untouched. A new mvp_loop status is NOT pre-approved: default is
     reuse of the existing six. If you argue one is unavoidable, it needs its own
     ruling before any code, with the forensic reason recorded.
R-4  THE CAP MUST NOT BECOME UNBOUNDED ACROSS SLICES. ITERATION_CAP stays 5 and
     its strict boot-lock stays untouched. If a new slice resets iteration_count,
     the reset MUST be bounded by an explicit declared limit on slices or on
     cumulative iterations, and reaching that limit MUST surface to the owner in
     plain language — never a silent stop and never a silent unbounded loop.
     A design granting each slice a fresh 5 with no ceiling on slice count is
     REJECTED. PHASE-54's R-9 rationale (a silent ESCALATED is a phase failure)
     carries forward verbatim.
R-5  BUDGET RE-CHECK PER SLICE. Before deriving a new slice scope, re-check the
     project budget — which since PHASE-55 W-1 includes legacy Stage-A spend — and
     surface the REMAINING budget to the owner in plain language at the moment he
     is asked what to build next. A slice must never silently begin on a project
     already at or over its cap.
R-6  FLAG-OFF BYTE-IDENTICAL. With mvp_loop.enabled=false, behavior must be
     byte-identical to da8c6f05. Prefer pure insertions and prove them with a
     zero-deletion diff against that hash, as you did in PHASE-55 W-2.
R-7  APPEND-ONLY SLICE HISTORY. Each slice's scope, report, and owner decision are
     preserved. Nothing overwrites a prior slice's record.
R-8  TEST-FIRST. RED before GREEN for every behavior; both outputs pasted into the
     checkpoint. A behavior with no RED evidence is not done.
R-9  REAL-PATH COVERAGE IS MANDATORY, NOT OPTIONAL. Every owner-facing capability
     added here needs at least one scenario crossing the real entry point
     (in-process server + live HTTP), S382/S386 pattern. A direct-engine scenario
     does not discharge this. "Scenario green / real path broken" has cost this
     project twice; it does not get a third.
R-10 LIVE-FILE LOCK. The Step 0 file list is binding. Anything outside it => STOP
     before the edit.
R-11 GITIGNORED EVIDENCE (.env, uid_pin.json, artifacts/health/,
     artifacts/projects/*) is not verifiable from the zip. Paste raw JSON and
     command tails INTO the checkpoints.
R-12 W-0 IS BOUNDED AND GOES FIRST. If it turns out to need more than a small,
     independently revertible change, STOP and defer it to a later phase. Do not
     absorb it. It must not delay or entangle the Slice 2 work.
R-13 GATE #10 CRITERIA ARE WRITTEN BEFORE THE RUN, in C3, and are not edited
     afterward. Success is never redefined after seeing the result.
R-14 MOCK-DEFAULT / $0. The Gate #10 real run requires separate explicit owner
     approval in chat with the estimate shown FIRST. General delegation does NOT
     cover real spend. Report ledger delta AND real cash for every real call.

== §2 — WORK ITEMS (in order) ==
W-0  BOOT AUTO-START REPAIR. Make a logon resurrect actually bring Forge up.
     Verified by execution, not by reading: an actual logon-equivalent run of the
     ForgeAPI task with a captured transcript, plus dump.pm2 before/after. Must
     coexist with the post-W-4 RUN_FORGE.bat — prove both orders work.
W-1  RE-ENGAGEMENT SEAM. ACCEPTED is no longer a dead end: the owner can ask for
     more work on the same project and the loop re-engages, under R-3/R-4.
W-2  NEW SLICE SCOPE DERIVATION. The owner's follow-up request is interpreted
     provider-driven with ZERO keyword matching (PHASE-54 R-8/R-12 pattern) and
     turned into the next slice's scope, threaded verbatim where it is his words.
W-3  BUDGET RE-CHECK + PLAIN-LANGUAGE REMAINING BUDGET (R-5).
W-4  GATE #10 — owner-witnessed real run in Arabic on the real UI: accept an MVP,
     then ask for more, and get it. Criteria fixed in C3 beforehand. Evidence
     persisted under artifacts/spikes/phase56_gate10/.
W-5  DOCS: 24_MVP_LOOP_CONTRACT.md (Slice 2 semantics, the cap bound, the budget
     re-check) + 17_AGENT_RUNTIME_CONTRACT.md if W-3 touches it + an owner-facing
     plain-language statement of what the cap bound means for him.

D0 (before W-0): artifacts/decisions/DECISION-<ts>-phase-56-mvp-loop-slice-2.md
   (scope, rulings R-1..R-14 verbatim, gates, budget) + PROMPT-STAGE-56.md in root
   + status.json -> current_task=PHASE-56-MVP-LOOP-SLICE-2 (IN_PROGRESS),
   next_phase=PHASE-57-PENDING-DECISION (PHASE-54 R-16 field convention).

== §3 — CHECKPOINTS (4 — each followed by a HARD STOP) ==
C1 after W-0        -> _phase_56_checkpoints/stage_boot_mid.md
C2 after W-1 + W-2  -> _phase_56_checkpoints/stage_rescope_mid.md
C3 after W-3 + W-5  -> _phase_56_checkpoints/stage_gate10_plan.md  (criteria FIRST)
C4 after W-4        -> _phase_56_checkpoints/stage_preclosure.md
Each: STOP, owner uploads a FRESH zip from the LOCAL folder, await CTO GO.
Freshness is proven by content markers, not filename.

== §4 — STOP-AND-REPORT TRIGGERS ==
Any new §ARC · any new graph state · any change to ITERATION_CAP or its boot-lock ·
any new mvp_loop status before its ruling · any live file outside the Step 0 list ·
any SU regression · any real spend without a fresh separate owner "أيوه" · any
flag-off behavior change · discovering a work item is larger than scoped — report
it, do not absorb it.

== §5 — CLOSURE GATE (deterministic) ==
1. SU exact: 380+N pass / 0 fail / 5 skip (385+N), N declared at Step 0. State the
   Python-absent alternate count too if W-0 or anything else moves it.
2. Track A clean · doctor 35 checks 0 FAIL · §ARC 10 · L2 tools and roles reported.
3. Every behavior has RED-then-GREEN evidence in a checkpoint; W-0 has an executed
   transcript.
4. Flag-off byte-identity proven against da8c6f05.
5. Gate #10 = GATE_PASS, owner-witnessed, computed from persisted evidence against
   criteria fixed in C3 before the run.
6. Closure artifact + status.json flip + 4 checkpoints written.
7. Closure commit stays LOCAL until CTO push GO after a fresh-zip closure-diff.
   Stage EXPLICIT paths only — never `git add -A`. Then the annotated tag
   phase-56-complete goes on the CLOSURE COMMIT HASH, not HEAD.

== §6 — COST ==
Kill bar $3.00. Mock-default / $0 throughout except the Gate #10 real run, which
needs separate owner approval with the estimate shown first at C3. Report the
ledger delta AND the real cash for every real call.

FIRST ACTION NOW: execute §0 and post the Step 0 summary. STOP after posting.

---
---

# CTO STEP-0 REVIEW — AMENDMENT A-1 + RULINGS R-15..R-22 (2026-08-04)

> Appended verbatim. This section AMENDS the prompt above: A-1 adds W-6 to §2 and
> changes the work-item order; R-16 supersedes CC's Step-0 claim about the Gate-1
> walk. Where this section and the prompt above conflict, THIS SECTION governs.

CTO REVIEW OF STEP 0 — ACCEPTED WITH RULINGS. This is the strongest Step 0 you have
produced. F-2, F-4 and F-6 are all real; I verified each against the code rather
than reading your summary, and all three hold. F-6 changes the shape of the phase.

One correction to your own claim, and it is load-bearing:

CTO-F-A — THE WALK TO TEST_DESIGN CROSSES AN OWNER GATE. You wrote "no fabricated
Gate-1 approval", but conversation_graph.js declares the row as
  ENV_REPORT -> TEST_DESIGN, trigger: "Gate 1 owner response = APPROVE"
There is no other declared way in. So the slice walk either synthesizes an owner
approval — fabricating consent, which is not acceptable at any scope — or the owner
genuinely approves. See R-16.

== A-1 — AMENDMENT TO MY OWN R-1 (scope lock), issued because F-6 is correct ==
R-1 is amended to add W-6. Reason on the record: initMvpLoopBlock(true) is called
from exactly two places, a test helper and the Gate #10 driver. No production path
enables the MVP loop, so PHASE-54 shipped a capability the owner cannot reach and
PHASE-56 as scoped would improve an unreachable feature. That is "feature complete
/ owner cannot reach it" — the product-level form of the failure this project has
already paid for twice. Shipping a third phase of MVP-loop work behind an
unreachable flag is not scope discipline, it is scope theatre. R-1 otherwise stands
in full: nothing else is added.

== RULINGS R-15 .. R-22 (binding; record verbatim) ==

R-15  W-6 — OWNER-REACHABLE ENABLEMENT, HARD-BOUNDED.
      Deliver a path by which the owner himself turns the MVP loop on for a
      project. Bounds, all of them binding:
        (a) OPT-IN ONLY. Default stays OFF for every existing and new project.
            Changing the default is forbidden.
        (b) NO FRONTEND WORK. web/** is untouchable this phase — that is PHASE-13
            territory. Use the existing chat/API surface.
        (c) ONE SEAM, named at Step 0.5. If it requires apiServer.js routing
            changes, a new endpoint, or a new L2 tool => STOP-AND-REPORT and
            backlog it; do not absorb.
        (d) Provider-driven if it interprets owner language — zero keyword
            matching, PHASE-54 R-8/R-12 pattern.
      SEQUENCE: W-6 runs BEFORE W-4. Gate #10 must then be driven by the owner
      enabling the loop himself through the real surface, not by the driver seeding
      the flag. That makes the gate a genuine end-to-end proof for the first time.
      Revised order: W-0 -> W-1 -> W-2 -> W-3 -> W-6 -> W-4 -> W-5.
R-16  GATE 1 FOR SLICE N MUST BE A REAL OWNER ACT (CTO-F-A). Forge derives the
      slice scope, presents it to the owner in plain Arabic together with the
      remaining budget (R-5), and the owner's confirmation IS the Gate-1 approval
      for that slice — recorded verbatim in the audit row with his own words.
      Synthesizing, defaulting, or inferring the approval is FORBIDDEN. If your
      design cannot produce a real owner act at that point, STOP and report; do not
      auto-approve "because he already asked for the feature". Asking for a feature
      is not approving the plan to build it.
R-17  F-1 APPROVED — new loop per slice, walking only declared rows — WITH ONE
      CONDITION FORCED BY F-2. Because advance_state performs no transition
      validation, "walk only declared rows" is a discipline with nothing enforcing
      it. Therefore the slice walk MUST call conversation_graph.validateTransition
      itself before every hop and fail closed on a rejection, and an SU must prove
      an undeclared hop is refused. PHASE-56 will not ride on an unenforced
      invariant. This is local self-enforcement, not a fix to F-2.
R-18  LOOP_ID RE-POINTING MUST BE PROVEN NON-DESTRUCTIVE. Two obligations:
      (i) an SU asserting slice 1's loop directory is BYTE-IDENTICAL after slice 2
          completes (your S389 leg — now binding);
      (ii) at Step 0.5, enumerate every reader of project_state.loop_id and state
           for each whether re-pointing changes what it sees. A reader that
           silently starts reading slice 2's artifacts while meaning slice 1's is
           a defect, and it is cheaper to find now than at the gate.
R-19  F-3 APPROVED. MVP_MAX_SLICES = 3, as a single named constant in
      mvpLoopEngine.js with its own line in 24_MVP_LOOP_CONTRACT.md so raising it
      later is a one-line decision, not a refactor. It bounds slice count, NOT
      iterations; ITERATION_CAP remains the sole authority over iterations and its
      strict boot-lock is untouched. Your rejected alternative (one loop, no reset,
      slice 2 untested) is recorded and rejected — untested output contradicts
      Blueprint D.2. BINDING on the message: when any bound is reached the owner is
      told what he CAN do next, not merely that he is blocked. A limit message with
      no exit is a dead end wearing a polite sentence.
R-20  F-4 IS A BINDING INVARIANT. Slice N's accepted-criteria set MUST be a strict
      superset of slice N-1's, verified deterministically in code and NEVER trusted
      to the provider. Add an SU that proves the regression property directly:
      after slice 2 builds, slice 1's acceptance criteria still pass. Without that
      SU the invariant is asserted, not proven. This was the best finding in your
      Step 0 — a scoped-down slice 2 would have silently deleted slice 1's
      functionality, and it would have surfaced at the gate, on real money.
R-21  F-2 GOES TO BACKLOG, NAMED AND UNMINIMIZED: "orchestration.advance_state
      performs no transition validation; conversation_graph.validateTransition has
      no runtime caller; the 28-row frozen table is documentation, not enforcement;
      the boot-lock checks only state count/set and ITERATION_CAP." Not a PHASE-56
      regression, not fixed here (R-1), and PHASE-56 must neither exploit nor
      depend on it — see R-17.
R-22  REMAINING DISPOSITIONS. F-5 approved: unmappable requests fail closed in
      plain Arabic, never invent ACs; disclose in W-5. F-7 approved: doctor stays
      35, follow the PHASE-54/55 precedent, and record the CLAUDE.md §11.1 tension
      in the artifact — surfacing it instead of silently picking was correct.
      F-8 approved: correct the header in place, no rename. F-9 noted. F-10: request
      the window at C1 and I will relay it; do not restart unannounced. W-0 R-12
      verdict ACCEPTED — small, revertible, do not defer.

== GO — SCOPED ==
GRANTED:
  - D0: artifacts/decisions/DECISION-2026-08-04-phase-56-mvp-loop-slice-2.md
    (scope incl. A-1/W-6, rulings R-1..R-14 verbatim PLUS R-15..R-22 and A-1,
     your F-1..F-10 with dispositions, CTO-F-A, gates, budget)
    + PROMPT-STAGE-56.md in root
    + progress/status.json -> current_task=PHASE-56-MVP-LOOP-SLICE-2 (IN_PROGRESS),
      next_phase=PHASE-57-PENDING-DECISION
  - W-0 CODE (the two service files). Do NOT run the restart/logon cycle — the
    owner has not given a window. Write the change, then hold.

NOT GRANTED YET: W-1 and beyond.
After D0 + W-0 code, post a SHORT Step 0.5 addendum (no further code) containing:
  1. The W-6 seam under R-15, with the COMPLETE live-file list it implies. If it
     breaches (b) or (c), say so and I will backlog it instead.
  2. The R-16 mechanism: exactly where the owner's Gate-1 act is captured and how
     his words reach the audit row verbatim.
  3. The R-18(ii) enumeration of loop_id readers.
  4. Restated N and both closure counts, now that W-6 adds scenarios. Your N=7 /
     387-0-5 (392) figures are superseded.
  5. One line each confirming R-17, R-19, R-20 are implementable as written, or an
     F-# if not.
Then STOP. I will issue the W-1 GO on that addendum.

$0 throughout. The Gate #10 estimate you sketched ($0.35-0.75) is noted for
planning only and is NOT an approval.

**END OF PROMPT-STAGE-56**
