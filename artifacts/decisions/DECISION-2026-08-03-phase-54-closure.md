# DECISION-2026-08-03-phase-54-closure

**Date:** 2026-08-03
**Status:** CLOSED (LOCAL) — push + annotated tag `phase-54-complete` await the CTO's
closure-diff GO
**Phase:** PHASE-54 — Iterative MVP Loop (Slice 1: Owner Review Loop Core)
**Plan artifact:** `DECISION-2026-07-29-phase-54-iterative-mvp-loop.md` (rulings R-1..R-50, errata E-1..E-5)
**Checkpoints:** `_phase_54_checkpoints/stage_core_mid.md` · `stage_loop_mid.md` ·
`stage_preclosure.md` · `stage_gate10_plan.md` · `stage_closure.md`

---

## 1. Outcome — verdict

**PHASE-54 Slice 1 is COMPLETE. Gate #10 = GATE_PASS.**

**What the owner got, in plain terms:** on a project where the MVP loop is switched on, Forge no
longer builds the whole specification and hand you the result at the end. It picks the smallest
slice of your idea that actually runs, builds and tests only that, and then stops and shows you
a plain-language report — what it built, what the tests prove, and how to run it yourself. You
reply in your own words. If you ask for changes, Forge understands them, rebuilds with your
exact wording carried into the code-generation step, and shows you the new result. When you
approve, it continues down the normal pipeline as if nothing unusual had happened. On 2026-08-03
the owner did exactly this in the real interface: he asked in Arabic for each note to record its
creation time and for that time to appear in the add-response and in the list; Forge turned that
one sentence into three concrete changes, rebuilt, re-tested 3/3, re-presented, and on his
"تمام، اعتمده وكمّل" advanced the pipeline.

## 2. Final gate numbers

| Gate | Result |
|---|---|
| SU suite | **376 passed / 0 failed / 5 skipped (381 total)**, exit 0 |
| N (new scenarios) | **11** — S373–S383 ⇒ closure gate **365 + 11 = 376** ✓ |
| Scenario files on disk | 381 (= 376 + 5) |
| Track A (diff-based, ALL added live-surface lines vs `a69de85`) | **0 matches — CLEAN** |
| forge-doctor | exit 0 — `{"ok":true,"summary":"0 critical, 4 warning","total_checks":35,"counts":{"PASS":31,"WARN":4}}` |
| §ARC | **10** (frozen; none added) |
| L2 tools | **81** |
| Agent roles | **13** (registry never grew) |

## 3. Gate #10 — GATE_PASS, with the endpoint caveat stated here

All twelve criteria computed from persisted evidence (`artifacts/spikes/phase54_gate10/real/gate10_result.json`):
c1 scope partition valid · c2 advance suppressed at RUN_TESTS · c3 report facts equal the
artifacts · c4 REFINE interpreted to non-empty changes · c5 changes verbatim in the second
materializer prompt · c6 owner block before repair block · c7 loop_back row from RUN_TESTS with
increment · c8 second review presented · c9 ACCEPT deferred advance parameter-identical ·
c10 cap respected on real cash · **c11a** zero HALT · **c11b** flag-off project byte-untouched —
**all true**. **c12 (AWFT downstream markers) = N/A**: the owner replied to a PASS_REVIEW report
and took the plain ACCEPT path, so no marker exists to propagate; that surface remains proven by
**S380 alone, not by this run**.

**ENDPOINT CAVEAT — stated in this artifact, not only in the checkpoint.** The run **did NOT
reach judgeQuality / Gate 2**. It stopped at `reviewProject`, which returned
`derived_verdict: REQUEST_CHANGES` (reviewer REJECTED with 4 substantively-correct BLOCKERs;
security LOW, 0 BLOCKERs) and looped back to BUILDER — the documented REQUEST_CHANGES branch
working correctly on generator-written code. The driver stopped because `real-c` expects
DOCUMENTATION. **The PASS verdict rests on the twelve criteria — the gate's object is the MVP
loop — and not on the driver's endpoint expectation.** Satisfying the reviewer would prove
generated-code quality, which is outside this phase's scope (R-50 ii).

**Bonus proof obtained live:** the owner's browser rebuilt `project_state.json` (8 keys → 47,
mtime 12:38:48Z → 12:58:25Z) — the exact event that destroyed the 2026-08-02 run — and
`mvp_loop` + `loop_id` survived **byte-identically**, confirming R-39 in the real environment.

## 4. Delivered

- **`code/src/ai_os/mvpLoopEngine.js`** (new): `mvp_loop` state model (6 statuses, frozen
  transition table, fail-closed guard, absent block = OFF per R-1), provider-driven
  `deriveScope` with the AC-partition rule, `assembleMvpReport` (artifact-derived, R-11),
  `interpretFeedback` (structured output only, R-12), persistence helpers. No direct fs.
- **`code/src/ai_os/conversationEngine.js`**: the review gate at host state RUN_TESTS (suppress
  → present → deferred advance), `mvp_review_pending` signal, REFINE threading, R-10 routing,
  R-9 cap surfacing, R-20 `ACCEPT_WITH_FAILING_TESTS` with its forensic trail.
- **`code/src/runtime/orchestration/materializerEngine.js`**: dedicated `owner_changes` prompt
  block (owner first, A-5 repair block last; empty ⇒ byte-identical prompt).
- **`docs/12_ai_os/24_MVP_LOOP_CONTRACT.md`** (new): the Slice-1 contract, including its known
  limitations.
- **SU S373–S383 (11)** plus the S335 invariance extension and the S340 version-pin retarget.

## 5. Ruling ledger R-1..R-50

| # | One line |
|---|---|
| R-1 | Flag-gated per project, default OFF; flag-off path byte-identical to PHASE-53 |
| R-2 | Reuse iteration_controller/materializer/loopback machinery; no parallel loop |
| R-3 | Feedback interpretation is provider-driven structured output; hermetic in TEST |
| R-4 | One iteration-cap source of truth |
| R-5 | No new §ARC (frozen at 10) |
| R-6 | Contract doc = `docs/12_ai_os/24_MVP_LOOP_CONTRACT.md` |
| R-7 | Review gate hosts at RUN_TESTS in the ai_os layer (no 18th graph state); suppress → deferred advance; `mvp_review_pending`, never `gate_pending`; anti-bypass SU |
| R-8 | Dedicated `owner_changes` prompt block; empty ⇒ byte-identical; owner block first, repair last; changes persist across internal loopbacks |
| R-9 | Shared ITERATION_CAP=5; CAP_REACHED surfaced in plain language |
| R-10 | Post-REFINE test failure routes to the owner, not the blind A-5 loop |
| R-11 | Report facts are artifact-derived; providers may only add prose framing |
| R-12 | No keyword matching; UNCLEAR ⇒ clarifying question, no state movement, no HALT |
| R-13 | Restore the environment, never weaken the SU surface to make a red gate green |
| R-14 | S57's missing `requires_binary` is backlog, not fixed here |
| R-15 | Doctor-run status.json drift folds into the next legitimate commit |
| R-16 | `next_phase` may not say PENDING-DECISION while the phase is in progress |
| R-17 | ACCEPTED is terminal in Slice 1; no re-engagement; must not crash or half-engage |
| R-18 | Budget default aligned to 0.05; every wiring path threads provider explicitly |
| R-19 | UNCLEAR turns are recorded in feedback_history too |
| R-20 | ACCEPT on a failing report requires the distinct `ACCEPT_WITH_FAILING_TESTS` decision + compensating controls (named Blueprint D.2 exception) |
| R-21 | S375's R-17 leg proves no-re-engagement, NOT the post-ACCEPT rebuild end to end |
| R-22 | Re-pin the owner identity via the sanctioned path; never weaken the check |
| R-23 | Do not skip documentation; the Gate runs reviewProject → documentProject → judgeQuality |
| R-24 | Read-only prompt decorator approved with five binding conditions |
| R-25 | Criterion 11 reported as 11a (zero HALT) and 11b (flag-off byte-untouched) separately |
| R-26 | Clean-gate sequence: DRY → id-guarded reset → 11b snapshot → real-a |
| R-27 | Credential rotation must be complete and single-sourced before any real leg |
| R-28 | (superseded within the credential thread) |
| R-29 | Restart proof required before the owner's turn |
| R-30 | (superseded by R-31's findings) |
| R-31 | Resolve the credential contradiction mechanically; close the duplicate-override hazard |
| R-32 | Verify the edit landed before spending; STOP at the first failing check |
| R-33 | Remove the editor from the loop — deterministic helper, one command |
| R-34 | (authored but never delivered — see E-3) |
| R-35 | Confirm H3 from on-disk history before the probe |
| R-36 | Check 1 is SUPERSEDED, not waived; CAP-guard divergence recorded durably |
| R-37 | The cap bounds REAL CASH at the same $1.00; estimated divergence warns, never aborts |
| R-38 | Diagnose the real-path defect before any fix, at $0 |
| R-39 | Fix the state normalizer at the source (`...existing`), not the symptom |
| R-40 | Unmetered legacy provider spend recorded as backlog; the cap covers ledger calls only |
| R-41 | Gate #10 restarts clean; no hand-restored state |
| R-42 | Continue the A-5 cycle rather than re-rolling; reset rejected |
| R-43 | Owner restart is a hard precondition, enforced in order |
| R-44 | Driver-only fail-fast plan screen; STOP on a third trip |
| R-45 | Record the R-10 coverage gap on first builds |
| R-46 | Diagnose the generator defect at $0 before changing anything |
| R-47 | `test_designer_v4` prompt fix, narrowly, following the PHASE-47 precedent |
| R-48 | Narrow the guard to root-level field paths only |
| R-49 | Resume from BUILDER; do not reset |
| R-50 | Gate #10 closes as PASS at the ACCEPT boundary; endpoint caveat recorded honestly |

## 6. Errata — with attributions

| # | Attribution | Substance |
|---|---|---|
| **E-1** | **CC (self-reported)** | The D0 credential preflight's three "vault FOUND" rows were vacuous — the probe treated `secret_provider.get`'s envelope as a value and could never return NOT_FOUND. The vault holds none of the three |
| **E-2** | **CTO** | Conflicting editor instructions (Notepad vs VS Code) during the credential rotation |
| **E-3** | **CTO** | R-34 was cited but never delivered to CC; refusing to assume its content was correct |
| **E-4** | **CTO** | Gate #10 was designed on a known-defective dependency (`test_designer` assertion shape, already a PHASE-45 backlog item). Cost ≈ $0.30 |
| **E-5** | **CTO** | R-44(i)'s wording described the root-field case without saying so and predated R-47; the guard matched the ruling text and then rejected the fixed output. Cost $0.10811 |

## 7. Surfaces touched outside Slice 1

| Surface | Ruling | Delta | Justification |
|---|---|---|---|
| `code/src/workspace/apiServer.js` | **R-39** | **+9 / −0** (8 comment + one `...existing,`) | `buildProjectState` rebuilt state from a whitelist and silently dropped foreign keys, so every `listProjects()` destroyed `mvp_loop`/`loop_id`. Pre-existing (byte-identical to a69de85 until this line). Key-delta measured first: 53/54 projects unaffected. Locked by **S382** |
| `docs/10_runtime/18b_ROLE_PROMPTS.md` + `code/src/runtime/agents/roles/test_designer_role.js` | **R-47** | new `test_designer_v4` block (v3 retained, DEPRECATED) + 2-line id bump | v3 had no array guidance, so the generator emitted an unsatisfiable assertion pair twice, blocking the gate. Diagnosis: EXISTS-BUT-UNUSED. Locked by **S383**; S340's pin retargeted (disclosed) |

Both are **pre-existing defects PHASE-54 was the first workload to expose** — neither is a
PHASE-54 regression.

## 8. Backlog (raised, none fixed here)

`S57 requires_binary` gap (R-14) · `RUN_FORGE_BAT_NOT_RESTART_SAFE` (pm2 "Process 0 not found"
+ TypeError at API.js:1718 on restart) · **`UNMETERED-LEGACY-PROVIDER-SPEND`** (R-40) ·
`R10-NO-OWNER-ESCAPE-ON-FIRST-BUILD` (R-45, strengthened by the R-17 live observation) ·
`test_designer` reliability (two consecutive contradictory plans pre-R-47) · ledger estimator
accuracy (est ran ~2.5–4.0x actual; books $0 for small gpt-4o-mini calls).
Carried from earlier phases: F-5 `owner_gate_id: 2` hardcoded on LOOP_BACK rows · `phase_16`
stale `"ACTIVE"` in status.json · `_invokeRole` 30s comment vs 150000ms code · `estimateCost`
does not persist `cost_estimate.json`.

## 9. Spend

**Total real cash: $0.65714 of the owner's approved $1.00** (attempt-1 credential failure $0 ·
validity probe $0.00019 · attempt 1 $0.14511 · attempt 2 + repair cycle $0.17770 · attempt 3
fail-fast $0.11891 · attempt 4 + resume + real-b + real-c-partial $0.21523). All preflight, DRY
and diagnostic legs were $0.

**⚠ The $1.00 cap covers agent-ledger calls only (R-40).** Legacy Stage-A providers call OpenAI
directly and book no ledger row and no providerTrace — proven on 2026-08-02 when a real Arabic
ideation expansion was produced while the ledger gained zero rows. Any spend on that surface is
invisible to the guard. The owner must not be left believing the cap bounds all spend.

## 10. Closure gate — MET

- [x] SU 376 pass / 0 fail / 5 skip (365 + N=11)
- [x] Track A greps clean; doctor exit 0 (31/4/0); §ARC 10; L2 81; roles 13
- [x] Gate #10 REAL, owner-witnessed, flag ON on a fresh demo project — **GATE_PASS** with the
      endpoint caveat above; permanent evidence under `artifacts/spikes/phase54_gate10/` and the
      driver at `scripts/spikes/phase54_gate10.js`
- [x] Closure artifact (this file) + status.json + closure checkpoint
- [ ] Push + annotated tag `phase-54-complete` — **await the CTO's closure-diff GO**

## 11. PHASE-55 seed candidates (owner-gated — NOT decided here)

MVP-loop Slice 2 (re-engagement after ACCEPTED — the R-17/R-45 pair) · `test_designer`
reliability hardening · unmetered legacy provider spend (R-40) · ledger estimator accuracy ·
RUN_FORGE.bat restart-safety · Browser Automation 7-D · Anthropic provider switch.
