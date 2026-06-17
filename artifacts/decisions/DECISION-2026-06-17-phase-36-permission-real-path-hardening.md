# DECISION — PHASE-36: Permission Real-Path Hardening (L3)

**Decision ID:** DECISION-2026-06-17-phase-36-permission-real-path-hardening
**Date:** 2026-06-17
**Status:** OPEN
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
