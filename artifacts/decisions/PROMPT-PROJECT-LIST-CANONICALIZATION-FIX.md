################################################################################
# PROMPT — PROJECT LIST CANONICALIZATION + GHOST-DIR FIX (+ Select All)
# Authority: DECISION-2026-06-07-project-list-canonicalization-fix.md (APPROVED)
# Amends the multi-select task. Backend fix — HIGHER blast radius. Step 0 GO required.
################################################################################

CONTEXT (confirmed on the live machine, ground truth):
- artifacts/projects/ contains FOUR collision pairs whose dir names collapse under
  normalizeProjectId to the same id:
    _reference_todo_api (REAL, full data)        + reference_todo_api (empty ghost)
    _s150_abort_test    (real fixture)           + s150_abort_test    (empty ghost)
    pcst_flask-no-readme (hyphen)                + pcst_flask_no_readme (underscore)
    pcst_tailwind-nextjs-blog (hyphen)           + pcst_tailwind_nextjs_blog (underscore)
- listKnownProjectIds() dedups by RAW dir name → both members of a pair pass → the list
  maps each through normalizeProjectId → the SAME project_id appears twice.
- deleteProject(id) normalizes → deletes the canonical dir; the non-canonical twin survives;
  then persistProjectState("default_project") rebuilds the registry, calling
  buildProjectState("_reference_todo_api") → normalizeProjectId → ensureDir(reference_todo_api)
  → RE-CREATES the ghost in the same second (proven by timestamp Jun 7 13:37).
- The multi-select FE is correct. The bug is backend. It also breaks single delete.

OBJECTIVE: make the project list show each project ONCE with a correctly-addressable id,
make deletion permanent (no regeneration, no undeletable phantom), and add Select All.

────────────────────────────────────────────────────────────────────────────────
§0  STATE INHERITANCE + BLAST-RADIUS INSPECTION  — **STOP for GO, do NOT implement**
────────────────────────────────────────────────────────────────────────────────
Read status.json (confirm phase_22 CLOSED, this is the ux multi-select continuation).
Then produce a written inspection (no code changes):

0.1  Paste the FULL body of normalizeProjectId (workspaceHelpers.js ~754). State exactly
     what it does (lowercase? strip leading `_`? `-`→`_`? collapse repeats?). Define
     "canonical dir" precisely: a dir whose name === normalizeProjectId(name).

0.2  List every directory currently in artifacts/projects/ and mark each canonical or
     NON-canonical (name ≠ normalize(name)). Confirm ONLY the 4 known pairs' non-canonical
     members (_reference_todo_api, _s150_abort_test, pcst_flask-no-readme,
     pcst_tailwind-nextjs-blog) are non-canonical — flag any others.

0.3  Find and quote the ensureDir call inside buildProjectState (apiServer.js ~624-703).
     Identify EVERY caller of buildProjectState. Classify each as a WRITE path (legitimately
     needs the dir, e.g. persisting a real project's state) vs a READ/LIST path (registry
     rebuild loop, list mapping — must NOT create dirs).

0.4  Map every caller of: listKnownProjectIds, persistProjectState, deleteProject. For each,
     note whether filtering non-canonical dirs out of listKnownProjectIds would change its
     behavior (especially: does the registry rebuild or any scenario REQUIRE _reference_todo_api
     or another `_`-dir to appear in the list/registry?).

0.5  Confirm createProject / activateProject create their dirs through a path that will STILL
     work after F1 (i.e. the target dir is created when a real project's state is written),
     so F1 does not break project creation.

0.6  Propose the EXACT diff for:
     • F1 — make buildProjectState side-effect-free: remove its ensureDir; ensure the
       legitimate WRITE path (persistProjectState writing the target id's state file) still
       creates the target dir — either because writeFile/writeJson already mkdirs the parent
       (verify and quote it) or by adding a single ensureDir for the TARGET id only, right
       before the write. The registry-rebuild loop and list mapping must create NO dirs.
     • F2 — in listKnownProjectIds: skip non-canonical dirs (name ≠ normalize(name)) and
       dedup by canonical id, so each canonical project appears once and `_`/hyphen dirs never
       leak. (If 0.4 shows a hard dependency on a `_`-dir in the registry, do NOT change
       listKnownProjectIds blindly — STOP and report; we'll filter at the listProjects layer
       instead.)
     Show before/after for the affected functions. Then STOP and wait for GO.

DO NOT touch deleteProject's logic, createProject, activateProject, any endpoint, any role,
Doctor, or §ARC. No new dependency. §ARC stays 8.

════════════════════════════════════════════════════════════════════════════════
AFTER GO — implement in this order. Mid-checkpoint STOP before the FE (F3).
════════════════════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────────────────────
§1  F1 — buildProjectState becomes read-only (no ghost creation)
────────────────────────────────────────────────────────────────────────────────
Apply the F1 diff from 0.6. Invariant after this: calling buildProjectState(id) for any id
(canonical or not) creates NO directory. The only place a project dir is created is the
explicit write of a real project's own state (create/activate/persist of THAT id).

────────────────────────────────────────────────────────────────────────────────
§2  F2 — canonical, deduped, system-clean list
────────────────────────────────────────────────────────────────────────────────
Apply the F2 diff from 0.6. After this, the project list (and registry rebuild, unless 0.4
forced the listProjects-layer variant) contains only canonical dirs, each once. Non-canonical
dirs (_reference_todo_api, _s150_abort_test, the hyphen dirs) are excluded from the list and
remain untouched on disk.

────────────────────────────────────────────────────────────────────────────────
§3  F4 — regression scenario (reproduces the exact bug)
────────────────────────────────────────────────────────────────────────────────
Add ONE scenario (next free id; max existing is S259 → use S260) that, against a temp
workspace, materializes a collision: create a canonical project dir `regr_collide` AND a
non-canonical twin `_regr_collide` (or a hyphen twin), then:
  a. assert listProjects returns the canonical id EXACTLY ONCE (no duplicate, twin not listed),
  b. delete the canonical project via deleteProject,
  c. call listProjects/persistProjectState again and assert the canonical dir is NOT
     re-created (no ghost) and the id no longer appears.
Use the existing fixture mechanism you added for S259 if helpful. Mock-only, $0.

────────────────────────────────────────────────────────────────────────────────
§4  MID-CHECKPOINT — STOP and report (before any FE change)
────────────────────────────────────────────────────────────────────────────────
Run the FULL suite: `node bin/forge-test.js`. Report:
  • total / pass / fail / skip, and the names of any failures (sandbox env-deltas are expected
    on non-Windows; on your Windows machine expect 0 fail). THIS IS THE PRIMARY REGRESSION GATE
    given the blast radius — if any non-env-delta scenario regressed, STOP and report, do not
    proceed.
  • Track A grep: confirm no NEW fs.*Sync / fetch / new OpenAI / child_process outside §ARC.
  • Confirm §ARC count unchanged (8), and that you changed ONLY apiServer.js / workspaceHelpers.js
    (+ the new scenario file). List the files touched.
Wait for CTO verification + GO before §5.

────────────────────────────────────────────────────────────────────────────────
§5  F3 — "Select All" in the multi-select UI (FE)
────────────────────────────────────────────────────────────────────────────────
In ProjectsView.tsx, add a "Select all / Clear" control above the list that toggles selection
of ALL visible deletable projects (visibleProjects minus default_project). When all are
selected it reads "Clear"; otherwise "Select all (N)". default_project is never included.
Reuse the existing `selected` Set + `visibleProjects`. Arabic label is fine (e.g. "تحديد الكل"
/ "إلغاء التحديد"). Keep it minimal; no new dependency.

────────────────────────────────────────────────────────────────────────────────
§6  BUILD + FINAL VERIFY — STOP and report
────────────────────────────────────────────────────────────────────────────────
  • `npm run build` for web/apps/forge-workspace; confirm a NEW bundle hash and that the old
    web/assets/index-*.js is replaced. TypeScript must compile clean.
  • Re-run FULL suite once more; report total/pass/fail/skip.
  • Report the new bundle filename.
Then STOP for CTO independent verification (zip → extract → full suite → grep → bundle check)
before Gate #10.

────────────────────────────────────────────────────────────────────────────────
§7  GATE #10 (owner) + CLOSURE — only after CTO verification passes
────────────────────────────────────────────────────────────────────────────────
Owner test: reload /projects → each project shows ONCE (no duplicate-named rows); owner uses
Select All, deletes the cruft (pcst_*, reference_todo_api, s150_abort_test) in one action; after
the list reloads they STAY gone (no reappearance); Select All works; app stable. Screenshot.
On pass: append a closure note to the decision artifact + update the status.json ux-task record
(no phase-number change); commit + push.

NOTES:
- Trust+Verify: every claim here will be independently re-verified by the CTO from a fresh zip.
- $0.00 — no LLM calls anywhere in this task.
- If anything deviates from the above or Step 0 reveals an unexpected dependency, STOP and report
  rather than working around it.
################################################################################
