# DECISION-2026-06-07 — UX: Multi-Select Project Deletion

> **Status:** CLOSED — 2026-06-07.
> **Type:** Standalone UX improvement (NOT an orchestration roadmap phase). FE-only (amended by canonicalization fix).
> **Authored by:** CTO advisor, owner delegation. Grounded on disk inspection of existing delete path.

---

## §1 Goal

Add multi-select to the Projects view so the owner can delete several projects in one action,
instead of one-by-one. Also add a Select All control. Driven by real, evidence-backed pain.

## §2 Settled decisions

| # | Decision |
|---|---|
| D1 | Reuse the existing `POST /api/projects/delete`, called once per selected project (FE loop). No new backend endpoint. |
| D2 | A confirmation dialog is REQUIRED before any deletion, showing the count. No deletion without explicit confirm. |
| D3 | `default_project` is never selectable (checkbox hidden; defensively skipped in delete loop). |
| D4 | If the active project is deleted, the backend auto-reverts to `default_project`; FE refreshes via `loadProjects()` with no preferredId. |
| D5 | After a bulk delete, show a plain-Arabic result (deleted count + failures). Per-item failures do not abort the rest. |

## §3 Scope

FE-only. No new backend endpoint. §ARC stays 8. No new npm dep.

**Amendment (same date):** Gate #10 exposed a pre-existing backend bug (ghost-dir re-creation via
`buildProjectState → ensureDir`, non-canonical dir collisions). The canonicalization fix
(F1+F2 in `apiServer.js`) was added to make deletion permanent. See
`DECISION-2026-06-07-project-list-canonicalization-fix.md`.

## §4 Scenarios added

- **S259** — `/api/projects/delete` auto-reverts `active_project.json` to `default_project`.
- **S260** — Project list canonicalization regression: twin not listed; canonical not regenerated after delete.

---

## CLOSURE — 2026-06-07

Completed via the canonicalization fix (`DECISION-2026-06-07-project-list-canonicalization-fix.md`), which also added the Select All control. Gate #10 PASSED — owner confirmed in browser.
