# DECISION — PHASE-36: Permission Real-Path Hardening (L3)

**Decision ID:** DECISION-2026-06-17-phase-36-permission-real-path-hardening
**Date:** 2026-06-17 (CLOSED 2026-06-18)
**Status:** CLOSED — 2026-06-18 (see §6 Closure)
**Owner approval:** CTO scope ratified in chat — "no half-solutions / highest professionalism" (2026-06-17). Owner-ratified targets: C1 traversal containment, C2 active-project write boundary, C3 PROMPT-mode boot safety + dead-rule cleanup.
**Phase predecessor:** PHASE-35 TRULY CLOSED (reviewer_v5 + security_v6), tag `phase-35-complete`.
**Real spend (this step):** **$0.00** — read-only probe + mock RED scenarios only.

---

## 0. Why this phase exists

The PHASE-36 §0 PROBE confirmed the L3 choke-point **is** wired on the real path —
every L2 tool passes through `permissionPolicy.authorize()` before `execute()`
([_registry.js:114-131](../../code/src/runtime/tools/_registry.js#L114-L131)), the default
registry installs the real policy ([_registry.js:239-241](../../code/src/runtime/tools/_registry.js#L239-L241)),
and a real write path (`POST /api/ai-os/project/build-project` → `buildProject()` →
`builder.materialize` → `fs.write_file`) fires `authorize()` before the write.

But the probe found **3 gaps** of exactly the project's primary recurring failure
shape — *scenario-green / real-broken*. This phase hardens them. This decision artifact
is the **plan + frozen scope**; it writes the RED scenarios that PROVE C1 & C2 first.
The fix (C1+C2+C3, turning the reds green + the C3 assertion) is **PROMPT-B**.

---

## 1. The gaps (probe evidence)

### C1 — `..` traversal defeats the FORGE_SELF scope deny *(scenario-green / real-broken)*
`checkScope` prefix-matches the **raw** input string and never resolves `..`:
- `extractWritePath` returns `input.path` verbatim ([permissionRules.js:74-75](../../code/src/runtime/permission/permissionRules.js#L74-L75)).
- `_normalisePath` strips backslashes + leading slashes only — **no `..` resolution**
  ([permissionRules.js:110-117](../../code/src/runtime/permission/permissionRules.js#L110-L117)).
- The `artifacts/` prefix match therefore succeeds on `artifacts/../code/...` and returns
  `WORKSPACE_WRITE` allowed ([permissionRules.js:142-150](../../code/src/runtime/permission/permissionRules.js#L142-L150)).

The L2 tool's `safeResolve` only guards the **repo-root** boundary, not the sub-zone
boundary ([fs_tools.js:10-16](../../code/src/runtime/tools/fs_tools.js#L10-L16)) — so
`artifacts/../code/src/x.js` resolves to `<root>/code/src/x.js` (inside root → "safe") and
**WORKSPACE_WRITE writes Forge internals** (`code/`, `docs/`, `bin/`, `package.json`).
This is the exact distinction that is supposed to separate WORKSPACE_WRITE from
DANGER_FULL_ACCESS. SU scenarios only test clean FORGE_SELF paths (which correctly deny),
so the gap is invisible to the suite today.

### C2 — no active-project write boundary
`checkScope` is **prefix-scoped, not project-scoped**: any path under `artifacts/` (incl.
`artifacts/projects/<any-id>/`) is allowed in WORKSPACE_WRITE
([permissionRules.js:142-150](../../code/src/runtime/permission/permissionRules.js#L142-L150)).
The only project-scoped gates are `vision_lock_rule` (docs paths only,
[vision_lock_rule.js:20-34](../../code/src/runtime/permission/rules/vision_lock_rule.js#L20-L34))
and `builtproject_vision_rule`. So while project **A** is active, a plain `fs.write_file`
into `artifacts/projects/B/...` succeeds — project A can overwrite project B.

### C3 — PROMPT-mode boot deadlock + 2 dead/raw rules
- **PROMPT deadlock:** there is **no** `/api/permission/*` endpoint feeding
  `prompter.respond()` (grep of `apiServer.js` finds only the orchestration `respond-gate`).
  If `FORGE_PERMISSION_MODE=PROMPT` is ever set, every real-path write calls
  `prompter.request()` ([permissionPolicy.js:158-159](../../code/src/runtime/permission/permissionPolicy.js#L158-L159))
  and blocks to a 5-min timeout → DENY
  ([permissionPrompter.js:58-64](../../code/src/runtime/permission/permissionPrompter.js#L58-L64)).
  PROMPT is documented as "operates" but is a runtime deadlock.
- **Dead hard-deny:** `delete_active_project.applies()` always returns `false`
  ([permissionRules.js:46-54](../../code/src/runtime/permission/permissionRules.js#L46-L54)) — a
  named rule that never fires.
- **Raw-string scope:** `builtproject_vision_rule` scope check uses `normRoot.startsWith(...)`
  without resolving `..` ([builtproject_vision_rule.js:51-55](../../code/src/runtime/permission/rules/builtproject_vision_rule.js#L51-L55))
  — same class as C1. (`container_privilege_rule` is the one rule that resolves correctly —
  [container_privilege_rule.js:29-33](../../code/src/runtime/permission/rules/container_privilege_rule.js#L29-L33).)

---

## 2. Scope (FROZEN)

**IN scope (PROMPT-B):**
- **C1 — traversal containment + normalization unification.** `checkScope` must resolve the
  write path against root (real relative path) **before** prefix-matching, so `..` cannot
  escape a zone. Unify `..`-resolution into **one shared resolve helper** reused by
  `builtproject_vision_rule` scope and the `absolute_filesystem_root` hard-deny (kill the
  raw-string class entirely). Secure deny reason for the C1 case: **`SCOPE_FORGE_SELF`**.
- **C2 — active-project write boundary.** A write under `artifacts/projects/<X>/` is allowed
  only when `<X>` is the active project; a cross-project write denies with
  **`SCOPE_CROSS_PROJECT`**. **Real-path requirement (the whole point of this phase):** the
  active project must reach the policy on the *real* path. Today `conversationEngine` and
  `materializerEngine` pass only `{ root }` as ctx — **no project id**
  ([materializerEngine.js:120](../../code/src/runtime/orchestration/materializerEngine.js#L120),
  conversationEngine `reg.invoke("fs.write_file", …, { root })`). PROMPT-B MUST resolve this
  via **one** of:
  - **(B-pref) file-based** — `checkScope` reads `activeProjectManager.getActiveProject()`
    (`artifacts/projects/active_project.json`). Real-path-robust by construction (enforced in
    the policy regardless of caller); **recommended**.
  - **(B-alt) ctx-based** — thread `active_project_id` into ctx on *every* real write path.
    Stricter to get right (a missed path = real-broken), so it MUST ship with a
    conversation/apiserver scenario proving end-to-end enforcement, not just a tool-level one.

  The RED scenario S326 supplies the active project via `ctx.active_project_id` (the only
  in-suite signal that does not mutate the shared live `active_project.json`); if PROMPT-B
  picks (B-pref), it adjusts S326's setup to the chosen source — the **outcome** assertion
  (`DENIED` / `SCOPE_CROSS_PROJECT`) is stable either way.
- **C3 — PROMPT boot fail-fast** (no silent deadlock): at boot, if the active mode is `PROMPT`
  and no respond surface is wired, fail-fast with a clear reason (deterministic unit
  assertion). **Decide `delete_active_project`:** either activate it (real check) or remove it
  as documentation-only. **Fold** `builtproject_vision_rule` scope onto the shared resolve
  helper from C1.

**OUT of scope (explicit):**
- Building a real PROMPT respond UI / `/api/permission/*` endpoints (deferred — **fail-fast
  only** this phase).
- Touching the choke-point — it works (probe-verified); no change.

---

## 3. Acceptance gates (deterministic)

1. **C1 RED→GREEN** — `S325` flips from RED to GREEN by the C1 fix; asserts `status==DENIED`
   + `reason=="SCOPE_FORGE_SELF"`.
2. **C2 RED→GREEN** — `S326` flips from RED to GREEN by the C2 fix; asserts `status==DENIED`
   + `reason=="SCOPE_CROSS_PROJECT"`.
3. **C3 fail-fast assertion** — a deterministic boot-level unit assertion (PROMPT active +
   no respond surface → fail-fast, not deadlock). Added in PROMPT-B.
4. **No regression** — the 317 existing scenarios stay PASS (after the RED step:
   **317 pass + 2 red + 5 skip = 324 total**; after PROMPT-B: 319 pass + 5 skip).
5. **Track A clean** — no new `fs.*Sync` / `new OpenAI()` outside sanctioned homes; the C1/C2
   logic lives in `code/src/runtime/permission/` only.
6. **§ARC = 8** unchanged; doctor checks / L2 tools / roles counts unchanged.

---

## 4. This step's deliverables (RED + plan only — NO production fix)

- This decision artifact (Status: OPEN).
- **`S325`** `code/src/testing/scenarios/S325_phase36_c1_traversal_forge_self_denied.json` —
  C1, `direct_tool`, WORKSPACE_WRITE, `fs.write_file` path `artifacts/../code/src/_phase36_probe.js`,
  `ctx.preview_only=true` (isolates the authorize decision; zero side effect). **RED now.**
- **`S326`** `code/src/testing/scenarios/S326_phase36_c2_cross_project_write_denied.json` —
  C2, `direct_tool`, WORKSPACE_WRITE, `fs.write_file` into `artifacts/projects/phase36_b/…`
  with `ctx.active_project_id="phase36_a"`; `.keep` fixture registers `phase36_b` for harness
  cleanup. **RED now.**
- **Test-infra enabler (not production):** `scenario_runner._runDirectTool` now merges an
  optional `scenario.ctx` into the invoke ctx —
  `Object.assign({ root }, scenario.ctx || {})`. Backward-compatible (no existing scenario has
  `ctx` → ctx stays `{ root }`; the 317 are behavior-identical). Required to express
  ctx-dependent permission scenarios deterministically **without** mutating the shared live
  `active_project.json`. Adds no `fs.*Sync` → §ARC unaffected.

### 4.1 RED confirmation (captured 2026-06-17, mock, $0)
```
✗ S325  status_equals: expected 'DENIED', got 'PREVIEWED'    ← authorize ALLOWED the
        state.reason:  expected 'SCOPE_FORGE_SELF', got undefined   traversal into code/
✗ S326  status_equals: expected 'DENIED', got 'SUCCESS'      ← cross-project write
        state.reason:  expected 'SCOPE_CROSS_PROJECT', got undefined  EXECUTED (allowed)
```
- **S325 actual = PREVIEWED** (not DENIED): authorize did not deny; with `preview_only` the
  decision is observed with no write (probe trace proves the same allow writes into `code/`
  under real execution). Gap confirmed.
- **S326 actual = SUCCESS** (not DENIED): the cross-project write actually landed in
  `artifacts/projects/phase36_b/` (then harness-cleaned). Gap confirmed.
- Pollution check: no `code/src/_phase36_probe.js`, `phase36_b` removed, `active_project.json`
  unchanged (`test_apiserver_s28`).

**Both gaps are present and RED for the right reason. Scope stands — proceed to PROMPT-B.**

---

## 5. Owner approval

CTO-ratified scope in chat (2026-06-17), "no half-solutions / highest professionalism."
This artifact stays **OPEN** until PROMPT-B lands the fix, turns S325/S326 green, adds the C3
fail-fast assertion, and the closure gate passes.

---

## 6. Closure — 2026-06-18

PHASE-36 (L3 permission real-path hardening) is **CLOSED**. C1 + C2 + C3 implemented across
PROMPT-B…F and CTO-verified. Full SU **321/0/5 (326 total)** on the owner toolchain. Mock-only, **$0**.

### 6.0 — §-1 RETRACTION (recorded prominently)
During C3, the CTO introduced a finding that `apiServer.deleteProject` deleting the **active** project
was a security gap, and directed a `CANNOT_DELETE_ACTIVE` guard (B1 endpoint + B2 tool) plus scenario
S329. **This was an INCORRECT inference made without consulting governance.**
[DECISION-2026-06-07-ux-multiselect-delete.md](DECISION-2026-06-07-ux-multiselect-delete.md) (**D4**,
owner-confirmed via Gate #10) ratifies active-delete with auto-revert to `default_project` as **intended**
multi-select-delete behavior. The finding is **WITHDRAWN**; B1/B2 were reverted (working tree byte-exact
to the originals) and S329 was deleted; the `delete_active_project` rule comment was corrected to state
that D4 governs (active-delete intentionally ALLOWED; the marker stays inert). Caught via **CLAUDE.md §8**
(artifact conflict → stop & ask). S259 (which encodes D4) stays GREEN.

### 6.1 — C1 CLOSED (traversal containment)
`checkScope` now resolves the write path against the workspace root via the shared
`resolveWithinRoot` helper ([_path_util.js](../../code/src/runtime/permission/_path_util.js)) **before**
prefix-matching — no raw-string match — so `artifacts/../code/x.js` collapses to its REAL zone and is
denied **`SCOPE_FORGE_SELF`**. Root is taken from `ctx.root` else the policy's own root (threaded into
`checkHardDeny`/`checkScope`); fail-closed only if neither is known. The policy-root threading fix
restored the 10 orchestration scenarios that the first fail-closed attempt had broken. **S325 GREEN.**

### 6.2 — C2 CLOSED (active-project write boundary)
A write under `artifacts/projects/<seg>/` is denied **`SCOPE_CROSS_PROJECT`** when an EXPLICIT
`ctx.active_project_id` is present and `<seg>` differs from it. **Inert when the active id is absent** —
orchestration loop helpers pass `{ root }` only, so the loop is untouched. The active id is threaded onto
the REAL build write path: `conversationEngine.buildProject` builds `buildCtx = { root,
active_project_id }` and passes it to the materializer + manifest write; `materializerEngine` propagates
`active_project_id` from its incoming ctx onto its inner `fs.write_file` (`writeCtx`). **S326 + S327
GREEN** — S327 drives the **real** `materializerEngine` (not a hand-set tool ctx), with a negative
control proving it fails if the propagation is dropped.

**Documented deferrals (not gaps closed this phase):**
- **(a)** a raw `fs.write_file` with NO ctx targeting project B while A is active is **not** blocked — the
  boundary keys on an explicit `ctx.active_project_id`. Closing it fully needs an orchestration redesign
  (the probe proved a file-based "read the active file in checkScope" approach breaks every orchestration
  scenario). Deferred to a future owner-gated phase.
- **(b)** the `active_project.json` field-name conflict (`project_id` vs `active_project_id`) — a known
  issue; this design sources the active id from `body.project_id`, so it does **not** depend on the file.
- **Structural-confinement finding:** the real build path **cannot** write cross-project anyway — the
  materializer prefixes every write with `artifacts/projects/<input.project_id>/` and `_isSafePath`
  rejects `..`, and `buildProject` sets `input.project_id == active`. The boundary is defense-in-depth
  that arms the materializer write; S327 proves the arming on the real engine.

### 6.3 — C3 CLOSED (PROMPT boot fail-fast + honest dead-rule comment + .gitignore)
- **PROMPT-mode boot FAIL-FAST:** `createPolicy` throws when the resolved control mode is `PROMPT` and no
  respond surface is wired (`opts.prompt_respond_surface !== true`) — no silent 5-min stall-then-DENY.
  `opts.prompt_respond_surface` is the future-proof opt-in; the self-test harness opts in because
  `_autoDenyPrompter` is a real responder; production `getDefaultPolicy()` does **not**, so a real
  `FORGE_PERMISSION_MODE=PROMPT` boot still fails fast. Runtime PROMPT branches untouched. **S328 GREEN.**
- **Honest dead-rule comment:** `delete_active_project` comment corrected to state that active-delete is
  intentionally ALLOWED per D4 (inert marker; NOT activated). No active-delete enforcement (D4 honored).
- **.gitignore:** `artifacts/llm/decision_log.json` kept **TRACKED** (per its "KEEP committed … until
  >1MB" comment); the `test_conv_*` `conversation_context.json` SU byproducts now ignored (and untracked
  at closure via `git rm --cached`).

### 6.4 — Final metrics
- Full SU **321 / 0 / 5 (326 total)** on the owner toolchain (Windows). Orchestration cluster
  S139/S140/S145–S156 GREEN. New/changed scenarios: **S325, S326, S327 (C1/C2), S328 (C3)**; **S329
  removed** (retraction).
- **§ARC = 8** (no new side-effect channel) · **L2 = 80** · **roles = 13** · **doctor = 35**.
- **Track A clean** — no new `fs.*Sync` / `child_process` / `fetch` / `new OpenAI` in production. The net
  production deltas are: C1 (`_path_util.js` + `checkScope`/`permissionPolicy` root threading), C2
  (`checkScope` cross-project rule + `conversationEngine.buildProject` buildCtx + `materializerEngine`
  writeCtx), C3 (`permissionPolicy.createPolicy` fail-fast + `permissionRules` B3 comment).
- Mock-only; **$0** real spend across the entire phase.

**Closure checkpoint:** [_phase_36_checkpoints/stage_c3.md](_phase_36_checkpoints/stage_c3.md) (with the
per-stage mids: `stage_c1_mid.md`, `stage_c2_mid.md`, `stage_c3_mid.md`).
**Ratification:** CTO-verified C1 + C2 + C3 in chat. **LOCAL commit only** — push/tag await an explicit
owner/CTO "push GO". Next: **PHASE-37-PENDING-DECISION** (owner-gated backlog only — the C2 deferral
orchestration redesign, §ARC code-vs-ledger drift, Fixture Engine, provider-switch-to-Anthropic).
