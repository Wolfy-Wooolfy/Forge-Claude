# DF-4 — clean (no-over-fire control for BOTH roles)

## Source
`src/controllers/todoController.js` is correct on both axes:
- **Security:** all queries parameterized (`?` + bound arrays) — no injection.
- **Logic:** `updateTodo`/`deleteTodo` check `this.changes === 0` and return **404** for a
  non-existent id — AC-3 and AC-4 are satisfied.

(De-contaminated in STEP A-2: the answer-narrating "Clean implementation …" header comment was
removed; the code behavior is unchanged.)

**Self-consistency cleanup (STEP D):** the imported module `../models/todo` is now PRESENT in the
input — `src/models/todo.js` is in the manifest (`code.files_written`) and in `spec.files_to_create`,
and it is itself clean (a static `CREATE TABLE` DDL + a shared sqlite3 handle, no untrusted
interpolation). The spec also records that `express` and `sqlite3` are pre-existing project
dependencies, so an empty `dependencies_added` is expected. Consequently a reviewer has **nothing
legitimate to escalate**: a BLOCKER about a "missing import" or "missing dependency" is now
unambiguously an **over-fire / fabrication**, not a real gap.

## STEP D/E real run MUST show (reviewer_v5 / security_auditor_v3)
- **reviewer (phase B, reviewer_v5):** **no BLOCKER** finding (clean, correct code must NOT be
  REJECTED). `verdict` is therefore `APPROVED` or `APPROVED_WITH_CONCERNS`. The input-validation gap
  on POST/PUT is a legitimate **WARN/INFO**, NOT a BLOCKER (validation is not in the acceptance_criteria
  and is not exploitable). Raising it — or a "missing import" / "missing dependency" — as a **BLOCKER
  is an over-fire**, which is exactly what reviewer_v5 + this fixture cleanup target.
- **security_auditor (phase CODE, security_auditor_v3):** **no BLOCKER** finding AND **no SQLi
  false-positive** (no finding whose `vulnerability` names SQL injection, since the queries are
  parameterized). Authentication is spec **out_of_scope**, so "missing authentication" must NOT be a
  finding (a missing-auth BLOCKER is now an out_of_scope violation).

## Criterion correction (STEP A-2.4 — why the original NONE/LOW bar was wrong)
The original criterion required `threat_level ∈ {NONE, LOW}`. That was mis-set: this API genuinely
has **no authentication and no input validation**, so a `missing authentication` WARN — and the
`MEDIUM` threat_level it aggregates to — is a **LEGITIMATE** security observation, NOT over-fire.
Penalising it would wrongly pressure the auditor to under-report a real (if out-of-scope) gap and
weaken recall. The over-fire signals we actually care about are: a **BLOCKER on clean code**, or a
**fabricated SQLi finding** on parameterized queries. So `threat_level` is no longer part of the
pass condition; only "no BLOCKER" + "no SQLi false-positive" are.

## Purpose
The over-fire control. If the reviewer raises a BLOCKER on clean, correct code (the reviewer_v3
failure this A-2 fixes), or the security auditor invents a SQLi finding on parameterized queries,
the tuning is too aggressive. Confirms precision without manufacturing blocking findings.

## Scoring
PASS for this fixture in trial _i_ ⇔ **reviewer has no BLOCKER** AND **security has no BLOCKER AND
no SQLi false-positive** (a missing-auth WARN/MEDIUM is acceptable; a missing-auth **BLOCKER** is a
fail — Authentication is out_of_scope). With the STEP D cleanup, a "missing import" or "missing
dependency" BLOCKER from the reviewer is likewise a fail (the dependency is present in the input).
Report as "X of N".
