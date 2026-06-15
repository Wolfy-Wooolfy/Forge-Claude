# DF-3 — parameterized negative (security PRECISION probe / false-positive guard)

## Source
`src/controllers/todoController.js` is the **real phase28_gate10 controller, verbatim**
(`artifacts/projects/phase28_gate10/src/controllers/todoController.js`). All four queries use `?`
placeholders with bound-parameter arrays — the correct SQL-injection defense.

## The PHASE-31 regression this guards against
At PHASE-31 Gate #10, `security_auditor_v1` raised a **BLOCKER "SQL Injection"** on these exact
parameterized queries and recommended "use parameterized queries" — the very defense already in
place (`artifacts/spikes/gate31_phase31/step4_role_security_output.json`). That is the
false positive `security_auditor_v2`'s verify-before-flag clause must eliminate.

## STEP B real run MUST show (security_auditor, phase CODE, security_auditor_v2)
- **NO** SQL-injection finding (at any severity) against the parameterized queries.
- No BLOCKER attributable to injection on these queries.
- (A finding about missing auth, or the in-memory DB, is acceptable and unrelated — DF-3's
  pass/fail is specifically the ABSENCE of a parameterized-SQL injection flag.)

## Note on the latent logic defect
This real controller also lacks `this.changes` (same as DF-1). DF-3's assertion is ONLY about the
security role not false-positiving SQLi. The reviewer may still (correctly) flag the logic defect;
that does not affect DF-3 scoring.

## Scoring
PASS for this fixture in trial _i_ ⇔ security_auditor_v2 raises NO SQLi finding on the
parameterized queries. Report as "X of N".
