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
| B2 | `ProjectProvider` starts with hardcoded `'default_project'`; no backend fetch on mount → wrong project if user opens Chat directly | Added `useEffect` that fetches `GET /api/projects` on mount |
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

## B2 — React Context for shared active project (completed)

### Context + sharing (initial implementation)

**New file:** `web/apps/forge-workspace/src/contexts/ProjectContext.tsx`
- `ProjectProvider` wraps all routes in `App.tsx`
- `useProject()` hook returns `{ activeProjectId, setActiveProjectId }`
- `ChatView.tsx` — replaces `useState('default_project')` with `useProject()` hook; removes dead `<input>` block
- `ProjectsView.tsx` — calls `setActiveProjectId` in `loadProjects()` and `handleActivate()`

### Context init fix (B2 completion — CTO feedback)

**Problem identified:** `ProjectProvider` started with hardcoded `useState('default_project')`. If the user opened Chat directly (without visiting ProjectsView first), the context stayed at `'default_project'` regardless of the real active project.

**Fix:** `ProjectContext.tsx` — added `useEffect` that fetches `GET /api/projects` on mount:

```diff
+ import { listProjects } from '@/api/projects'

  export function ProjectProvider({ children }: { children: ReactNode }) {
    const [activeProjectId, setActiveProjectId] = useState('default_project')

+   useEffect(() => {
+     listProjects()
+       .then((data) => {
+         const id = data.active_project_id?.trim() || 'default_project'
+         setActiveProjectId(id)
+       })
+       .catch(() => {
+         // backend unreachable on startup — stay at default_project
+       })
+   }, [])
```

**Fallback:** If the fetch fails (backend not ready, network error), context stays at `'default_project'` — explicit, not silent.

**Scenario evidence (backend contract):**
- `S229 ✓` — Create + activate "My App" → `GET /api/projects` returns `active_project_id === "my_app"` (not `"default_project"`) — confirms the backend endpoint the context relies on returns correct data

**Validation:** `npm run build` → TypeScript compiled clean, 1532 modules, exit 0 (both before and after useEffect addition).

---

## B3 — Backward-compat PIPELINE fallback

**File:** `code/src/workspace/apiServer.js` — `buildProjectState()` function

```diff
  conversation_mode: overrides.conversation_mode !== undefined
    ? overrides.conversation_mode
-   : existing.conversation_mode,
+   : (existing.conversation_mode || "PIPELINE"),
```

**Why `|| "PIPELINE"`:** Legacy projects written before PHASE-16.1 have no `conversation_mode` field. Old code propagated `undefined`. New code always returns a defined value, defaulting to `"PIPELINE"` (pre-16.1 behaviour).

**Scenario evidence:**
- `S228 ✓` — Legacy project state without `conversation_mode` → `POST /api/projects/activate` → `response.project.conversation_mode === "PIPELINE"`

---

## Full test suite results (2026-05-25 — after B2 completion)

```
222 passed, 2 failed, 5 skipped (229 total)
```

| Scenario | Status | Notes |
|----------|--------|-------|
| S226 | ✓ GREEN | B1 fix — normalizeProjectId slug consistency |
| S227 | ✓ GREEN | B1+B2 backend contract — API returns slug |
| S228 | ✓ GREEN | B3 fix — PIPELINE fallback |
| S229 | ✓ GREEN | B2 context-init contract — GET /api/projects returns correct active_project_id |
| S17  | ✗ FAIL | **Pre-existing flaky** — `documentationBuildLoop LOOP_EXHAUSTED`. Confirmed by CTO on clean zip before any changes. Registered as debt item (not fixed in this phase). |
| S191 | ✗ FAIL | **Pre-existing Windows env delta** — always fails in this environment. Known baseline. |

**Baseline before PHASE-16 UNIFIED:** 219 passed, 4 failed (S191, S226, S227, S228). Net improvement: +4 scenarios GREEN (S226/S227/S228/S229), total 229 scenarios.

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
