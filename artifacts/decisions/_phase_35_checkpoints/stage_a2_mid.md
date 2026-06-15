# PHASE-35 — STEP A-2 MID CHECKPOINT (after A-2.1..A-2.4, before regression)

**Date:** 2026-06-15
**Status:** STOP — awaiting CTO verification of reviewer_v4 + role bump + fixture de-contamination
+ DF-4 criterion correction, BEFORE the regression run (SU suite + doctor).
**Scope reminder:** mock-only, $0, NO real calls, NO decision artifact, NO status.json closure.

**Why A-2 (CTO-verified against the 28 STEP B raw outputs):** the 3 core objectives PASSED
(DF-1 reviewer catch 3/3, DF-2 security recall 3/3, DF-3 no-false-positive 3/3 after the strict
detector). Two issues remained: (1) reviewer_v3 OVER-FIRES — REJECTed clean code in 1/3 DF-4 trials
inventing AC violations the code satisfies; (2) the A/B was inconclusive because the fixtures leak
the answer. A-2 fixes (1) with reviewer_v4 and (2) by de-contaminating the fixtures. The DF-4
missing-auth WARN/MEDIUM was LEGITIMATE (the API truly has no auth) → corrected the criterion, did
NOT weaken security_auditor (stays v2).

---

## A-2.1 — reviewer_v4 authored in `docs/10_runtime/18b_ROLE_PROMPTS.md`

New `## reviewer_v4 (2026-06-15)` block inserted after the reviewer_v3 section. **reviewer_v1/v2/v3
left byte-identical** (honors the 18b header rule: a committed version is never edited). v4 = v3 with
ONE addition: a **"Precision discipline (Phase B — do not over-fire)"** subsection placed
immediately after "Severity calibration" and before "Output format". Nothing else changed.

### The added subsection (verbatim)
```
Precision discipline (Phase B — do not over-fire):
- Before raising a BLOCKER on an acceptance criterion, TRACE the actual handler and confirm the code genuinely violates it. If the code satisfies the AC — correct status code, correct response shape, the required check present — you MUST NOT raise a BLOCKER on that AC.
- A BLOCKER requires a concrete defect you can cite a specific line for. A missing nice-to-have, or a best-practice gap the spec does not require, is a WARN or INFO — never a BLOCKER.
- This precision requirement does NOT relax recall: a genuine behavioral or contract defect — a missing row-existence / this.changes check that yields the wrong status code, a missing 404, or an acceptance criterion the code truly does not satisfy — is STILL a BLOCKER. Raise blockers for real defects; never invent them for code that is already correct.
```

### Proofs (read-only node check, $0)
```
1) versions load: reviewer_v2=2978  reviewer_v3=5090  reviewer_v4=5951  security_auditor_v1=3324  security_auditor_v2=5286
2) first500(v4)===first500(v3): true | first500(v4)===first500(v2): true
3) v3 len=5090 v4 len=5951 diverge@char=3602 (>500)
   context: "...downgrade a real correctness defect to WARN.\n\nPrecision discipline (Phase B — do not over-fire):\n- Before ..."
4) v4 has Precision discipline: true | anti-over-fire "MUST NOT raise a BLOCKER on that AC": true
   v4 PRESERVES recall (this.changes still BLOCKER): true | keeps v3 severity calibration: true
```
- **first-500(v4) == first-500(v3) == first-500(v2)** → stable-prefix preserved (S89/S90 mock keys
  unchanged — see A-2.3 proof below).
- Divergence is at **char 3602** (the inserted subsection), well past 500. Length delta
  5951 − 5090 = **861 = the inserted block only** → v4 is strictly v3 + the precision clause.
- **Recall preserved**: v4 still contains the v3 severity calibration (behavioral/contract defect =
  BLOCKER) AND the explicit "this.changes ... is STILL a BLOCKER" reaffirmation. Goal = precision
  WITHOUT losing the recall that catches the PHASE-31 defect.

---

## A-2.2 — role-file id bump (the ONLY runtime code change)

`code/src/runtime/agents/roles/reviewer_role.js` — 2 line-edits, no logic change:

| Line | before → after |
|---|---|
| 9  | `loadPrompt("reviewer_v3")` → `loadPrompt("reviewer_v4")` |
| 47 | `system_prompt_id: "reviewer_v3"` → `"reviewer_v4"` |

`security_auditor_role.js` **unchanged** (`security_auditor_v2`). Registry confirms at runtime:
`pickRole("reviewer").system_prompt_id = reviewer_v4`, `pickRole("security_auditor") = security_auditor_v2`.

---

## A-2.3 — Fixture de-contamination (so STEP B-2's A/B can prove causality)

**Code behavior is unchanged in every fixture** — only answer-narration / priming removed.

| Fixture | Removed | Behavior preserved (verified) |
|---|---|---|
| **DF-1** `src/.../todoController.js` | 3-line header block + two inline `// BUG: ... this.changes is never inspected` comments | defect intact: NO `this.changes` check in update/delete; queries parameterized |
| **DF-2** `src/.../todoController.js` | two `// VULNERABILITY: ...` comment blocks | vuln intact: `WHERE id = ' + id` and `VALUES ('" + title + "')` string-concatenation |
| **DF-3** `design.json` | `"This is the real phase28_gate10 build."` (design_summary) + `"(already done in this build)"` (risk mitigation) | code stays parameterized (`?` + bound arrays) |
| **DF-3** `spec.json` | decision `"Use SQLite via sqlite3 with parameterized queries"` / rationale `"...bound parameters prevent SQL injection"` → `"Use SQLite via sqlite3"` / `"Zero-config single-file storage"` | — |
| **DF-4** `src/.../todoController.js` | `// Clean implementation: ... satisfies AC-3, AC-4` header comment | clean intact: `this.changes === 0 → 404` + parameterized |

**Verification (node, $0):** all 12 spec/design/manifest JSON parse OK; DF-1 defect preserved=true;
DF-2 concat preserved=true; DF-3 parameterized + no-concat=true; DF-4 this.changes-404 + parameterized=true;
DF-3 spec+design no-priming=true. Grep for `BUG:|VULNERABILITY:|Clean implementation|never inspected|
already done|already parameterized` over the fixture **inputs** = clean (only the human-facing
expected.md/README describe the change, which the roles never see).

**Version-ref hygiene (artifacts, within the fixture-editing scope):** updated stale `reviewer_v3` →
`reviewer_v4` in `DF-1/expected.md` and `README.md` (5 refs; `reviewer_v2` PHASE-31 references kept).
README DF-4 row + a STEP A-2 de-contamination note updated.

---

## A-2.4 — DF-4 expected criterion corrected (`DF-4_clean/expected.md`)

The original criterion required `threat_level ∈ {NONE, LOW}` — **mis-set**. This API genuinely has no
auth/input-validation, so a `missing authentication` WARN (and the MEDIUM it aggregates to) is a
LEGITIMATE finding, NOT over-fire; penalising it would wrongly pressure the auditor to under-report.

- **reviewer PASS** = no BLOCKER (clean code must not be REJECTED). [unchanged intent]
- **security PASS** = no BLOCKER **AND** no SQLi false-positive (vulnerability never names SQL
  injection). **threat_level dropped** from the pass condition. Rationale documented in the file.

The over-fire signals we actually score: a BLOCKER on clean code, or a fabricated SQLi finding.

---

## ⚑ Two items needing a CTO decision (NOT acted on — flagged honestly)

**FLAG 1 — DF-1 design.json may still partially prime the reviewer A/B.**
A-2.3 (per the instruction) scoped DF-1 de-contamination to the **code comments**. But
`DF-1_logic_positive/design.json` `identified_risks` still spells out the exact defect + fix:
```
{ "risk": "Incorrect not-found handling on update/delete", "severity": "MEDIUM",
  "mitigation": "Check affected-row count and return 404 when zero rows match" }
```
This hands the reviewer the answer via the design, so reviewer_v2 (the A/B baseline) may STILL catch
the defect at STEP B-2 → the reviewer A/B could stay inconclusive (the exact failure A-2 is meant to
fix). I did **not** edit DF-1 design.json (outside the instructed scope). **Recommendation:** before
STEP B-2, neutralize this risk to something non-leaking, e.g.
`{ "risk": "Data integrity on concurrent edits", "severity": "LOW", "mitigation": "..." }`, OR remove
the not-found risk entirely. Awaiting CTO call. (DF-1 also keeps the generic "parameterized queries"
spec decision — security-side, informational for DF-1, low concern.)

**FLAG 2 — doc drift in `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md`.**
L173 `system_prompt_id | reviewer_v3` and the L176–179 version-history note are STALE after the v4
bump. STEP A-2's prompt authorized editing `18b` only; per CLAUDE.md §3.1 I have no permission to
edit this contract doc here. No deterministic test/doctor check references these strings (grep-clean),
so this is documentation hygiene, not a gate failure. **Recommendation:** one-line update to
`reviewer_v4` + a version-history line (CTO-authorized docs/** change, same as STEP A handled it),
applied alongside the regression run, or defer.

---

## What is NOT done yet (regression — after CTO GO)
- Run full SU suite → expect **317/0/5 unchanged** (S89/S90 stay green via the proven stable-prefix);
  the full suite needs `--max-old-space-size=8192` (known memory-footprint backlog, see stage_a_complete §3).
- `node bin/forge-doctor.js` exit 0 (§ARC=8, L2=80, roles=13 — no registry file touched).

## Track A
- Only runtime code change = `reviewer_role.js` (2 string-literal lines). Prompts + fixtures are
  docs/artifacts. All role I/O still via `reg.invoke`. **§ARC stays 8.** No tool/role/doctor registry
  file touched.

**STOP. Awaiting CTO verification before the regression run + STEP A-2 closure note.**
