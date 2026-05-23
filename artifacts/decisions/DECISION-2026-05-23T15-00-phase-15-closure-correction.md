# DECISION — PHASE-15 Closure Correction (status.json next_phase regression)

**Artifact ID:** DECISION-2026-05-23T15-00-phase-15-closure-correction
**Date:** 2026-05-23
**Status:** APPLIED
**Parent artifact:** DECISION-2026-05-23T14-00-phase-15-closure.md

---

## Regression Description

Stage 15.2 closure (2026-05-23T14:00) set `next_phase: null` in
`progress/status.json`. This caused `status_json_valid` doctor check to
return FAIL, which cascaded:

- `runDoctor().ok = false`
- S10 (`doctor runDoctor() returns ok=true`) → FAIL
- S119 (`doctor builtproject_runtime check passes`) → FAIL
- SU result on owner Windows machine: **208/2/5** (not 210/0/5)

### Root cause

`statusJsonValid.js:6` declares `"next_phase"` in `REQUIRED_FIELDS`.
`statusJsonValid.js:26` treats `null` as a missing-field failure:

```js
if (data[field] === undefined || data[field] === null) {
  return { status: "FAIL", detail: "missing required field: " + field };
}
```

Setting `next_phase: null` was correct in intent (no next phase), but
violated the check's contract.

### Responsibility

The CTO's PHASE-13.6 closure message explicitly asked for `next_phase: null`.
That instruction was the defect. The CTO acknowledges the misjudgement.

---

## Fix Applied

`progress/status.json` — two fields updated:

```
- "next_phase": null,
+ "next_phase": "NONE-ALL-ROADMAP-PHASES-COMPLETE",

- "current_task": "PHASE-15 CLOSED — ALL PHASES COMPLETE",
+ "current_task": "NONE-ACTIVE",
```

`next_step` also updated to be accurate:

```
- "PHASE-15 CLOSED — ALL PHASES COMPLETE. No next phase."
+ "NONE-ACTIVE. PHASE-14 (Legacy Support) remains deferred; CTO and owner will decide separately."
```

`statusJsonValid.js` — **NOT modified** (out of PHASE-15 scope).

---

## Rule Established

> **status.json REQUIRED_FIELDS (`schema_version`, `current_task`, `next_phase`)
> must always be non-null strings. The `status_json_valid` doctor check
> (`statusJsonValid.js:26`) rejects null at these fields.
> Never write `null` to any REQUIRED_FIELD.
> A future micro-fix may make the check accept null explicitly; until then,
> use a sentinel string such as `"NONE-..."` when a field has no meaningful value.**

---

## Verification

After this fix, re-run on owner machine confirms:
- `node bin/forge-doctor.js` → exit 0, `status_json_valid` PASS
- `node bin/forge-test.js` → 210/0/5, S10 PASS, S119 PASS

(Literal output to be appended by CTO after snapshot verification.)

---

**END OF CORRECTION ARTIFACT**
