# PHASE-31 MID-CHECKPOINT — stage_mid.md

**Date:** 2026-06-14
**Phase:** PHASE-31 (REVIEWER_CODE_AND_SECURITY bridge — reviewProject)
**Status:** MID-CHECKPOINT PASS — S297–S301 GREEN + zero regression on adjacent bridges (S273–S296)

---

## 1. `reviewProject()` — the bridge (conversationEngine.js, inserted after `runTests()`)

Manifest-scoped dual-role review at REVIEWER_CODE_AND_SECURITY, per RULING-6 + RULING-7.

**Flow:**
1. PROJECT/loop guards → `review_error:PROJECT_NOT_FOUND` / `NO_LOOP_ID` (advanced:false).
2. State guard via `orchestration.get_status` — must be `REVIEWER_CODE_AND_SECURITY`, else
   `review_error:WRONG_STATE` (echoes `current_state`), advanced:false.
3. **Input authority (RULING-7):** read `orchestration/<loop>/build_manifest.json`. Absent /
   unparseable / empty `files[]` → `{ ok:false, error:"review_error", detail:"MANIFEST_REQUIRED" }`
   — NO role calls, NO transition, nothing written. No scan-all fallback.
4. Read `spec.json` + `architect_design.json` (REQUIRED) → `REVIEW_INPUT_NOT_FOUND` if missing/unparseable.
5. **Assemble code object (RULING-7):** read each `manifest.files[].path` from disk →
   `{ files_written:[{path,content}], summary:"<from manifest>", dependencies_added:[] }`.
   A listed file that cannot be read → `REVIEW_INPUT_NOT_FOUND` fail-closed (broken record).
6. **Dual role (sequential, 30s timeout race each — mirror estimateCost):**
   - `reviewer` with `phase:"B"` (code review).
   - `security_auditor` with `phase:"CODE"`.
   - role.invoke non-schema failure → `ROLE_INVOKE_FAILED`; role output failing OUTPUT_SCHEMA
     (`metadata.reason === "INVALID_ROLE_OUTPUT"`) → `REVIEW_PARSE_FAILED`. Both advanced:false.
     Reviewer is invoked first; a reviewer parse-fail short-circuits (security never called).
7. **Derived verdict (RULING-6 — computed here, NOT a new role field):**
   ```
   reviewer_approve = verdict !== "REJECTED" AND no finding severity==="BLOCKER"
   security_approve = threat_level NOT IN {CRITICAL,HIGH} AND no finding severity==="BLOCKER"
   derived_verdict  = (reviewer_approve AND security_approve) ? "APPROVE" : "REQUEST_CHANGES"
   ```
8. **Persist BEFORE any transition (fail-closed):** `review_report.json` =
   `{ reviewer, security, derived_verdict, computed_at }` via `reg.invoke("fs.write_file")`.
   Write throw/not-ok → `{ ok:false, error:"review_error", detail:"REVIEW_WRITE_FAILED" }`, no transition.
9. **Branch:**
   - APPROVE → `orchestration.advance_state` → DOCUMENTATION (role_invoked:"reviewer");
     returns `{advanced:true, advanced_to:"DOCUMENTATION", derived_verdict, review_report}`.
   - REQUEST_CHANGES → `orchestration.loop_back` (cap-aware). escalated → `advanced_to:"ESCALATED"`;
     else `advanced_to:"BUILDER", loop_back:true`. findings already persisted in review_report.json.

**Stage-split params** (`reviewer_*` / `security_*`, S270 precedent) disambiguate the two role
mocks. Production: omit them; `body.provider`/`body.model` drive both (default openai/gpt-4o).
Test-only `_test_force_timeout` hook (never set in production) mirrors buildProject/runTests.

## 2. Endpoint (apiServer.js) — 4-line mirror

`POST /api/ai-os/project/review-project` → `conversationEngine.reviewProject(body)`, inserted
verbatim after the `/run-tests` block. No other apiServer change.

## 3. Mock responses (mock_responses.json) — per-role keys, $0

| key | role | shape |
|-----|------|-------|
| `mock\|mock-rev-s297\|scenario:S297` | reviewer | APPROVED, INFO only (no BLOCKER) |
| `mock\|mock-sec-s297\|scenario:S297` | security | threat LOW, INFO only |
| `mock\|mock-rev-s298\|scenario:S298` | reviewer | REJECTED + BLOCKER |
| `mock\|mock-sec-s298\|scenario:S298` | security | clean (LOW, no BLOCKER) |
| `mock\|mock-rev-s299\|scenario:S299` | reviewer | APPROVED (no BLOCKER) |
| `mock\|mock-sec-s299\|scenario:S299` | security | threat HIGH, WARN only (no BLOCKER) |
| `mock\|mock-rev-s301\|scenario:S301` | reviewer | valid JSON, fails OUTPUT_SCHEMA |

S300 needs no mock (fail-closed before any role call). S301 needs only the reviewer mock
(reviewer fails first; security never reached).

## 4. Scenarios (5 NEW) + helper

- `S297_review_approve_advances` — both clean → APPROVE → DOCUMENTATION; review_report persisted.
- `S298_review_request_changes_loops_back` — reviewer REJECTED+BLOCKER → REQUEST_CHANGES →
  loop_back BUILDER; iteration_count→1; LOOP_BACK audit from_state=REVIEWER_CODE_AND_SECURITY;
  report_has_blocker.
- `S299_security_high_threat_blocks` — reviewer APPROVED but security threat=HIGH (no BLOCKER) →
  REQUEST_CHANGES → BUILDER (threat axis blocks independently; report proves reviewer=APPROVED,
  security=HIGH).
- `S300_review_manifest_required` — no manifest → ok:false / error:review_error /
  detail:MANIFEST_REQUIRED; graph still REVIEWER_CODE_AND_SECURITY; no review_report written.
- `S301_review_role_parse_failure` — reviewer schema-invalid → REVIEW_PARSE_FAILED; no transition;
  no review_report written (distinct from a legitimate REQUEST_CHANGES).
- Helper `review_project_test_helper.js`: `_seedLoopAtReview` (seeds to
  REVIEWER_CODE_AND_SECURITY + writes spec/design/manifest/files), 5 runner functions. Direct fs
  in test infra per established Track A note in the file header.

## 5. Scenario results (mock provider, $0)

```
✓ S297 ✓ S298 ✓ S299 ✓ S300 ✓ S301
ALL PASS — 5 passed, 0 failed, 0 skipped (3076ms)

Adjacent bridges (no regression on the touched engine file's neighbors):
✓ S273 ✓ S274 ✓ S275 ✓ S276   (estimateCost)
✓ S284 ✓ S285 ✓ S286 ✓ S287   (designTests)
✓ S288–S292                   (runTests PHASE-29)
✓ S293–S296                   (runTests PHASE-30 entry derivation)
ALL PASS — 17 passed, 0 failed (5583ms)
```

## 6. Track A (preliminary — full greps at STEP A)

reviewProject + endpoint use `reg.invoke` only (`fs.read_file`, `fs.write_file`,
`orchestration.get_status`/`advance_state`/`loop_back`, `role.invoke`). No new `fs.*Sync` /
`child_process` / `fetch(` / `new OpenAI(` in production code. §ARC=8 (no new exception).
L2=80 (no new tools — all already registered). reviewer_role.js / security_auditor_role.js
NOT modified (derived verdict is computed in the bridge, per RULING-6).

## 7. Files modified/created (complete list)

| File | Change |
|------|--------|
| `code/src/ai_os/conversationEngine.js` | + `reviewProject()` after `runTests()`; + `reviewProject` in return block |
| `code/src/workspace/apiServer.js` | + 4-line `POST /api/ai-os/project/review-project` mirror block |
| `code/src/runtime/agents/adapters/mock_responses.json` | + 7 per-role mock entries (S297–S301) |
| `code/src/testing/helpers/review_project_test_helper.js` | NEW — `_seedLoopAtReview` + 5 runners |
| `code/src/testing/scenarios/S297–S301 (5 files)` | NEW |
| `artifacts/decisions/DECISION-2026-06-11-phase-31-reviewer-bridge.md` | created (PART A, verbatim) |
| `artifacts/decisions/_phase_31_checkpoints/stage_mid.md` | this file |

No other files changed. NO status.json change yet (STEP A/closure only).

---

## Next: STEP A (awaiting CTO verify of MID)

- Full suite via Start-Process workaround (expect 294/0/5, 299 total).
- Track A greps (`fs.*Sync` / `child_process` / `fetch(` / `new OpenAI(` outside §ARC) +
  `node bin/forge-doctor.js` exit 0 + stage_final.md → STOP. NO closure, NO status.json.

**WAITING FOR CTO.**
