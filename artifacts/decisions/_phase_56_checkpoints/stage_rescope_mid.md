# PHASE-56 — C2 (after W-1 + W-2): stage_rescope_mid

**Date:** 2026-08-05
**Phase:** PHASE-56 — MVP Loop Slice 2 (re-engagement after ACCEPTED) + Boot Repair
**Plan artifact:** `artifacts/decisions/DECISION-2026-08-04-phase-56-mvp-loop-slice-2.md`
**Baseline for every diff in this document:** `da8c6f05` (immutable; the tag `phase-55-complete` peels to it)
**Spend this checkpoint: $0.00.** Mock-only throughout. No real provider call was made.

---

## 0. Freshness markers (content, not filename — PROMPT §3)

- `mvpLoopEngine.js` exports `MVP_MAX_SLICES` (= 3), `SLICE_WALK`, `validateWalk`,
  `validateNextSliceScope`, `interpretReengagement`, `MVP_BOUND_EXITS_AR`.
- `MVP_TRANSITIONS.ACCEPTED` is `["SCOPE_DERIVED"]` (was `[]` at `da8c6f05`).
- Scenario files S389–S394 exist; suite total is **391**.
- `scripts/service/resurrect_hidden.vbs` accepts a 3rd argument and builds
  `pm2 start "<ecosystem>" --update-env`.

---

## 1. R-29 — the pip3 predicate, MEASURED (CTO-F-D was correct; my inference was wrong)

**What I claimed at W-1:** "pip3 resolves on PATH but is not executable (Permission
denied), so S57 SKIPs." That was evidence from a **bash exec attempt**. The runner does
not use bash — `_probeRequiredBinary` (`scenario_runner.js:891`) invokes
`env.probe_binary` through a fresh READ_ONLY policy + registry, which spawns with
`shell: false`. My evidence did not establish the mechanism. CTO-F-D stands.

### Raw output — the runner's exact predicate, both binaries

```
===== env.probe_binary("pip3", ["--version"]) — RAW =====
{
  "status": "SUCCESS",
  "output": {
    "stdout": "pip 24.2 from C:\\Users\\Khaled Elmasry\\AppData\\Local\\Programs\\Python\\Python312\\Lib\\site-packages\\pip (python 3.12)\r\r\n",
    "stderr": "",
    "exit_code": 0,
    "timed_out": false
  },
  "metadata": {}
}
--> _probeRequiredBinary would return: true

===== env.probe_binary("pip", ["--version"]) — RAW =====
{
  "status": "SUCCESS",
  "output": {
    "stdout": "pip 24.2 from C:\\Users\\Khaled Elmasry\\AppData\\Local\\Programs\\Python\\Python312\\Lib\\site-packages\\pip (python 3.12)\r\r\n",
    "stderr": "",
    "exit_code": 0,
    "timed_out": false
  },
  "metadata": {}
}
--> _probeRequiredBinary would return: true
```

### Determination: **branch (b)** — the probe SUCCEEDS; the skip is not an absence

Corroborating measurements, all $0:

| Evidence | Result |
|---|---|
| `node bin/forge-test.js --scenario S57` (S57 alone, real harness) | **`✓ S57` — ALL PASS 1/0/0** |
| S57 inside the full suite (4 consecutive runs, 2026-08-04) | **`○ S57` — `skip: binary not found: pip3`** |
| S57 inside the full suite (2 consecutive runs, 2026-08-05, this checkpoint) | **`✓ S57` — passes; only the 5 docker skips remain** |
| Probe latency, 5 consecutive runs | 254 / 212 / 203 / 211 / 202 ms against `PROBE_TIMEOUT_MS = 5000` (~24× headroom at rest) |

So the skip is **intermittent and load-correlated**, not environmental. The binary is
present and working the whole time.

### F-16 (new) — `_probeRequiredBinary` reports every failure as "binary not found"

`_probeRequiredBinary` returns `!!(result && result.status === "SUCCESS")`, collapsing
**denied / timed-out / spawn-error / any non-SUCCESS** into `false`; the runner then
renders that single boolean as `skip_reason: "binary not found: " + binary`
(`scenario_runner.js:916-922`). The message therefore asserts something the code never
measured. A scenario can silently SKIP on a machine where the binary is present, working,
and 24× inside the timeout — which is what happened four times on 2026-08-04.

**Consequence for gates:** a SKIP that means "we could not tell" is indistinguishable from
a SKIP that means "not installed", so the closure count silently moves. **NOT FIXED**
(R-1 scope lock; R-29(b) instruction). Logged in §8.

---

## 2. R-30 — cleanup and the hermeticity proof

### (i) Authorized cleanup — executed, then UNDONE by events (see §7)

The three directories were removed with a guarded script (name must match
`^test_[a-z0-9_]+$` and resolve under `artifacts/projects/`):

```
removed: artifacts/projects/test_s389_mvp  -> exists now: false
removed: artifacts/projects/test_s390_max  -> exists now: false
removed: artifacts/projects/test_s390_exhausted  -> exists now: false
```

They were **restored** immediately afterwards — see §7. Nothing is deleted in the tree now.

### (ii) Hermeticity — S389 twice back-to-back, run-1 scratch left in place

```
scratch present before run 1: false
scratch present after  run 1: true
scratch present after  run 2: true

run 1: {"transition_accepted_to_scope_derived":true,"reengage_branch_reached":true,"ideation_not_triggered":true,"new_loop_created":true,"loop_id_repointed":true,"status_scope_derived":true,"slice_index_two":true,"slices_append_only":true,"slice1_record_preserved":true,"graph_halted_at_env_report":true,"gate1_not_crossed":true,"slice1_loop_dir_byte_identical":true}
run 2: {"transition_accepted_to_scope_derived":true,"reengage_branch_reached":true,"ideation_not_triggered":true,"new_loop_created":true,"loop_id_repointed":true,"status_scope_derived":true,"slice_index_two":true,"slices_append_only":true,"slice1_record_preserved":true,"graph_halted_at_env_report":true,"gate1_not_crossed":true,"slice1_loop_dir_byte_identical":true}

IDENTICAL ACROSS RUNS: true
RUN 2 ALL TRUE (passes with run-1 scratch present): true
```

Run 2 additionally inherits a stale slice-2 UUID loop directory from run 1 and still
passes, because every assertion targets the **current** `loop_id`. S389 re-seeds its own
project state, vision and slice-1 loop directory on entry, so leftovers cannot make it go
green for the wrong reason.

### (iii) Backlog — logged in §8.

---

## 3. W-1 — RED then GREEN (verbatim)

### RED (scenarios written first; no production code existed)

```
FAILURES DETECTED — 379 passed, 3 failed, 6 skipped (388 total)

✗  S389   mvp re-engagement seam ...
       FAIL assertion [state_field_equals]: state.transition_accepted_to_scope_derived: expected true, got false
       FAIL assertion [state_field_equals]: state.reengage_branch_reached: expected true, got false
       FAIL assertion [state_field_equals]: state.ideation_not_triggered: expected true, got false
       FAIL assertion [state_field_equals]: state.new_loop_created: expected true, got false
       FAIL assertion [state_field_equals]: state.loop_id_repointed: expected true, got false
       FAIL assertion [state_field_equals]: state.status_scope_derived: expected true, got false
       FAIL assertion [state_field_equals]: state.slice_index_two: expected true, got false
       FAIL assertion [state_field_equals]: state.slices_append_only: expected true, got false
       FAIL assertion [state_field_equals]: state.graph_halted_at_env_report: expected true, got false
       FAIL assertion [state_field_equals]: state.gate1_not_crossed: expected true, got false
✗  S390   mvp slice bounds ...
✗  S391   mvp slice walk ...
```

### GREEN

```
ALL PASS — 382 passed, 0 failed, 6 skipped (388 total)   exit 0
✓  S389   ✓  S390   ✓  S391
```

### The executed slice walk (S391 evidence, read from the new loop's audit log)

```
OWNER_INTENT -> ARCHITECT_DESIGN          [VACUOUS_SKIP]
ARCHITECT_DESIGN -> SPEC_WRITER_FORMALIZE [VACUOUS_SKIP]
SPEC_WRITER_FORMALIZE -> REVIEWER_SPEC    [VACUOUS_SKIP]
REVIEWER_SPEC -> COST_ESTIMATE            [VACUOUS_SKIP]
COST_ESTIMATE -> ENV_REPORT               [VACUOUS_SKIP]
```

Halted at `ENV_REPORT`. No `GATE_APPROVE` row exists (`gate1_not_crossed`). Per CTO-F-B,
`VACUOUS_SKIP` was **already** a sanctioned `transition_type`
(`loop_state.js:13-15`), so contract §12.2 is untouched — this strengthens F-1: the slice
walk needs no schema change of any kind.

### R-17 refusals are non-vacuous (measured)

```
validateWalk(SLICE_WALK)                             -> {"ok":true}
validateWalk(["REVIEWER_CODE_AND_SECURITY","TEST_DESIGN"])
  -> {"ok":false,"error_code":"MVP_UNDECLARED_HOP",
      "error_detail":"REVIEWER_CODE_AND_SECURITY -> TEST_DESIGN: No transition defined from 'REVIEWER_CODE_AND_SECURITY' to 'TEST_DESIGN'"}
validateWalk(["COMPLETE","BUILDER"])
  -> {"ok":false,"error_code":"MVP_UNDECLARED_HOP",
      "error_detail":"COMPLETE -> BUILDER: Terminal state 'COMPLETE' has no outgoing transitions"}
```

The check runs **twice**: once over the whole plan before the loop is created, and again
per hop immediately before each `advance_state`. The per-hop check is the one that
protects, because `advance_state` validates nothing (F-2/R-21).

### Two judgements, stated explicitly at the CTO's instruction

1. **`CAP_REACHED` stays terminal.** Only `ACCEPTED` gained an outgoing edge. A slice that
   exhausted `ITERATION_CAP` is not a launchpad for another slice — had it been one, R-19's
   slice bound would be trivially circumventable: burn a slice to CAP_REACHED, re-engage,
   repeat, and the "3 slices × 5 iterations" ceiling would mean nothing.
2. **S390 requires no mock response at all, and that is the proof.** Both bounds are
   evaluated *before* the provider is reached — the `sliceBoundCheck` branch returns ahead
   of the `interpretReengagement` call — so a bound-reached project performs **zero
   `agent.invoke` calls and incurs zero spend**. The claim is not "S390 passes"; it is
   **"the bound is pre-spend and cannot cost the owner anything"**, and the absence of any
   `mock|...|scenario:S390A` key in `mock_responses.json` is the evidence.

---

## 4. W-2 — RED then GREEN (verbatim)

### RED

```
FAILURES DETECTED — 1 passed, 2 failed, 0 skipped (3 total)

✓  S392   (see the mutation RED below — this locks behaviour delivered in the W-1 drop)
✗  S393   slice N's accepted-criteria set is a STRICT SUPERSET ...
       FAIL assertion [status_equals]: status: expected 'SUCCESS', got 'FAILED'
       FAIL assertion [state_field_equals]: state.equal_set_rejected: expected true, got undefined
       FAIL assertion [state_field_equals]: state.dropped_criterion_rejected: expected true, got undefined
       FAIL assertion [state_field_equals]: state.dropped_file_rejected: expected true, got undefined
       FAIL assertion [state_field_equals]: state.rejection_is_typed: expected true, got undefined
       FAIL assertion [state_field_equals]: state.rejection_names_offenders: expected true, got undefined
       FAIL assertion [state_field_equals]: state.genuine_growth_accepted: expected true, got undefined
       FAIL assertion [state_field_equals]: state.engine_scope_passes_invariant: expected true, got undefined
       FAIL assertion [state_field_equals]: state.engine_scope_is_cumulative: expected true, got undefined
       FAIL assertion [state_field_equals]: state.engine_scope_keeps_files: expected true, got undefined
       FAIL assertion [state_field_equals]: state.engine_scope_partitions_spec: expected true, got undefined
✗  S394   REGRESSION PROOF ...
       FAIL assertion [status_equals]: status: expected 'SUCCESS', got 'FAILED'
       FAIL assertion [state_field_equals]: state.guarded_scoped_spec_has_slice1_acs: expected true, got undefined
       (… all ten fields undefined — validateNextSliceScope did not exist)
```

### DISCLOSURE — S392 was already green at W-2's RED, and why

S392 locks behaviour that landed in the **W-1** code drop (`interpretReengagement`, the
`NOT_IN_SPEC` / `NOT_A_BUILD_REQUEST` branches, verbatim `owner_request`). Its honest RED
is the W-1 RED above, where the entire branch was absent. To satisfy R-8 on its own terms
I produced a **mutation RED**: the "provider may choose only from what it was shown" guard
was temporarily disabled, and S392 fails exactly where it should —

```
✗  S392   mvp re-engagement interpretation is provider-driven ...
       FAIL assertion [state_field_equals]: state.unoffered_id_rejected: expected true, got false

FAILURES DETECTED — 0 passed, 1 failed, 0 skipped (1 total)
```

The guard was restored immediately and the full suite re-run green (§5). I am recording
this rather than presenting S392's first-run pass as if it were a W-2 RED.

### GREEN

```
✓  S392   ✓  S393   ✓  S394
```

### R-20 — the invariant EXERCISED (S394), not merely asserted

Both legs run the real `materializerEngine` and then **execute the generated program**
with `node` through L2 `shell.run_in_workspace`, reading real stdout.

**Stated plainly:** this is **not** `builtproject.run_scenarios`. That harness's only
setup action is `start_server`, which unconditionally polls `wait_for_port`
(`harness_runner.js:177-215`); using it would have added the known port-bound flake class
(PHASE-24 backlog) to the suite. Executing the generated program directly exercises the
same property and adds no flake. The causal chain is real — a codegen stub conditioned on
the scoped spec emits a feature only when that feature's AC id appears in the prompt, so
**the scope determines the code**.

| Leg | Scope fed to `scopedSpec` | Generated `src/app.js` after execution |
|---|---|---|
| **GUARDED** | slice 2 cumulative (AC-1, AC-2, AC-3) | prints `CREATE_OK`, `LIST_OK:1`, `DELETE_OK` — slice 1 survived |
| **CONTROL** | shrunken slice-2-only (AC-3) | `const notes = [];` + delete only — **`CREATE_OK` and `LIST_OK` gone** |

Control leg's actual generated file, verbatim:

```js
const notes = [];
const i = notes.findIndex(n => n.id === 1); if (i !== -1) notes.splice(i, 1); console.log('DELETE_OK');
```

That is precisely the silent deletion F-4 predicted, reproduced on executed code. The
control is what makes the guarded leg meaningful: it proves the probe can see the defect.
`validateNextSliceScope(SHRUNK, SLICE1, spec).valid === false` — the production guard
rejects that scope, so it can never reach the materializer through the engine.

### W-2's decisions

- **`validateNextSliceScope`** rejects: an equal set (STRICT growth required), any dropped
  accepted criterion, and any dropped file — each typed `MVP_SLICE_NOT_SUPERSET` with the
  offending ids named. The engine calls it; the provider only proposes.
- **`files` for slice N = every path in `spec.files_to_create`.** Declared rationale: the
  spec provides no criterion→file mapping, so the only *deterministic* choice guaranteed
  both sufficient for the added criteria and non-dropping for the accepted ones is the full
  declared set. It is a superset of slice N-1's files by construction. Over-inclusion is
  the safe direction — the builder regenerates a coherent whole rather than a fragment.

---

## 5. Suite, gates, and both closure counts

```
ALL PASS — 386 passed, 0 failed, 5 skipped (391 total)   exit 0
```

Two consecutive full runs on 2026-08-05 give this number, with S57 passing both times.

| Gate | Result |
|---|---|
| Suite | **386 / 0 / 5 (391)**, exit 0 |
| Scenario files | 391 = 385 + 6 (S389–S394) |
| Arithmetic | 380 baseline + 6 = 386 ✓ |
| `conversationEngine.js` vs `da8c6f05` | **+260 / −0** — pure insertion (R-23) |
| `mvpLoopEngine.js` vs `da8c6f05` | **+312 / −2** — the two deletions are `ACCEPTED: Object.freeze([]),` (the phase's purpose) and a trailing comma in `initMvpLoopBlock`. Nothing else. |
| Track A on added live lines | **CLEAN — zero** `fetch(` / `child_process` / `fs.*Sync(` / `new OpenAI(` |
| doctor | exit 0 — 35 checks, **31 PASS / 4 WARN / 0 FAIL** |
| §ARC | **10** · L2 tools **81** · roles **13** |

**Closure counts restated (R-6, unchanged):** **393 / 0 / 5 (398)** normal PATH ·
**392 / 0 / 6 (398)** Python-absent. Remaining to build: S388, S395, S396, S397, S398,
S399, S400 (7 of the 13).

---

## 6. Ruling status after C2

| Ruling | Status |
|---|---|
| R-16 | Mechanism in place — walk halts at `ENV_REPORT`; `gate1_not_crossed` asserted. The owner's act itself lands in W-6/S399. |
| R-17 | **DISCHARGED** — plan-level + per-hop `validateTransition`, fail-closed, S391. |
| R-18(i) | **DISCHARGED** — S389, non-vacuous (6 files in the snapshot). |
| R-18(ii) | Discharged at Step 0.5 (14 readers enumerated). |
| R-19 | **DISCHARGED** — S390, both bounds, exits in the message, pre-spend. |
| R-20 | **DISCHARGED** — S393 (invariant) + S394 (exercised with a control). |
| R-23 | **HELD** — zero-deletion on `conversationEngine.js`; the two `mvpLoopEngine.js` deletions enumerated above. |
| R-25 | Pending W-6/S399 (`mvp_slice_gate1.json` + `slices[]`, joined by `(loop_id, ts)`). |
| R-26 | Held — every owner-facing string is inside `result.message`. |
| R-27 | Pending S398 (`/api/ai-os/chat/stream`). |
| R-29 | **DISCHARGED** — branch (b); F-16 raised, not fixed. |
| R-30 | **DISCHARGED** — (i) executed then reverted per §7; (ii) proven; (iii) logged. |

---

## 7. F-17 (new, and it needs a CTO decision) — the owner committed mid-session, capturing harness scratch

Between the W-1 report and this checkpoint the owner committed and pushed. `HEAD` moved
`463f4b91` → `327d3070` across three commits (`Update status.json`, `U`, `U`). Twenty-one
files were captured, and **nine of them are harness scratch that must never be tracked**:

```
artifacts/projects/test_s389_mvp/{ai_os/conversation_context.json, project_state.json, vision.md}
artifacts/projects/test_s390_exhausted/{ai_os/conversation_context.json, project_state.json, vision.md}
artifacts/projects/test_s390_max/{ai_os/conversation_context.json, project_state.json, vision.md}
```

This is the CTO-F-F hazard realised: the commit was not restricted to explicit paths.

**What this did to R-30(i).** The authorization was for *untracked* scratch. By the time I
executed it the premise had silently changed — those paths were tracked — so my removal
registered as **nine tracked-file deletions**. I detected it in the very next
`git status`, **restored all nine from `HEAD` (`git restore --source=HEAD`)**, and
re-verified: no deletions remain in the tree, and the suite is green on the restored tree.

**Decision needed from you.** These nine files are now in history and should be removed in
a dedicated, explicitly-staged commit — that is a repo-history action on the owner's
branch and I will not take it unasked. Two further consequences worth naming:
`test_s390_max` / `test_s390_exhausted` are **orphans of a superseded design** (S390 now
uses one project, `test_s390_mvp`), so nothing will ever regenerate or clean them; and W-1
code that was meant to stay local until closure is now pushed.

**The `da8c6f05` baseline is unaffected** — every diff in this document is computed against
it, and R-6/R-23 remain exactly as measured.

---

## 8. Backlog raised at C2 (none fixed — R-1)

1. **`PROBE_FAILURE_REPORTED_AS_BINARY_NOT_FOUND` (F-16).** `_probeRequiredBinary` collapses
   denied / timed-out / spawn-error / any non-SUCCESS into `false`, and the runner renders
   it as `"binary not found: <binary>"`. A scenario can SKIP with that message on a machine
   where the binary is present, working, and 24× inside the probe timeout — measured four
   times on 2026-08-04, while `env.probe_binary` returned `pip 24.2` and S57 passed in
   isolation. Makes the closure count non-deterministic under load.
2. **`S389_CLEANUP_LOSES_TO_WINDOWS_LOCK` (R-30 iii).** `cleanup_project`'s `rmSync` is
   best-effort and loses to a Windows lock on the freshly-written UUID loop directory, so
   S389's scratch persists across runs while S390/S391's does not.
3. **`SCRATCH_COMMITTED_TO_HISTORY` (F-17).** Nine harness scratch files tracked by the
   owner's mid-session commit; two of the three directories are orphans of a superseded
   design and will never be regenerated or cleaned.

---

## 9. Next

W-3 (budget re-check + plain-language remaining budget, R-5) → W-6 (owner-reachable
enablement under R-15/R-24) → C3 (Gate #10 criteria FIRST, R-13) → W-4 → W-5 → C4.

**C1 remains open** pending the owner's restart window for W-0's executed logon transcript.

**STOP — awaiting CTO GO.**
