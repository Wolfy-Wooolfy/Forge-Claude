# DF-2 — SQLi positive control (security recall probe)

## Defect planted
`getTodoById` concatenates `req.params.id` directly into `SELECT * FROM todos WHERE id = ' + id`,
and `createTodo` interpolates `title` into the INSERT. Both are **real SQL injection** sinks —
untrusted input flows into the query string with no parameterization.

## STEP B real run MUST show (security_auditor, phase CODE, security_auditor_v2)
- A finding with **severity `BLOCKER`** and `vulnerability` naming **SQL injection**, `location`
  pointing at `src/controllers/todoController.js` (getTodoById / createTodo).
- `threat_level` HIGH or CRITICAL.

## Purpose
This is the **recall control**: the tuning of `security_auditor_v2` (verify-before-flag) must NOT
blunt detection of genuine, unparameterized injection. If DF-2 is missed, the tuning over-corrected.

## Reviewer side (informational — not DF-2's assertion)
The reviewer may also note injection / missing parameterization; DF-2's pass/fail is the security
role's SQLi BLOCKER.

## Scoring
PASS for this fixture in trial _i_ ⇔ security_auditor_v2 raises a SQLi BLOCKER on the concatenated
queries. Report as "X of N".
