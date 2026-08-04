# DECISION-2026-08-04-phase-56-mvp-loop-slice-2

**Date:** 2026-08-04 (Step 0 posted + CTO review ACCEPTED WITH RULINGS + scoped D0/W-0 GO, same day)
**Status:** APPROVED — CTO-authored under owner delegation ("قرر بنفسك وانا موافق على توصياتك طالما باعلى درجات الاحترافية", 2026-08-04); Step 0 review ACCEPTED with amendment A-1 and rulings R-15..R-22
**Author:** CTO (Claude) + CC Step-0 findings, bidirectional Trust+Verify
**Phase:** PHASE-56 — MVP Loop Slice 2 (re-engagement after ACCEPTED) + Boot Repair
**Prompt artifact:** `PROMPT-STAGE-56.md` (root; carries the verbatim prompt AND the verbatim CTO Step-0 review)
**Baseline:** tag `phase-55-complete` (annotated `c487d1724fc8cefe9a5d96caee848cb1d5c0b3d0`) → closure commit `da8c6f05760236bf3784533bdf462c34178b2338`. CC-verified locally: the closure commit contains **exactly 4 files**; `git diff --name-only da8c6f05 HEAD` = **`.claude/settings.local.json` only**, i.e. **HEAD's code surface is byte-identical to `da8c6f05`**. SU baseline **380/0/5 (385), exit 0** (re-run at Step 0) · doctor exit 0, 35 checks 31 PASS / 4 WARN / 0 FAIL · §ARC 10 · L2 81 · roles 13.

---

## 1. Problem / goal

PHASE-54 delivered the MVP loop's Slice 1 and closed `ACCEPTED` as a **terminal**
status with the limitation stated explicitly in `24_MVP_LOOP_CONTRACT.md §3.b`
(PHASE-54 R-17): once the owner accepts an MVP slice, the loop never re-engages. The
owner's next sentence — "دلوقتي عايز أضيف كذا" — falls through
`conversationEngine.js:1117` (status ≠ AWAITING_OWNER_REVIEW) → `:1124`
(conversation_mode is PIPELINE) → `:1129-1130` into `ideationEngine.expandIdea()` and
is swallowed. PHASE-56 closes that.

PHASE-55 measured a second defect and deliberately did not absorb it (PHASE-55 backlog
item 5, R-18(c)): the `ForgeAPI` AtLogOn task runs **`pm2 resurrect` only**, while
`%USERPROFILE%\.pm2\dump.pm2` is **`[]`** — so a fresh install does **not** auto-start
Forge at logon. PHASE-56 repairs it as a bounded, independently revertible first item.

Work items, in the order fixed by A-1/R-15:

- **W-0 BOOT AUTO-START REPAIR** — make a logon actually bring Forge up; must coexist
  with the post-PHASE-55-W-4 `RUN_FORGE.bat` in both orders.
- **W-1 RE-ENGAGEMENT SEAM** — `ACCEPTED` stops being a dead end.
- **W-2 NEW SLICE SCOPE DERIVATION** — the follow-up is interpreted provider-driven,
  zero keyword matching, and becomes the next slice's scope.
- **W-3 BUDGET RE-CHECK + PLAIN-LANGUAGE REMAINING BUDGET**.
- **W-6 OWNER-REACHABLE ENABLEMENT** *(added by A-1 — see §3)*.
- **W-4 GATE #10** — owner-witnessed real run in Arabic on the real surface.
- **W-5 DOCS** — contract updates + owner-facing plain-language disclosures.

**Execution order (binding, per R-15):** W-0 → C1 → W-1 → W-2 → C2 → W-3 → W-6 → C3 → W-4 → C4 → W-5/closure.
One item at a time.

---

## 2. Rulings — verbatim record

### R-1..R-14 (PROMPT-STAGE-56 §1, CTO-authored 2026-08-04)

```
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
```

### A-1 — AMENDMENT TO R-1 (CTO, 2026-08-04, issued because CC's F-6 is correct)

```
A-1 — AMENDMENT TO MY OWN R-1 (scope lock), issued because F-6 is correct
R-1 is amended to add W-6. Reason on the record: initMvpLoopBlock(true) is called
from exactly two places, a test helper and the Gate #10 driver. No production path
enables the MVP loop, so PHASE-54 shipped a capability the owner cannot reach and
PHASE-56 as scoped would improve an unreachable feature. That is "feature complete
/ owner cannot reach it" — the product-level form of the failure this project has
already paid for twice. Shipping a third phase of MVP-loop work behind an
unreachable flag is not scope discipline, it is scope theatre. R-1 otherwise stands
in full: nothing else is added.
```

### CTO-F-A (CTO finding on CC's Step 0 — load-bearing correction)

```
CTO-F-A — THE WALK TO TEST_DESIGN CROSSES AN OWNER GATE. You wrote "no fabricated
Gate-1 approval", but conversation_graph.js declares the row as
  ENV_REPORT -> TEST_DESIGN, trigger: "Gate 1 owner response = APPROVE"
There is no other declared way in. So the slice walk either synthesizes an owner
approval — fabricating consent, which is not acceptable at any scope — or the owner
genuinely approves. See R-16.
```

**CC disposition:** ACCEPTED without reservation. CC's Step-0 §0.4(b) claimed the
`OWNER_INTENT → … → TEST_DESIGN` walk involved "no fabricated Gate-1 approval"; the
declared row is [`conversation_graph.js:76-80`](../../code/src/runtime/orchestration/conversation_graph.js#L76)
`{ from: "ENV_REPORT", to: "TEST_DESIGN", trigger: "Gate 1 owner response = APPROVE",
gate_check: "Gate 1 APPROVE" }` and there is **no other declared entry to TEST_DESIGN**.
A `VACUOUS_SKIP`-typed hop across that row would still be Forge asserting an owner
approval the owner never gave. The correction stands; R-16 governs.

### R-15..R-22 (CTO Step-0 review GO, 2026-08-04 — binding)

```
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
```

---

## 3. Scope, including A-1/W-6

**IN SCOPE:** W-0, W-1, W-2, W-3, W-6, W-4, W-5 as defined in `PROMPT-STAGE-56.md §2`
as amended by A-1/R-15.

**W-6 (added by A-1) — OWNER-REACHABLE ENABLEMENT.** A path by which the owner himself
turns the MVP loop on for a project, opt-in only, default OFF everywhere, no `web/**`
work, ONE seam named at Step 0.5, provider-driven if it interprets owner language. If
the seam requires `apiServer.js` routing changes, a new endpoint, or a new L2 tool, it
is a **STOP-AND-REPORT and a backlog item — not absorbed**.

**Forensic reason W-6 exists (on the record):** `initMvpLoopBlock(true)` has exactly two
callers in the tree — `code/src/testing/helpers/mvp_loop_test_helper.js` and
[`scripts/spikes/phase54_gate10.js:269`](../../scripts/spikes/phase54_gate10.js#L269).
No production code path writes `mvp_loop.enabled = true`. PHASE-54's capability is
therefore unreachable by the owner; PHASE-56 without W-6 would improve an unreachable
feature.

**OUT OF SCOPE (R-1 stands otherwise in full):** Browser Automation 7-D · estimator
reconciliation toward the seam's pricing table · Anthropic provider switch · legacy
async/v2 provider migration · frontend work of any kind · the F-2/R-21 transition-table
enforcement defect · spec amendment for out-of-spec follow-ups (F-5).

---

## 4. Design decisions (Step-0 approved, as amended)

### D1 — Re-engagement WITHOUT a new mvp_loop status and WITHOUT a new graph state

`ACCEPTED → SCOPE_DERIVED` is added to `MVP_TRANSITIONS`
([`mvpLoopEngine.js:39`](../../code/src/ai_os/mvpLoopEngine.js#L39) today reads
`ACCEPTED: Object.freeze([])`). `SCOPE_DERIVED` is reused at its documented meaning; the
existing `SCOPE_DERIVED → BUILDING → AWAITING_OWNER_REVIEW → ACCEPTED` cycle then replays
verbatim. **No 7th mvp_loop status. No 18th graph state. The 17-state boot-lock and the
strict `ITERATION_CAP === 5` boot-lock ([`orchestration/_registry.js:34-59`](../../code/src/runtime/orchestration/_registry.js#L34)) are untouched.**

A new arm is inserted in `processMessage` immediately after the existing
AWAITING_OWNER_REVIEW arm ([`conversationEngine.js:1117-1120`](../../code/src/ai_os/conversationEngine.js#L1117)),
guarded by `isMvpEnabled(state) && status === "ACCEPTED"` — a **pure insertion**, so
flag-off behavior is unchanged by construction (R-6).

### D2 — New loop per slice, walking ONLY declared rows, self-enforced (R-17)

`designTests` requires `TEST_DESIGN` ([`conversationEngine.js:3617`](../../code/src/ai_os/conversationEngine.js#L3617)),
`buildProject` requires `BUILDER` ([`:1972`](../../code/src/ai_os/conversationEngine.js#L1972)),
`runTests` requires `RUN_TESTS` ([`:2308`](../../code/src/ai_os/conversationEngine.js#L2308)),
and §2.2 has **no** row from any post-RUN_TESTS state back to `TEST_DESIGN`. Slice N
therefore runs in a **new loop** created by `orchestration.start_loop`, reusing slice 1's
owner-approved `spec.json` / `design.json` (copied into the new loop dir via L2), walked
along declared rows only.

**R-17 condition (binding):** because `orchestration.advance_state` performs **no**
transition validation ([`orchestration_tools.js:145-172`](../../code/src/runtime/tools/orchestration_tools.js#L145)),
the slice walk MUST itself call `conversation_graph.validateTransition` before every hop
and **fail closed** on rejection. An SU must prove an undeclared hop is refused. PHASE-56
does not ride on an unenforced invariant.

**R-16 condition (binding):** the `ENV_REPORT → TEST_DESIGN` hop is gated on
`"Gate 1 owner response = APPROVE"`. Forge presents the derived slice scope in plain
Arabic **together with the remaining budget**, and **the owner's own confirmation is that
Gate-1 approval**, recorded verbatim in the audit row. Synthesizing, defaulting, or
inferring it is FORBIDDEN. Asking for a feature is not approving the plan to build it.

Structural consequence (R-7 satisfied by construction): loop artifacts live under
`artifacts/projects/<pid>/orchestration/<loop_id>/`
([`loop_state.js:53-58`](../../code/src/runtime/orchestration/loop_state.js#L53)), so slice
1's `mvp_scope.json` / `mvp_report.json` / `test_plan.json` / `build_manifest.json` are
physically untouchable by slice 2. R-18(i) makes byte-identity an SU obligation, not an
assumption.

### D3 — The cap bound (R-4 / R-19)

`iteration_count` resets to 0 per slice because each slice is a new loop. Three bounds,
each surfaced to the owner in plain Arabic **with what he can do next** (R-19):

1. **Per slice:** `ITERATION_CAP = 5`, constant and boot-lock untouched.
2. **Slice count:** `MVP_MAX_SLICES = 3`, a single named constant in `mvpLoopEngine.js`
   with its own line in `24_MVP_LOOP_CONTRACT.md`. Hard ceiling **3 × 5 = 15** rebuild
   iterations per project. It bounds **slice count, not iterations**; `ITERATION_CAP`
   remains the sole authority over iterations.
3. **Structural:** slice N's AC set ⊋ slice N−1's (D4), and the spec's AC set is finite.

**Rejected and recorded (R-19):** one loop, no reset, bound = the existing 5 shared across
slices. It cannot reach `TEST_DESIGN`, so slice 2 would be **built but not tested** —
contradicting Blueprint Part D.2 (tests are the primary evidence).

### D4 — Strict-superset invariant (R-20, binding)

Slice N's `acceptance_criteria_ids` MUST be a **strict superset** of slice N−1's, verified
**deterministically in code**, never trusted to the provider. Reason (CC F-4): the built
workspace is **per-project** ([`conversationEngine.js:2086`](../../code/src/ai_os/conversationEngine.js#L2086),
[`materializerEngine.js:219`](../../code/src/runtime/orchestration/materializerEngine.js#L219))
while manifest/test-plan are per-loop; a scoped-down slice 2 would regenerate the
entry/server file from a spec no longer describing slice 1 and **silently delete slice-1
functionality**. Consequence: the slice-2 test plan is cumulative, so `runTests` re-proves
slice 1. **An SU must prove the regression property directly** — after slice 2 builds,
slice 1's acceptance criteria still pass.

### D5 — Budget re-check (R-5) + plain-language remaining budget

One **additive** export `budgetStatus(project_id, {root}) → { cap_usd, spent_usd,
remaining_usd, pct }` in `budget_enforcer.js`, reusing the existing `_readVisionCaps` +
`ledger.getTotalCost` + `_legacySpendSince` — i.e. **the same number the cap itself
reads**, PHASE-55 W-1 legacy Stage-A spend included. `checkBudget` is not modified, so the
L3 rule ([`agent_budget_rule.js:87`](../../code/src/runtime/permission/rules/agent_budget_rule.js#L87))
is provably unaffected. Surfaced as the **first** action of the re-engagement handler —
before any provider call, before scope derivation, before `start_loop` — and again in the
R-16 Gate-1 presentation. At or over cap: **nothing is created, no provider is called, no
state moves**; a plain-Arabic refusal naming the numbers.

### D6 — Provider-driven interpretation (W-2, R-22/F-5)

The follow-up is classified and mapped to remaining ACs by a provider through
`reg.invoke("agent.invoke", …, { role_id: "mvp_reengage" })` — the PHASE-54
`mvp_scope`/`mvp_feedback` `ctx.role_id` precedent, so the 13-role registry does **not**
grow. **Zero keyword matching** on owner text (PHASE-54 R-8/R-12). The owner's wording is
threaded **verbatim** into the slice record. A request that maps to no remaining AC
**fails closed** in plain Arabic ("this needs a change to the specification — that is a new
build cycle") and **never invents ACs**; disclosed to the owner in W-5.

---

## 5. CC Step-0 findings F-1..F-10 — dispositions

| # | Finding (abridged; full text in the Step-0 post) | Disposition |
|---|---|---|
| **F-1** | Re-engagement must reach `TEST_DESIGN`; §2.2 has no row back to it. Proposal: new loop per slice, walking only declared rows. | **APPROVED (R-17)** with the mandatory `validateTransition` self-enforcement + an SU proving an undeclared hop is refused. **Corrected by CTO-F-A/R-16**: the `ENV_REPORT → TEST_DESIGN` hop is an owner gate and requires a REAL owner act. |
| **F-2** | `orchestration.advance_state` never calls `validateTransition`; the 28-row frozen table is enforced nowhere at runtime; the boot-lock checks only state count/set + `ITERATION_CAP`. | **CONFIRMED by CTO against the code. BACKLOG (R-21)**, named and unminimized. Not a PHASE-56 regression, not fixed here (R-1). PHASE-56 must neither exploit nor depend on it. |
| **F-3** | The R-4 crux: `MVP_MAX_SLICES = 3` as a new constant of a different kind. | **APPROVED (R-19)** — single named constant in `mvpLoopEngine.js` + its own contract line. Alternative recorded and rejected. |
| **F-4** | Per-project workspace vs per-loop manifest ⇒ a scoped-down slice 2 silently deletes slice-1 functionality. | **CONFIRMED. BINDING INVARIANT (R-20)** + a direct regression SU. CTO: "the best finding in your Step 0". |
| **F-5** | Out-of-spec follow-ups map to no AC. | **APPROVED (R-22)** — fail closed in plain Arabic, never invent ACs, disclose in W-5. |
| **F-6** | No production path sets `mvp_loop.enabled = true`; only a test helper and the Gate-#10 driver. | **CONFIRMED by CTO against the code. This finding changed the shape of the phase** — it produced amendment **A-1** and the new work item **W-6 (R-15)**. |
| **F-7** | `CLAUDE.md §11.1` L4 (a doctor check per new feature) vs PROMPT §5.2 / S209 pinning `check_count = 35`. | **APPROVED (R-22)** — doctor stays 35 per the PHASE-54/55 precedent; the tension is recorded here rather than silently resolved. Surfacing it was correct. |
| **F-8** | After W-0, `resurrect_hidden.vbs` no longer only resurrects; `CLAUDE.md §7` forbids deletion, so no rename. | **APPROVED (R-22)** — correct the header in place. |
| **F-9** | Fresh measurement re-confirms `dump.pm2 = []` while forge runs live (pid 48312). | **NOTED (R-22)**. W-0's premise is measured, not inherited. |
| **F-10** | Proving W-0 takes the owner's live server down briefly. | **R-22** — request the window at C1; the CTO relays it. **Do not restart unannounced.** |

---

## 6. SU plan + closure-gate arithmetic

**N and both closure counts are RESTATED at Step 0.5**, because W-6 (A-1) and the SUs
forced by R-17 / R-18(i) / R-20 add scenarios. CC's Step-0 figures (N = 7 → 387/0/5 (392);
Python-absent 386/0/6 (392)) are **SUPERSEDED and recorded here only as history**.

Fixed regardless of the final N:
- Numbering starts at **S388** (highest on disk today is S387).
- **R-9:** at least one scenario per owner-facing capability crosses the real entry point
  (in-process server + live HTTP, S382/S386 pattern). A direct-engine scenario does not
  discharge it.
- **R-17:** an SU proves an undeclared graph hop is refused by the slice walk.
- **R-18(i):** an SU asserts slice 1's loop directory is **byte-identical** after slice 2
  completes.
- **R-20:** an SU proves slice 1's acceptance criteria still pass after slice 2 builds.
- **R-6:** a flag-off invariance lock whose RED is produced by mutation (temporarily
  removing the `isMvpEnabled` guard), per the S381 precedent — never a vacuous RED.
- **R-8:** every behavior has RED-before-GREEN evidence pasted into a checkpoint.

---

## 7. Live-surface lock (R-10 — binding; any file outside this list = STOP-AND-REPORT)

**Declared at Step 0 and RE-BOUND at Step 0.5 for whatever W-6's seam implies.**

**W-0 (2 — this D0's granted scope):**
1. `scripts/service/resurrect_hidden.vbs`
2. `scripts/service/windows_task_scheduler_install.bat`

**W-1/W-2/W-3 live code (3):**
3. `code/src/ai_os/mvpLoopEngine.js`
4. `code/src/ai_os/conversationEngine.js`
5. `code/src/runtime/agents/budget_enforcer.js`

**W-6 (TBD at Step 0.5 under R-15(c) — one seam, or STOP-AND-REPORT).**

**Test surface (4):** `code/src/testing/helpers/mvp_loop_test_helper.js` ·
`code/src/testing/helpers/service_lifecycle_test_helper.js` ·
`code/src/testing/scenarios/S388…` · `code/src/runtime/agents/adapters/mock_responses.json`

**Docs (2):** `docs/12_ai_os/24_MVP_LOOP_CONTRACT.md` · `docs/10_runtime/17_AGENT_RUNTIME_CONTRACT.md`

**Artifacts/driver (5):** this file · `PROMPT-STAGE-56.md` · `progress/status.json` ·
`artifacts/decisions/_phase_56_checkpoints/{stage_boot_mid,stage_rescope_mid,stage_gate10_plan,stage_preclosure}.md` ·
`scripts/spikes/phase56_gate10.js`

**Explicitly NOT modified — any touch is a STOP:** `conversation_graph.js` ·
`iteration_controller.js` · `orchestration/_registry.js` · `orchestration_tools.js` ·
`materializerEngine.js` · `apiServer.js` · any role file · `INSTALL_FORGE.bat` ·
`RUN_FORGE.bat` · `ecosystem.config.js` · `web/**`.

**No new L2 tool (stays 81) · no new role (stays 13) · no new §ARC (stays 10) · no new
doctor check (stays 35, per R-22/F-7).**

---

## 8. Checkpoints + stop-and-report

C1 `_phase_56_checkpoints/stage_boot_mid.md` (after W-0) ·
C2 `stage_rescope_mid.md` (after W-1+W-2) ·
C3 `stage_gate10_plan.md` (after W-3+W-6 — **criteria FIRST**, R-13) ·
C4 `stage_preclosure.md` (after W-4). Each followed by a HARD STOP and a fresh zip.

**STOP-AND-REPORT triggers (PROMPT §4):** any new §ARC · any new graph state · any change
to `ITERATION_CAP` or its boot-lock · any new mvp_loop status before its ruling · any live
file outside the locked list · any SU regression · any real spend without a fresh separate
owner "أيوه" · any flag-off behavior change · any W-6 seam that breaches R-15(b)/(c) ·
discovering a work item is larger than scoped.

---

## 9. Closure gate (PROMPT-STAGE-56 §5, deterministic)

1. SU exact: **380 + N** pass / 0 fail / 5 skip (385 + N), N declared at Step 0.5, plus
   the Python-absent alternate count.
2. Track A clean · doctor 35 checks 0 FAIL · §ARC 10 · L2 tools and roles reported.
3. Every behavior has RED-then-GREEN evidence in a checkpoint; W-0 has an **executed**
   transcript (`dump.pm2` before/after, both orders vs `RUN_FORGE.bat`).
4. Flag-off byte-identity proven by a **zero-deletion diff against `da8c6f05`**.
5. Gate #10 = GATE_PASS, owner-witnessed, **with the owner enabling the loop himself
   through the real surface** (R-15) and **giving the slice-N Gate-1 approval himself**
   (R-16), computed from persisted evidence against criteria fixed in C3 before the run.
6. Closure artifact + status.json flip + 4 checkpoints written.
7. Closure commit stays LOCAL until the CTO's push GO after a fresh-zip closure-diff.
   Stage EXPLICIT paths only — never `git add -A`. The annotated tag `phase-56-complete`
   goes on the **CLOSURE COMMIT HASH**, not HEAD.

---

## 10. Budget

**Kill bar $3.00. Mock-default / $0 throughout**, except the Gate #10 real run, which
requires **separate explicit owner approval in chat with the estimate shown FIRST** at C3
(R-14). General delegation does **not** cover real spend. Ledger delta **and** real cash
reported for every real call. CC's planning sketch of $0.35–0.75 for Gate #10 is
**noted for planning only and is NOT an approval** (CTO, 2026-08-04).

Spend to date on PHASE-56: **$0.00**.

---

## 10.5 Step 0.5 addendum (CC declaration per the scoped GO — W-1 code awaits CTO GO on this)

**Status at the time of writing:** D0 written · W-0 code written and verified without
running the restart cycle (owner window not yet given, R-22/F-10) · SU re-run after W-0:
**380/0/5 (385), exit 0** · all six S191 predicates re-verified TRUE against the edited
batch file · VBS 2-arg output proven **byte-identical** to `da8c6f05` by executing an
echo-probe of both versions.

### (1) The W-6 seam under R-15 — and the surface facts that force it

**Measured facts about the real UI (read-only; `web/**` untouched per R-15(b)):**
`web/index.html` loads `web/assets/index-BpnJQJQb.js`. The endpoints that bundle actually
references are: `/api/ai-os/chat/stream`, `/api/ai-os/clarification/answer`,
`/api/ai-os/intake`, `/api/ai-os/project`, `/api/ai-os/project/request-idea-summary`,
`/api/ai-os/project/confirm-idea`, `/api/ai-os/project/formalize-spec`,
`/api/ai-os/project/review-spec`, plus `/api/projects*`, `/api/vision`, `/api/kb/sources`,
`/api/system/doctor`, `/api/intake/upload`, `/api/ai/history`.
It references **none** of: `estimate-cost`, `report-env`, `respond-gate`, `design-tests`,
`build-project`, `run-tests`, `review-project`; and it contains **zero** occurrences of
`gate_pending` or `mvp_review_pending`. The SPA source tree has no gate or MVP surface.

**Consequences (all three are findings, not preferences):** the owner's only free-form
surface is **chat**; there is no Gate card to click; and the pipeline past `review-spec`
has no UI and must be driven by a client/driver.

**Seam (ONE, inside R-15's bounds):** `conversationEngine.processMessage` — reached by the
**existing** `POST /api/ai-os/chat/stream` handler ([`apiServer.js:1875`](../../code/src/workspace/apiServer.js#L1875)),
which already calls `processMessage({...body})`. A project still in
CONVERSATION/IDEATION with **no** `mvp_loop` block gets ONE provider classification of the
owner's turn (`reg.invoke("agent.invoke", …, { role_id: "mvp_optin" })` — the
`mvp_scope`/`mvp_feedback` `ctx.role_id` precedent, so the 13-role registry does not grow);
an opt-in writes `mvp_loop = initMvpLoopBlock(true)` with `status: "INACTIVE"`.
`confirmIdea`'s AFFIRM branch already spreads `...state` first
([`conversationEngine.js:1411-1419`](../../code/src/ai_os/conversationEngine.js#L1411)),
so the block **survives into PIPELINE with zero change to `confirmIdea`**, and
`buildProjectState`'s `...existing` (PHASE-54 R-39) carries it across `listProjects()`.

**R-15 compliance:** (a) opt-in only, absent block = OFF, default unchanged ✅ ·
(b) zero `web/**` edits ✅ · (c) **no apiServer routing change, no new endpoint, no new L2
tool** — and therefore **no new live file**: the seam lands in `conversationEngine.js` and
`mvpLoopEngine.js`, both already locked in §7 ✅ · (d) provider-driven, zero keyword
matching ✅.

**Live-file list implied by W-6: NO ADDITIONS.** §7's list stands unchanged.

### (2) The R-16 mechanism — where the owner's Gate-1 act is captured

The slice walk **halts at `ENV_REPORT`** and does not cross the gated row by itself. Forge
replies in plain Arabic with the derived slice scope **and the remaining budget** (R-5).
The owner's next chat turn is classified (APPROVE / REJECT / UNCLEAR, provider-only), and
on APPROVE the handler invokes the **existing** owner-gate path
`respondGate(gate_id: 1, response: "APPROVE")` → `orchestration.respond` → `fireGate`,
which writes `transition_type: "GATE_APPROVE"` with `owner_gate_id: 1`
([`approval_gates.js:202-218`](../../code/src/runtime/orchestration/approval_gates.js#L202))
and advances `ENV_REPORT → TEST_DESIGN`. **Nothing is synthesized: no GATE_APPROVE row can
exist until the owner acts, and an SU asserts exactly that.** No new gate machinery.

Disambiguation without a new status (R-3): the "awaiting slice Gate-1" turn is
`isMvpEnabled(state) && status === "SCOPE_DERIVED"` **with the graph at `ENV_REPORT`**.
Slice 1's `SCOPE_DERIVED` sits at `TEST_DESIGN`, so the graph state separates them.

**F-12 — R-16 cannot be met literally.** The audit-row schema is CLOSED:
`AUDIT_ALLOWED = [ts, loop_id, from_state, to_state, transition_type, mock, cost_usd,
role_invoked, owner_gate_id]` with an explicit `additionalProperties:false` check
([`loop_state.js:10-12, 41-46`](../../code/src/runtime/orchestration/loop_state.js#L10)),
so **the owner's words cannot be written into the audit row** without changing contract
§12.2 and `loop_state.js` — a file outside §7 and a contract change (STOP-AND-REPORT).
This is the same constraint `iteration_controller` hit ("reason in markdown only — schema
additionalProperties:false", [`iteration_controller.js:85-95`](../../code/src/runtime/orchestration/iteration_controller.js#L85)).
**Proposal honoring the intent:** the act is the real `GATE_APPROVE` row (allowed fields
only) and the owner's **verbatim** words are persisted in the same loop directory as
`mvp_slice_gate1.json` plus the `mvp_loop.slices[]` record, joined to the row by
`(loop_id, ts)`. Awaiting the CTO's confirmation of this substitution.

### (3) R-18(ii) — every reader of `project_state.loop_id`

Exactly **14**, all in `conversationEngine.js`, all with identical precedence
`body.loop_id || state.loop_id || null` (explicit body always wins):

| line | function | effect of re-pointing |
|---|---|---|
| 762 | `_handleMvpReview` | **intended** — reviews the current slice |
| 1519 | `formalizeSpec` | **not reached** after slice 1 (guards on SPEC_WRITER_FORMALIZE) |
| 1634 | `reviewSpec` | **not reached** (guards on REVIEWER_SPEC) |
| 1937 | `_buildProjectImpl` | **intended** — builds the current slice |
| 2289 | `runTests` | **intended** |
| 2718 | `reviewProject` | **intended** — reviews the current slice's build |
| 3005 | `documentProject` | **intended** |
| 3278 | `judgeQuality` | **intended** |
| 3469 | `estimateCost` | **not reached** (guards on COST_ESTIMATE) |
| 3595 | `designTests` | **intended** |
| 3775 | `reportEnv` | **not reached** (walk halts at ENV_REPORT without invoking it) |
| 3909 | `deployProject` | **intended** |
| 4071 | `finalizeDeliverable` | **intended** |
| 4161 | `respondGate` | **intended** — this is the R-16 act |

Outside the engine: **`apiServer.js` never reads it** (its only mention is the R-39
comment at :701); `intake_conversation_handler.js:352-367` writes a loop_id it just
created; `mvpLoopEngine` takes it as a parameter. **No reader silently reads slice 2's
artifacts while meaning slice 1's** — every reader is either intended or unreachable in
the slice-N flow. Slice 1's artifacts remain addressable by explicit `body.loop_id`, and
`mvp_loop.slices[]` records each slice's `loop_id` so the history stays navigable.
R-18(i) makes byte-identity an SU obligation.

### (4) Restated N and both closure counts (supersedes N = 7)

**N = 13 — S388…S400.** Driven by the rulings, not padding: R-17 (+1), R-18(i) (folded
into S389), R-19 (+1), R-20 (+2), R-15 (+2), R-16 (+1), R-9 (+1), R-6 (+1).

| SU | Proves | Ruling |
|---|---|---|
| S388 | W-0 meta-lock: VBS 3-arg `start … --update-env`; installer passes ecosystem; 2-arg command byte-identical | W-0 |
| S389 | ACCEPTED reaches the re-engagement branch (not ideation); `ACCEPTED→SCOPE_DERIVED`; slice_index 1→2; append-only `slices[]`; **slice-1 loop dir byte-identical** | W-1, **R-18(i)** |
| S390 | `MVP_MAX_SLICES` and empty-excluded bounds, each with a plain-Arabic message stating **what he can do next** | **R-19** |
| S391 | the slice walk calls `validateTransition` and **refuses an undeclared hop**, fail-closed | **R-17** |
| S392 | provider-only mapping, zero keyword matching, owner wording verbatim; unmappable ⇒ fail-closed, no loop created | W-2, R-22/F-5 |
| S393 | strict-superset invariant enforced **deterministically**; a shrinking provider proposal is rejected | **R-20** |
| S394 | **regression proof** — after slice 2 builds, slice 1's acceptance criteria still pass | **R-20** |
| S395 | budget re-check: at/over cap ⇒ refusal with the numbers and nothing created; under cap ⇒ number present; `checkBudget` byte-identical | W-3, R-5 |
| S396 | opt-in enablement via the chat seam; block survives `confirmIdea` AFFIRM into PIPELINE | **R-15** |
| S397 | **default-OFF lock** — no opt-in ⇒ no `mvp_loop` block at all | **R-15(a)** |
| S398 | **REAL entry point** — `POST /api/ai-os/chat/stream` (the endpoint the served bundle actually calls), with `GET /api/projects` in between; owner-visible content asserted **inside `message`** | **R-9** |
| S399 | slice-N Gate 1 is a real owner act: **no `GATE_APPROVE` row exists until he acts**; after it, the row carries `owner_gate_id: 1` and his verbatim words are in the companion artifact + slice record | **R-16** |
| S400 | flag-off invariance, RED produced by mutation (S381 precedent) | **R-6** |

**Closure counts:** **393 / 0 / 5 (398)** on a normal PATH · **392 / 0 / 6 (398)**
Python-absent (R-6 alternate; W-0 adds no Python dependency, so S57 remains the only
mover).

### (5) R-17 / R-19 / R-20 implementability

- **R-17 — implementable as written.** `validateTransition` is exported
  ([`conversation_graph.js:280-291`](../../code/src/runtime/orchestration/conversation_graph.js#L280))
  and has no side effects; the walk calls it before each hop and fails closed. S391 locks it.
- **R-19 — implementable as written.** `MVP_MAX_SLICES = 3`, one named constant in
  `mvpLoopEngine.js`, one line in the contract. Every bound message states the exits.
- **R-20 — implementable as written.** A deterministic set comparison in code; the provider
  proposes, the code verifies and rejects. S393 + S394 lock it.

### (6) New findings from Step 0.5

- **F-11 — R-6 and W-6 are in direct tension, and R-6 needs re-scoping by ruling.** W-6's
  purpose is a path from flag-OFF to flag-ON, so *any* enablement seam necessarily changes
  behavior on a flag-off project — either Forge asks, or it classifies the owner's turns.
  Byte-identity to `da8c6f05` on the pre-pipeline conversation surface is therefore
  **impossible by construction**. Proposed re-scope: R-6 continues to bind the **pipeline**
  surface in full (every prompt, payload, artifact and state written by `designTests` /
  `_buildProjectImpl` / `runTests` / `reviewProject` stays byte-identical for a project that
  did not opt in), and the disclosed delta is confined to one added classification on the
  pre-pipeline chat turn. **CC will not redefine R-6 unilaterally — awaiting the ruling.**
- **F-12 — R-16's "verbatim in the audit row" is impossible** (closed schema). Substitution
  proposed in (2) above.
- **F-13 — the streaming response is a whitelist, so `message` is the only owner-visible
  channel.** `/api/ai-os/chat/stream`'s `done` event forwards only `message`,
  `suggest_next`, `mode`, `suggested_answers`, `confirmation_key`, `target_state`,
  `current_state`, `project_id` ([`apiServer.js:1895-1905`](../../code/src/workspace/apiServer.js#L1895)).
  `mvp_review_pending`, `mvp_report`, `advanced_to`, `changes`, `escalated` are **all
  dropped**. Every owner-facing item required by R-5, R-16 and R-19 must therefore live
  **inside `result.message`**. Widening the whitelist would be an `apiServer.js` change ⇒
  STOP-AND-REPORT; PHASE-56 will not do it.
- **F-14 — R-9's "real entry point" should be `/api/ai-os/chat/stream` for this phase.**
  S382/S386 used `/api/ai-os/chat`; the served bundle calls only the `/stream` variant.
  Both reach `processMessage`, but only `/stream` is what the owner's browser actually
  hits, and only `/stream` exercises the F-13 whitelist. S398 uses `/stream`.

---

## 11. Backlog raised here (none fixed in PHASE-56)

1. **`ADVANCE_STATE_NO_TRANSITION_VALIDATION` (R-21, named and unminimized):**
   `orchestration.advance_state` performs no transition validation;
   `conversation_graph.validateTransition` has no runtime caller; the 28-row frozen table
   is documentation, not enforcement; the boot-lock checks only state count/set and
   `ITERATION_CAP`.
2. **Spec amendment for out-of-spec follow-ups (F-5/R-22):** a follow-up naming work that
   is in no acceptance criterion cannot be built by a slice; a spec-amendment path is its
   own phase.
3. **`CLAUDE.md §11.1` L4 tension (F-7/R-22):** the rule requires a doctor check per new
   feature; PHASE-54, PHASE-55 and PHASE-56 all ship features with doctor pinned at 35 by
   S209. Reconcile the rule or the pin in a later decision.
4. Carried from PHASE-55: reverse_vision double-count in the cap's ledger · pre-first-activity
   legacy spend visible but not capped (R-25) · streaming spend visible but not costed
   (R-14) · `requires_binary` cannot express pip3-OR-pip · two pricing tables writing one
   ledger (CTO-F-G/F-6) · `workspace_path` drive-letter churn (CTO-F-F).
5. Carried from PHASE-54: `owner_gate_id: 2` hardcoded on LOOP_BACK rows · `phase_16` stale
   `"ACTIVE"` in status.json · `_invokeRole` 30s comment vs 150000ms code · `estimateCost`
   does not persist `cost_estimate.json` · providerTrace response-capture gap on the
   `agent.invoke` path · `getTotalCost` 5-dp display rounding.

---

## 12. Amendments

| # | Date | Substance |
|---|---|---|
| **A-1** | 2026-08-04 | CTO amends his own R-1 to add **W-6** (owner-reachable enablement), because CC's F-6 proved the MVP loop has no production enablement path. Verbatim in §2. R-1 otherwise stands in full. |

---

**END OF DOCUMENT**
