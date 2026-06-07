# DECISION-2026-06-07 — Project List Canonicalization + Ghost-Dir Fix (amends multi-select task)

> **Status:** APPROVED — CTO decision under owner delegation ("قرر انت ... باعلى احترافية"), 2026-06-07.
> **Amends:** `DECISION-2026-06-07-ux-multiselect-delete.md`. That task's "FE-only" premise is superseded:
> Gate #10 exposed a pre-existing BACKEND bug that blocks reliable deletion. This artifact authorizes the
> backend fix required to make multi-select (and single delete) actually work.
> **Authored by:** CTO advisor, on Claude Code's live-machine diagnosis (ground truth captured).

---

## §1 Root cause (confirmed on the live machine)

On disk there are TWO directories per "duplicate" project whose names collapse to the same id under
`normalizeProjectId`:
- `_reference_todo_api` (real, full data) and `reference_todo_api` (empty ghost) → both normalize to
  `reference_todo_api` (leading `_` stripped).
- `pcst_flask-no-readme` (hyphen) and `pcst_flask_no_readme` (underscore) → both normalize to
  `pcst_flask_no_readme` (hyphen→underscore). Same for `pcst_tailwind*` and `s150_abort_test`.

Failure chain:
1. `listKnownProjectIds()` dedups by RAW dir name (`new Set`), so non-canonical and canonical dirs both pass.
2. The list mapping normalizes each → the same `project_id` appears twice in the list.
3. `deleteProject(id)` normalizes and deletes the canonical dir; the non-canonical twin is untouched.
4. The same `deleteProject` then calls `persistProjectState("default_project")`, which iterates
   `listKnownProjectIds()` → `buildProjectState("_reference_todo_api")` → normalizes → `ensureDir(reference_todo_api)`
   → **re-creates the empty ghost in the same second**.
5. FE refresh re-reads both dirs → the project "comes back".

The multi-select FE is correct. The bug is backend (ghost re-creation during listing + non-canonical dir
collision) and affects single delete too.

## §2 Decided fix

| # | Fix | Detail |
|---|---|---|
| F1 | **Listing is read-only** | Remove/guard the `ensureDir` side effect in the list/registry-build path (`buildProjectState` when invoked for listing/registry). Listing must never create directories. Directory creation stays only on explicit create/activate. |
| F2 | **Canonical, deduped list** | `listKnownProjectIds()` skips non-canonical dirs (raw name ≠ `normalizeProjectId(raw name)`) and dedups by canonical id, so each project appears exactly once with a correctly-addressable id and `_`-prefixed / hyphen / cruft dirs never leak as ghosts. The invariant the rest of the system already assumes — "a project dir's name equals its normalized id" — is enforced at the list boundary. |
| F3 | **Select All** | Add a "select all (visible, deletable)" control to the multi-select UI (owner's original request). default_project remains non-selectable. |
| F4 | **Regression scenario** | New scenario reproducing the collision/regeneration: with two colliding dirs present, the list returns ONE canonical entry; deleting it removes it AND it does not regenerate after a subsequent list/persist. |
| Cleanup | **Owner-driven** | After F1+F2 land, the owner deletes the visible cruft via the now-working multi-select. No automatic/scripted bulk deletion (too risky); non-canonical fixture dirs (e.g. `_reference_todo_api`) remain harmlessly on disk, excluded from the list. |

## §3 Blast radius & safety

`listKnownProjectIds` / `buildProjectState` / `persistProjectState` are used by the registry, the
project list, and many scenarios. This is a **higher-risk backend change**, so:
- Step 0 must map every caller and confirm the fix doesn't break create/activate or any scenario that
  relies on the current behavior, and propose the exact diff, then STOP for CTO GO.
- A mid-checkpoint after the backend change (F1+F2) + the regression scenario, before the FE (F3).
- The FULL suite must stay green (this is the primary guard against regression).

## §4 §ARC / dependency impact

**§ARC unchanged at 8.** The fix modifies existing `apiServer.js` / `workspaceHelpers.js` fs logic
(already the established workspace pattern, like `env_loader`); it adds no new forbidden patterns, no new
endpoint, no new dep, no new role/Doctor check.

## §5 Closure gates (deterministic)

1. F4 regression scenario green; existing project/list/delete scenarios (incl. S29, S259) still green.
2. FULL suite: baseline + F4 green; 0 failed (sandbox = documented env-deltas only).
3. TypeScript build passes; FE rebuilt (new bundle; old replaced).
4. §ARC 8, Doctor 35, roles 13, L2 tools 78 unchanged.
5. **Gate #10:** owner multi-selects several cruft projects, deletes them in one action, and they STAY
   gone after the list reloads (no reappearance); Select All works; app stable. Screenshot.
6. Closure note appended here + `status.json` ux-task record updated; commit + push.

## §6 Cost

$0.00 — no LLM calls. (Gate #10 is pure UI deletion, no model calls.)

---

## §7 CLOSURE — 2026-06-07

**Gate #10 PASSED** (owner-confirmed in browser, 2026-06-07):
- Project list shows each project exactly once — no duplicate rows (reference_todo_api, pcst_flask_no_readme, pcst_tailwind_nextjs_blog, s150_abort_test each collapsed from 2→1).
- Select All control works: selects all visible deletable projects; label flips to "إلغاء التحديد" when all selected.
- Deleted projects stay gone after list reload — no reappearance. Ghost re-creation vector eliminated.

**F1+F2 verified live on the running pm2 server:** project list went from 31 items (4 collision pairs) to 27 items (each canonical project once). Non-canonical dirs (_reference_todo_api, _s150_abort_test, pcst_flask-no-readme, pcst_tailwind-nextjs-blog) remain on disk untouched; excluded from list.

**CTO independent verification (from fresh zip):**
- Full suite: 253/0/5 (258 total); Track A clean (10 pre = 10 post); §ARC 8 unchanged.
- Changed files: `code/src/workspace/apiServer.js` (2 lines: F1 + F2), `code/src/testing/helpers/api_server_test_helper.js` (S260 helper), `code/src/testing/scenarios/S260_project_list_canonicalization_regression.json`, `web/apps/forge-workspace/src/views/ProjectsView.tsx` (Select All), rebuilt bundle `index-CWkzWQ1T.js` / `index-CJ1ceJq9.css`.
- S120–S128 + S152 (builtproject — use _reference_todo_api by path): all PASS; dir confirmed still on disk.
- S259 + S260: both PASS.

**Status: CLOSED.**
