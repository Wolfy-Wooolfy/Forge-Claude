# PHASE-36 §3 (PROMPT-D) — C2 MID-CHECKPOINT

**Date:** 2026-06-18
**Scope of this step:** C2 ONLY (active-project write boundary). C1 already DONE + CTO-verified. C3 is PROMPT-E.
**Status:** C2 core done — S326 GREEN, S327 (new e2e) GREEN; rule + real-path threading landed.

---

## 1. The rule (`checkScope`, AFTER the C1 resolve — uses the resolved `norm`, no raw-string)

[permissionRules.js](../../../code/src/runtime/permission/permissionRules.js), placed immediately
after `const norm = relative;` (C1's resolved root-relative path) and **before** the
`WORKSPACE_WRITE_PREFIXES` loop:

```js
const activeProjectId = ctx && ctx.active_project_id;
if (activeProjectId) {
  const projMatch = norm.match(/^artifacts\/projects\/([^/]+)\//);
  if (projMatch && projMatch[1] !== activeProjectId) {
    return { applicable: true, allowed: false, reason: "SCOPE_CROSS_PROJECT",
             detail: "Path '" + writePath + "' targets project '" + projMatch[1] +
                     "' while active project is '" + activeProjectId + "'" };
  }
}
```

- Fires **only** when `ctx.active_project_id` is present **and** the resolved path's first
  segment under `artifacts/projects/` differs from it.
- **Inert when `ctx.active_project_id` is ABSENT** — orchestration loop helpers and every
  other real write pass `{ root }` only (no active id), so the boundary never touches them.
  This is the C1 fail-closed lesson applied: a boundary that fired without an explicit
  active id would DENY every orchestration loop-state write and explode the loop.
- The seg regex requires a **trailing slash**, so a bare project dir path
  (`project.create`/`activate`, `artifacts/projects/<id>` with no sub-path) is unaffected —
  you can create/activate B before it becomes active.
- Writes to the active project's own dir, and non-`artifacts/projects/` writes, are
  unaffected (fall through to the existing WORKSPACE_WRITE logic).

**MID-CHECK 1** (`-s S325 -s S326 -s S139 -s S140 -s S152`): **5 pass / 0 fail**.
S326 flipped → DENIED/SCOPE_CROSS_PROJECT; S325 stays green; orchestration cluster intact.

## 2. Real-path threading (the source of risk — done precisely)

### 2a. `conversationEngine.buildProject` ([conversationEngine.js](../../../code/src/ai_os/conversationEngine.js))
Built the decision ctx ONCE at the top of the flow:
```js
const buildCtx = { root, active_project_id: normalizeProjectId(projectId) };
```
Passed `buildCtx` (replacing `{ root }`) to **exactly** the two reg.invoke calls that write
the build's OWN files:
- `reg.invoke("builder.materialize", …, buildCtx)`  — the materializer (writes project files).
- `reg.invoke("fs.write_file", { …build_manifest.json }, buildCtx)` — the manifest.

**Left `{ root }` unchanged** on the orchestration helpers and reads:
`orchestration.get_status`, `orchestration.advance_state`, every `fs.read_file`, and the
`role.invoke("builder")` (produces a plan, writes nothing). So **no `active_project_id`
reaches any orchestration loop helper** (loop_state / iteration_controller / summary_writer)
— the boundary stays inert in the loop (no C1-style re-break). buildProject does NOT invoke
loop_state/summary_writer/iteration_controller directly; `advance_state` is the only
orchestration helper it calls and it keeps `{ root }`.

Source = `normalizeProjectId(body.project_id)` — the SAME id the writes target (probe P4-b,
guaranteed-consistent). NOT sourced from `active_project.json` (which has the documented
`project_id` vs `active_project_id` field-name conflict — see deferral 2 below).

### 2b. `materializerEngine.materialize` ([materializerEngine.js](../../../code/src/runtime/orchestration/materializerEngine.js))
The materializer previously dropped its incoming ctx and passed `{ root }` to its inner
`fs.write_file`, so threading to the tool alone would have been inert ("scenario-green /
real-broken"). Added ctx propagation:
```js
const writeCtx = (ctx && ctx.active_project_id)
  ? { root, active_project_id: ctx.active_project_id }
  : { root };
…
const wr = await reg.invoke("fs.write_file", { path: relPath, content }, writeCtx);
```
Inert when no active id is present → the materializer unit tests (S267–S272, called directly
with `{ root }`) are byte-for-byte unchanged.

**MID-CHECK 2** (`§1 set + S25/S27/S28 + S267/S270/S271/S272`): **12 pass / 0 fail**.
S270/S271 (real buildProject → materializer with the threaded ctx) stay green → the build's
OWN writes are ALLOWED (no regression). S267/S272 (direct materializer, no active id) stay
green → boundary inert.

## 3. New e2e scenario S327 (the TRUE closure gate, per Gate #10)

[S327_phase36_c2_real_path_cross_project_denied.json](../../../code/src/testing/scenarios/S327_phase36_c2_real_path_cross_project_denied.json)
· helper [cross_project_write_test_helper.js](../../../code/src/testing/helpers/cross_project_write_test_helper.js)
· mocks `mock|mock-bld-s327|scenario:S327`, `mock|mock-mat-s327|scenario:S327`,
`mock|mock-mat-s327x|scenario:S327X`.

`module_call`, two parts:
- **PART A** — real `engine.buildProject` for the ACTIVE project. buildProject injects
  `ctx.active_project_id = active`; the real materializer writes the build's OWN `app.js`
  (seg==active → ALLOWED) → loop advances BUILDER→RUN_TESTS. Asserts
  `own_project_build_allowed`, `own_file_written`. Proves threading does not break the build.
- **PART B** — the SAME real `materializerEngine`, driven with `input.project_id = victim`
  while `ctx.active_project_id = active`. The §2 ctx propagation carries `active` onto the
  real `fs.write_file`; `checkScope` denies SCOPE_CROSS_PROJECT; the victim sentinel file is
  left byte-for-byte untouched. Asserts `cross_project_denied`,
  `denied_reason_scope_cross_project`, `victim_file_untouched`.

**Negative control (proves S327 is not a false-green):** with the §2b materializer
propagation reverted to `{ root }`, S327 FAILS on exactly the three PART-B assertions
(the cross-project write LANDS, overwriting the victim). Restored after the check.

**Run** (`-s S325 -s S326 -s S327`): **3 pass / 0 fail**.

## 4. Documented deferrals (trade-offs of the ctx-based design — NOT fixed here)

1. **Raw `fs.write_file` with NO ctx targeting project B while A is active is NOT blocked.**
   The boundary is keyed on an explicit `ctx.active_project_id`; a caller that omits it is
   not gated. Closing this needs the strict "read the active file in `checkScope`" approach,
   which the C2 probe PROVED breaks every orchestration scenario (they carry no active id and
   write to their own loop project ≠ the live `active_project.json`). Deliberately left;
   documented.
2. **`active_project.json` field-name conflict** (`project_id` vs `active_project_id`,
   probe P1). This design sources the active id from `body.project_id`, so it does not depend
   on that file. The conflict is a known issue — not fixed here.

### Structural note — why S327's cross-project arm drives the engine, not buildProject
buildProject can **never** drive a cross-project write: `materializerEngine` prefixes every
write with `artifacts/projects/<input.project_id>/` AND `_isSafePath` rejects `..`, and
buildProject always sets `input.project_id == ctx.active_project_id`. So a build's write can
only ever land in its OWN project (always ALLOWED), and the ctx injection is **unobservable**
via a buildProject DENY. Per §3's STOP-AND-REPORT clause, PART B therefore drives the real
`materializerEngine` directly with the cross-project mismatch — the closest honest real-path
attempt — rather than faking it with a direct_tool ctx (S326 already covers the rule at the
tool level). Flagged for CTO verification before PROMPT-E.

## 5. Files changed
- `code/src/runtime/permission/permissionRules.js` — C2 rule in `checkScope`.
- `code/src/ai_os/conversationEngine.js` — `buildCtx` + threaded to materializer + manifest.
- `code/src/runtime/orchestration/materializerEngine.js` — `writeCtx` ctx propagation.
- `code/src/testing/helpers/cross_project_write_test_helper.js` — NEW (S327 helper).
- `code/src/testing/scenarios/S327_phase36_c2_real_path_cross_project_denied.json` — NEW.
- `code/src/runtime/agents/adapters/mock_responses.json` — 3 S327 mock entries.
- `artifacts/decisions/_phase_36_checkpoints/stage_c2_mid.md` — THIS file.

§ARC stays 8 (permission logic + ctx plumbing; no new side-effect channel). Mock-only, $0.
