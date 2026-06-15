# DF-1 — logic positive (reviewer recall probe)

## Defect planted
`updateTodo` and `deleteTodo` in `src/controllers/todoController.js` use parameterized queries
(no injection) but **never inspect `this.changes`**. For a non-existent id the UPDATE/DELETE
affects zero rows yet the handler returns **200 / 204** instead of **404** — directly violating
**AC-3** and **AC-4**.

This is the exact defect class `reviewer_v2` MISSED at PHASE-31 Gate #10
(`artifacts/spikes/gate31_phase31/step4_role_reviewer_output.json` — it reported AC-3 data-model,
dependency-docs, and persistence concerns; never the row-existence/404 logic defect).

## STEP B real run MUST show (reviewer, phase B, reviewer_v4)
- A finding with **severity `BLOCKER`** whose `location` points at
  `src/controllers/todoController.js` (updateTodo/deleteTodo) OR at AC-3/AC-4, and whose `issue`
  describes the missing affected-row / `this.changes` / 404 not-found handling.
- Consequently `verdict = REJECTED` (one or more BLOCKER ⇒ REJECTED per the verdict rule).

## Security side (informational — not DF-1's assertion)
Queries are parameterized, so `security_auditor_v2` should NOT raise a SQLi finding here.

## Scoring
PASS for this fixture in trial _i_ ⇔ reviewer_v4 output contains a BLOCKER tied to the
missing-404 / `this.changes` defect. Report catches as "X of N".
