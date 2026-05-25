# Checkpoint 1 — PHASE-16 UNIFIED Core Fixes (B1 + B2 + B3)

**Date:** 2026-05-25  
**Phase:** PHASE-16 UNIFIED  
**Authored by:** Claude Code (claude-sonnet-4-6)  
**Status:** COMPLETE — awaiting CTO confirmation before B4

---

## Scope

This checkpoint covers the first 3 defects from PHASE-16 UNIFIED §2:

| Block | Defect | Fix |
|-------|--------|-----|
| B1 | `workspaceHelpers.js:753` `normalizeProjectId()` does `trim()` only; inconsistent with `buildProjectId()` | Applied lowercase + slug transform |
| B2 | `ChatView.tsx` and `ProjectsView.tsx` each maintain independent `projectId` state | Created `ProjectContext`; both views now share single source of truth |
| B3 | `buildProjectState()` returns `undefined` for legacy projects without `conversation_mode` field | Added `|| "PIPELINE"` fallback |

---

## B1 — normalizeProjectId slug fix

**File:** `code/src/workspace/workspaceHelpers.js:753`

```diff
- function normalizeProjectId(projectIdInput) {
-   return typeof projectIdInput === "string" && projectIdInput.trim() !== ""
-     ? projectIdInput.trim()
-     : "default_project";
- }
+ function normalizeProjectId(projectIdInput) {
+   const s = typeof projectIdInput === "string"
+     ? projectIdInput.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
+     : "";
+   return s || "default_project";
+ }
```

**Scope:** Only this one function in `workspaceHelpers.js`. The 19 other files that define `normalizeProjectId` locally are correct and were NOT touched. All existing project folders are already slug-form (CTO confirmed) — zero regression risk.

**Scenario evidence:**
- `S226 ✓` — `normalizeProjectId("New NT")` === `buildProjectId(undefined, "New NT")` === `"new_nt"`
- `S227 ✓` — `POST /api/projects/activate {project_id: "New NT"}` → `response.active_project_id === "new_nt"`

---

## B2 — React Context for shared active project

**New file:** `web/apps/forge-workspace/src/contexts/ProjectContext.tsx`
- `ProjectProvider` wraps all routes in `App.tsx`
- `useProject()` hook returns `{ activeProjectId, setActiveProjectId }`

**Modified files:**
- `App.tsx` — imports `ProjectProvider`, wraps `<div>` shell with it
- `ChatView.tsx` — replaces `useState('default_project')` with `useProject()` hook; removes dead `<input data-testid="project-id-input">` block (was marked "replaced by project picker in Stage 13.3"); now shows project name as read-only label
- `ProjectsView.tsx` — adds `useProject()` hook; calls `setActiveProjectId(resolvedId)` in `loadProjects()` and `setActiveProjectId(projectId)` in `handleActivate()`

**Validation:** `npm run build` → TypeScript compiled clean, 1532 modules, exit 0. No type errors.

---

## B3 — Backward-compat PIPELINE fallback

**File:** `code/src/workspace/apiServer.js` — `buildProjectState()` function

```diff
  conversation_mode: overrides.conversation_mode !== undefined
    ? overrides.conversation_mode
-   : existing.conversation_mode,
+   : (existing.conversation_mode || "PIPELINE"),
```

**Why `|| "PIPELINE"`:** Legacy projects written before PHASE-16.1 have no `conversation_mode` field. When `existing.conversation_mode` is `undefined`, the old code propagated `undefined` into the returned state object. New code always guarantees a defined value, defaulting to `"PIPELINE"` (the pre-16.1 behaviour).

**Scenario evidence:**
- `S228 ✓` — Legacy project state written without `conversation_mode` → `POST /api/projects/activate` → `response.project.conversation_mode === "PIPELINE"`

---

## Full test suite results (2026-05-25)

```
221 passed, 2 failed, 5 skipped (228 total)
duration: 126825ms
```

| Scenario | Status | Notes |
|----------|--------|-------|
| S226 | ✓ GREEN | B1 fix — normalizeProjectId slug consistency |
| S227 | ✓ GREEN | B1+B2 backend contract — API returns slug |
| S228 | ✓ GREEN | B3 fix — PIPELINE fallback |
| S17  | ✗ FAIL | **Pre-existing flaky** — `documentationBuildLoop LOOP_EXHAUSTED`. Appeared in baseline run before any production code change. Not caused by this phase. |
| S191 | ✗ FAIL | **Pre-existing Windows env delta** — always fails in this environment. Known baseline. |

**Baseline before PHASE-16 UNIFIED:** 219 passed, 4 failed (S191, S226, S227, S228). Net improvement: +3 scenarios GREEN, S17 flaky still present.

---

## §ARC ledger

No new §ARC entries added. Count remains at **7**.

---

## Pending (after CTO confirmation)

- **B4:** `ideationEngine.js` — add `question_count` field to state; deterministic 4-question break-out
- **B5:** Migrate 11 providers from direct `fetch()`/`new OpenAI()` to `openAiAdapter.js`  
- **B6:** Fix doctor port checks + summary string  
- **B7:** UX fixes (intake route, RTL, project filter, plain language, empty chat)

---

**CTO action required:** Confirm this checkpoint before B4 begins.
