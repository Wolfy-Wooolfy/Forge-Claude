# DECISION-20260504-phase-0-fix-3-project-deletion

## Summary
Phase 0 / Fix 3 — Project Deletion

## Problem
No way to delete a project from the UI or API. Project folders persisted forever in
`artifacts/projects/<id>/` with no cleanup mechanism.

## Old Behavior
- No `deleteProject()` function in `apiServer.js`.
- No `POST /api/projects/delete` endpoint.
- No delete button in the sidebar.

## New Behavior

### Backend (apiServer.js)
- `deleteProject(body)` function added after `createProject`:
  - Guards: `default_project` is protected from deletion (returns `CANNOT_DELETE_DEFAULT_PROJECT`).
  - Checks folder existence (returns `PROJECT_NOT_FOUND` if missing).
  - Uses `fs.rmSync(projectRoot, { recursive: true, force: true })`.
  - If the deleted project was active → resets active to `default_project`.
  - Calls `persistProjectState("default_project")` to refresh the registry.
  - Returns `{ ok: true, deleted: true, project_id }` or `{ ok: false, reason }`.
- Endpoint `POST /api/projects/delete` added after `/api/projects/activate`.

### Frontend (web/index.html)
- `deleteProjectBtn` (🗑) added next to `newProjectBtn` in sidebar, styled red.
- `deleteProjectBtn.addEventListener` handler:
  - Blocks deletion of `default_project` with Arabic alert.
  - Shows `window.confirm` with project name and irreversibility warning.
  - On confirmation: calls `POST /api/projects/delete`, clears chat + draft state,
    reloads project list with `default_project` active.

## Files Modified
- `code/src/workspace/apiServer.js`
- `web/index.html`

## Test Scenario
```
1. Create project "HR System", add some messages.
2. Click 🗑 → confirm dialog appears with project name.
3. Confirm → project disappears from dropdown, chat cleared, active = default_project.
4. Check artifacts/projects/ → folder "hr_system" no longer exists.
5. Try delete on default_project → alert: "لا يمكن حذف المشروع الافتراضي."
```

## Date
2026-05-04
