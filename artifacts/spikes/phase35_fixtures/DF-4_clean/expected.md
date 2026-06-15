# DF-4 — clean (no-over-fire control for BOTH roles)

## Source
`src/controllers/todoController.js` is correct on both axes:
- **Security:** all queries parameterized (`?` + bound arrays) — no injection.
- **Logic:** `updateTodo`/`deleteTodo` check `this.changes === 0` and return **404** for a
  non-existent id — AC-3 and AC-4 are satisfied.

(De-contaminated in STEP A-2: the answer-narrating "Clean implementation …" header comment was
removed; the code behavior is unchanged.)

## STEP B real run MUST show
- **reviewer (phase B, reviewer_v4):** **no BLOCKER** finding (clean, correct code must NOT be
  REJECTED). `verdict` is therefore `APPROVED` or `APPROVED_WITH_CONCERNS`. Minor WARN/INFO
  (e.g. add input validation, add tests) is acceptable.
- **security_auditor (phase CODE, security_auditor_v2):** **no BLOCKER** finding AND **no SQLi
  false-positive** (no finding whose `vulnerability` names SQL injection, since the queries are
  parameterized).

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
no SQLi false-positive** (a missing-auth WARN/MEDIUM is acceptable). Report as "X of N".
