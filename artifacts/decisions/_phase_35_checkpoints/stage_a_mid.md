# PHASE-35 — STEP A MID CHECKPOINT (after A.1 + A.2, before A.3 + A.4)

**Date:** 2026-06-15
**Status:** STOP — awaiting CTO verification of the two new prompt blocks + role-id bump +
mock-fixture strategy, BEFORE A.3 (suite run + fixture handling) and A.4 (DF controllers).
**Scope reminder:** mock-only, $0, NO real calls, NO decision artifact, NO status.json closure.

---

## 1. A.1 — new prompt versions authored in `docs/10_runtime/18b_ROLE_PROMPTS.md`

Both added as NEW `## ..._v<n>` blocks. **v2 / v1 left byte-identical in place** (honors the 18b
header rule: a committed version is NEVER edited). Loader (`_prompt_loader.js`) parses both new
blocks — verified: `loadPrompt("reviewer_v3")`, `loadPrompt("security_auditor_v2")`,
`loadPrompt("reviewer_v2")`, `loadPrompt("security_auditor_v1")` all resolve.

### 1.1 `reviewer_v3` (2026-06-15) — diff vs `reviewer_v2`
- **Opening UNCHANGED (by design):** role identity + Phase A/B definitions are byte-identical to
  reviewer_v2 (see §3 strategy). Phase A responsibilities also unchanged. First divergence at
  **char 976** (start of the enhanced Phase B responsibilities).
- **Added — Responsibilities (Phase B):**
  - explicit framing that `code.files_written[].content` is **ACTUAL on-disk source, not a plan** —
    read it and trace control flow per handler (root-cause fix for Miss-1: the bridge feeds real
    content but reviewer_v2 said "described implementation").
  - per-handler correctness of **both** success and failure paths (status codes, not-found,
    validation, error propagation).
  - **after any DB mutation, verify affected-row count** (`this.changes` / `rowCount`) and return
    404 on zero rows — a success shape for a non-existent id is a **behavioral defect** (the exact
    PHASE-31 miss).
  - each AC must be **actually satisfied by the code as written** (not merely "addressable").
- **Added — "Code-review discipline (Phase B)" subsection:** trace each handler end-to-end; a DB
  mutation with no affected-row check is a defect even if it "runs"; do not approve on
  path/file-presence alone — judge behavior, not presence.
- **Added — "Severity calibration" subsection:** behavioral/contract defect (wrong/missing status
  code, missing 404, unverified row mutation, unmet AC) = **BLOCKER** (so it loops back via
  RULING-6); pattern/organization/naming/docs/persistence-strategy = WARN/INFO, never BLOCKER on
  style alone; don't inflate style to BLOCKER nor downgrade a correctness defect to WARN.
- **UNCHANGED:** OUTPUT schema (`verdict` / `findings[severity,issue,location,recommendation]` /
  `summary`), verdict rules (APPROVED ≤2 WARN / AWC ≥3 WARN / REJECTED ≥1 BLOCKER), "What NOT to
  include". Schema parity is required — `reviewer_role.js` OUTPUT_SCHEMA is unchanged.

### 1.2 `security_auditor_v2` (2026-06-15) — diff vs `security_auditor_v1`
- **Added — Phase CODE framing:** `code.files_written[].content` is actual source; read how each
  sink is constructed before flagging.
- **Injection responsibility tightened:** flag injection **ONLY** where untrusted input is actually
  concatenated/interpolated into the sink.
- **Added — "Verify-before-flag" subsection (the core calibration for Miss-3):**
  - do NOT raise an injection finding if the code uses parameterized/bound queries (`?` + bound
    array / prepared statements / parameterizing driver) — the defense is ALREADY PRESENT, NOT a
    finding, at any severity.
  - before ANY finding (esp. BLOCKER), confirm the defense is genuinely ABSENT. Recommending a
    mitigation the code already implements is a **FALSE POSITIVE and is prohibited**.
  - when the standard defense is present, omit or explicitly note it.
  - false positives have a real cost (needless loop-back) — flag what is exploitable as written.
- **threat_level rubric + severity ladder:** kept, with two clauses added — threat_level must
  reflect what is **actually exploitable** (no inflation on present defenses); BLOCKER requires the
  defense be **confirmed absent**.
- **What NOT to include:** added "FALSE POSITIVES — a finding whose mitigation the code already
  implements (e.g. flagging SQLi on a parameterized/bound query)".
- **UNCHANGED:** OUTPUT schema (`threat_level` / `findings[severity,vulnerability,location,
  attack_vector,mitigation]` / `summary`). Schema parity required — `security_auditor_role.js`
  OUTPUT_SCHEMA unchanged.

> Note: Miss-2 (AC-2 test-coverage) is deliberately NOT addressed in the reviewer — CTO-approved as
> quality_judge's job (reviewer input has no `test_plan`). No reviewer change for it.

---

## 2. A.2 — role-file version-id bump (the ONLY runtime code change)

4 line-edits across 2 files, no logic change:

| File | Line | before → after |
|---|---|---|
| `code/src/runtime/agents/roles/reviewer_role.js` | 9  | `loadPrompt("reviewer_v2")` → `loadPrompt("reviewer_v3")` |
| `code/src/runtime/agents/roles/reviewer_role.js` | 47 | `system_prompt_id: "reviewer_v2"` → `"reviewer_v3"` |
| `code/src/runtime/agents/roles/security_auditor_role.js` | 9  | `loadPrompt("security_auditor_v1")` → `loadPrompt("security_auditor_v2")` |
| `code/src/runtime/agents/roles/security_auditor_role.js` | 48 | `system_prompt_id: "security_auditor_v1"` → `"security_auditor_v2"` |

(The CTO note said "two system_prompt_id lines"; functionally each role needs BOTH its
`loadPrompt(...)` call and its `system_prompt_id` field bumped, else the role loads v2 text while
reporting v3. No other code touched. Track A: §ARC unchanged — all role I/O still via `reg.invoke`.)

---

## 3. Mock-fixture strategy — CHOSEN: **(a) stable-prefix** (no re-record, no mock_responses.json edit)

### 3.1 The mechanism (CTO finding, confirmed against source)
`mock_adapter.js::_hashKey` prefers a `SCENARIO_TAG:` match → key `provider|model|scenario:<ID>`
(**prompt-text-independent**); it falls back to `provider|model|<first 500 chars of prompt>` ONLY
when the prompt has no `SCENARIO_TAG`. The role injects `SCENARIO_TAG` **only when
`ctx.scenario_id` is set**. So a reviewer/security mock entry is fragile (prefix-keyed) **iff** its
scenario sets no `scenario_id` AND it actually reaches the mock.

### 3.2 Affected set — exactly **{S89, S90}** (both reviewer Phase A)
Audited all 8 reviewer/security role scenarios + the mock_responses.json keys:

| Scenario | sets scenario_id? | reaches mock? | mock key form | fragile? |
|---|---|---|---|---|
| S89 reviewer Phase A | NO | yes | `mock-rev-s89` + prompt-prefix | **YES** |
| S90 reviewer Phase A | NO | yes | `mock-rev-s90` + prompt-prefix | **YES** |
| S91 reviewer Phase B no-code | n/a | **NO** — fails at `INVALID_INPUT` guard before prompt build (no mock entry) | — | no |
| S102 reviewer Phase B | YES | yes | `scenario:S102` | no |
| S96 security SPEC | YES | yes | `scenario:S96` | no |
| S97 security CODE | YES | yes | `scenario:S97` | no |
| S98 security CODE no-code | n/a | **NO** — fails at `INVALID_INPUT` guard (no mock entry) | — | no |
| S99 security bad-json | YES | yes | `scenario:S99` | no |
| S297–S301 reviewProject bridge | YES (`scenario:S29x`) | yes | `scenario:*` | no |

So **only S89 + S90** can break — and **only the reviewer prompt** matters (every security mock
that reaches the adapter is scenario-keyed; security_auditor_v2 text changes break nothing).

### 3.3 Why (a) over (b) re-record
- The reviewer_v3 calibrations all belong in Responsibilities(Phase B)/discipline/severity sections
  — naturally **past char 500**. Keeping reviewer_v3's opening byte-identical to v2 (role identity +
  Phase A/B intro) costs nothing and preserves the S89/S90 prefix keys → **zero re-record, zero
  mock_responses.json edit, least-change** (Track-A aligned).
- (b) re-record would touch mock_responses.json and re-derive prefix hashes for no benefit.

### 3.4 Proven BEFORE the suite run (read-only node check, $0)
```
all four versions load OK (v1/v2 retained, v3/v2 new)
mock-rev-s89 v3-key == v2-key: true | key present in mock_responses: true
mock-rev-s90 v3-key == v2-key: true | key present in mock_responses: true
first-500 reviewer v2===v3: true
v3 length: 5090 | diverges from v2 at char: 976
```
The computed S89/S90 keys under reviewer_v3 are identical to under reviewer_v2 and both exist in
mock_responses.json → S89/S90 will stay GREEN. (Full SU suite run is A.3, post-checkpoint.)

> Fallback if A.3 surprises us: re-record the affected entry under its new prefix key (strategy b).
> Not expected given §3.4.

---

## 4. Doc-drift flag (needs CTO decision — NOT touched)
`docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` lines **173** (`reviewer_v2`) and **213**
(`security_auditor_v1`) document the current `system_prompt_id`. After this bump they are STALE.
Per CLAUDE.md §3.1 I have no permission to edit `docs/**` under this prompt. **Requesting CTO
decision:** update those two lines to `reviewer_v3` / `security_auditor_v2` (one-line each) as part
of STEP A closure, or defer. No deterministic test/doctor check references these strings (grep
clean), so this is documentation hygiene, not a gate failure.

---

## 5. What is NOT done yet (A.3 + A.4 — after CTO GO)
- A.3: run full SU suite; confirm GREEN (expected 317/0/5 unchanged); doctor exit 0
  (§ARC=8, L2=80, roles=13). Handle any broken fixture (not expected per §3.4).
- A.4: build DF-1..DF-4 review-quality fixture controllers under
  `artifacts/spikes/phase35_fixtures/` (inputs for STEP B real run; no mock).

**STOP. Awaiting CTO verification before A.3 + A.4.**
