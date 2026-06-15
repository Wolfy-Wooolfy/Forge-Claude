# PHASE-35 review-quality fixtures (DF-1 .. DF-4)

These are **inputs for STEP B's REAL Gate #10 run** — NOT mock scenarios, NOT part of the
deterministic SU suite. Each fixture is a self-contained `{ spec, design, code }` payload that
STEP B feeds to the tuned roles:
- `reviewer` (phase **B**) with `system_prompt_id = reviewer_v3`
- `security_auditor` (phase **CODE**) with `system_prompt_id = security_auditor_v2`

## Layout (per fixture)
```
DF-N_<name>/
  spec.json          # spec object (acceptance_criteria include not-found/404 ACs)
  design.json        # architect_design object
  manifest.json      # build-manifest-shaped file list — STEP B assembles the `code` object
                     # by reading each listed file's on-disk content (same as reviewProject()).
  src/controllers/todoController.js   # the ACTUAL source under review
  expected.md        # what STEP B's real run MUST show (the deterministic pass/fail criterion)
```

STEP B assembles `code = { files_written: [{ path, content }], summary, dependencies_added: [] }`
from `manifest.json` + the on-disk files — exactly as `conversationEngine.reviewProject()` does in
production. No content is pre-embedded in JSON (avoids drift between the JSON and the real source).

## The four fixtures and their purpose

| Fixture | Probes | Defect present | Tuned-role expectation at STEP B |
|---|---|---|---|
| **DF-1** logic positive | `reviewer_v3` recall | `updateTodo`/`deleteTodo` parameterized but MISSING `this.changes` → 200/204 on a non-existent id (violates AC-3/AC-4 = 404) | reviewer raises a **BLOCKER** tied to the missing 404 / row-existence (this is the PHASE-31 miss) |
| **DF-2** SQLi positive control | `security_auditor_v2` recall | `getTodoById`/`createTodo` **string-concatenate** untrusted input into SQL → real SQL injection | security **STILL** raises a SQLi **BLOCKER** (recall preserved; tuning didn't blunt it) |
| **DF-3** parameterized negative | `security_auditor_v2` precision | none security-wise — the real phase28_gate10 controller: `?` placeholders + bound arrays | security must **NOT** flag SQL injection (the PHASE-31 false-positive must not recur) |
| **DF-4** clean | both roles, no over-fire | none — parameterized AND `this.changes` → 404 | reviewer **APPROVE** (no BLOCKER); security threat_level **NONE/LOW**, no BLOCKER |

## STEP B success criterion (per CTO — "X of N trials", not "every time")
Because real model output is non-deterministic, STEP B will run each fixture N times and score
DF-1/DF-2/DF-3/DF-4 against the expectations above. The headline comparisons:
- DF-1: reviewer_v3 catches the `this.changes` BLOCKER (reviewer_v2 missed it at PHASE-31).
- DF-3: security_auditor_v2 does NOT false-positive SQLi on parameterized queries
  (security_auditor_v1 raised a BLOCKER here at PHASE-31).
- DF-2 + DF-4 are controls: recall and no-over-fire must hold.

**STEP A delivers these as static inputs only. No real calls are made in STEP A.**
