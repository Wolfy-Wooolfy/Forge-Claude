# DECISION-2026-05-22T18-00-phase-13-6-backend-health-fixes

> **Type:** Phase Activation Decision — Backend Health (must-fix)
> **Status:** APPROVED (amended) — owner approved 2026-05-22; scope
>   corrected 2026-05-22 after CTO re-verification
> **Authored:** 2026-05-22
> **Authority:** Blueprint Part H + PHASE-13 closure artifact
>   (DECISION-2026-05-22T16-30-phase-13-closure.md §4)
> **Predecessor:** PHASE-13 — Conversational UX Polish — CLOSED

---

## 1. Why this phase exists — and a scope correction

During PHASE-13 verification, the CTO recorded two suspected backend
defects in the PHASE-13 closure artifact §4, as must-fix for this
phase. Before any code was written, PHASE-13.6 began with a Step 0
diagnosis. That diagnosis, and the CTO's independent reproduction,
established the following:

**Defect 1 (suspected: `bin/forge-test.js` exit code unreliable) —
WITHDRAWN. It is not a defect.**
The CTO originally observed `forge-test.js` "exit 0 with failures
present" during Stage 13.1. On re-verification:
- `node bin/forge-test.js` run directly → exit code **1** when
  failures are present (correct).
- `node bin/forge-test.js | tail` → `$?` = 0 — because in a shell
  pipeline `$?` reflects the last command (`tail`), not `node`.
The harness exit code was correct throughout. The original
observation was a CTO verification error — reading `$?` from a
piped command — not a code defect. No change to `bin/forge-test.js`
is made. This is recorded here so the audit trail is honest: the
PHASE-13 closure artifact §4 Issue 1 is superseded by this finding.

**Defect 2 (SU scenarios S184–S189 display "undefined" titles) —
CONFIRMED. This is the sole remaining scope of PHASE-13.6.**
Six scenarios (added in PHASE-11.6) carry a `description` field but
no `name` field. `scenario_runner.js:822` reads `scenario.name`,
which is `undefined` for these six, and the harness output
string-concatenates it to the literal text "undefined". 206 of the
212 scenarios carry a `name` field; only these 6 lack it. The tests
execute and pass correctly — only the displayed title is wrong.

PHASE-13.6 therefore reduces to a single, small, data-only fix.

## 2. Scope

### IN
- Add a `name` field to each of the 6 scenario JSON files
  S184–S189, matching the existing convention used by the other
  206 scenarios. The `name` value should be a concise scenario
  title (the existing `description` text, or a short form of it).

### OUT
- `bin/forge-test.js` is NOT modified — Defect 1 was withdrawn.
- No new scenarios, no new features, no new tools.
- No change to scenario *logic* — the 212 scenarios' pass/fail
  behaviour does not change. This is a display-title fix only.
- No frontend change.
- The known SU environment delta (8 scenarios fail on non-Windows —
  S48, S120-127, S137) is NOT in scope — environment difference,
  not a defect.

## 3. Track A discipline

PHASE-13.6 changes only data files (6 JSON scenario files). No
Forge runtime code is modified. Track A is not at risk:
- No `fetch()`, no `fs.*Sync`, no `new OpenAI()`, no
  `child_process` is added — no code is added at all.
- The §ARC ledger stays at 6.
- Track A greps are still part of closure verification, to confirm
  nothing in the runtime changed.

## 4. Staging

PHASE-13.6 is a single data-only change across 6 files. It is
delivered as **one stage, 13.6.1, with no mid-checkpoint** — there
is no second half to gate. The implementation arm goes straight
through and reports at closure.

## 5. Closure gate — deterministic

PHASE-13.6 is CLOSED when ALL are true:

1. **Defect 2 fixed — proven.** Each of S184–S189 has a `name`
   field. The harness output for those six scenario IDs shows their
   real titles, not "undefined" — proven by the literal harness
   output lines for S184–S189.
2. **SU baseline unchanged in counts.** On the owner machine:
   207 pass / 0 fail / 5 skip — identical to pre-PHASE-13.6. Adding
   a `name` field changes the displayed title only, not pass/fail.
   Proven by the literal summary line.
3. **Track A clean.** Backend Track A greps show no new violation
   (no runtime code changed); §ARC ledger still 6.
4. **Decision artifacts.** This (corrected) decision artifact
   committed; a PHASE-13.6 closure artifact written; a checkpoint
   written under `artifacts/decisions/_phase_13_6_checkpoints/`.
5. **status.json** advanced — phase_13_6 CLOSED.
6. **PHASE-13 closure artifact cross-reference.** A one-line note
   is added to (or alongside) the PHASE-13 closure artifact §4
   recording that Issue 1 was withdrawn as a mis-diagnosis and
   Issue 2 was fixed in PHASE-13.6 — so the two artifacts do not
   contradict each other.

If any one is unmet, the phase stays OPEN.

## 6. Cost

Mock-only. No real API key. Kill-bar $3.00. Expected actual $0.00.

## 7. Approval

The phase was owner-approved on 2026-05-22. The scope was corrected
the same day after CTO re-verification withdrew Defect 1; the
correction reduces scope (removes work) and introduces no new work,
so it proceeds under the original approval. PHASE-13.6 is authorized
to begin under the corrected single-defect scope.

---

**END OF DECISION (amended)**
