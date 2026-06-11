# DECISION — PHASE-31: REVIEWER Bridge (REVIEWER_CODE_AND_SECURITY)

**Date:** 2026-06-11
**Status:** APPROVED (owner delegation via CTO recommendation, chat 2026-06-11)
**Phase:** PHASE-31

## 1. Decision
Implement reviewProject(): the bridge for the REVIEWER_CODE_AND_SECURITY state.
Manifest-scoped dual-role review of the current build, persisted review report,
branch semantics mirroring runTests:

- **Input authority:** orchestration/<loopId>/build_manifest.json is REQUIRED.
  Review scope = manifest.files[].path ONLY (the authoritative build record).
  Manifest absent → { ok:false, error:"review_error", detail:"MANIFEST_REQUIRED" }
  fail-closed, no role calls, no transition. NO scan-all fallback.
- **Dual role:** invoke reviewer AND security_auditor (existing roles) over the
  manifest files' contents. Merged review_report.json persisted to
  orchestration/<loopId>/review_report.json via reg.invoke("fs.write_file") —
  fail-closed: write failure → REVIEW_WRITE_FAILED, no transition.
- **Verdict rule:** final = APPROVE iff BOTH roles return verdict APPROVE.
  Any REQUEST_CHANGES → REQUEST_CHANGES. Unparseable/schema-invalid role output →
  REVIEW_PARSE_FAILED fail-closed (distinct from a legitimate REQUEST_CHANGES).
  role.invoke failure → ROLE_INVOKE_FAILED fail-closed.
- **Branches:**
  - APPROVE → orchestration.advance_state to the graph-defined successor of
    REVIEWER_CODE_AND_SECURITY (expected: DOCUMENTATION — §0-a confirms exact name).
  - REQUEST_CHANGES → orchestration.loop_back to BUILDER (cap-aware,
    from_state=REVIEWER_CODE_AND_SECURITY, iteration_count+1), findings persisted
    in review_report.json for the future feedback-consuming rebuild.

## 2. IN scope
- reviewProject() in conversationEngine.js + POST /api/ai-os/project/review-project
  endpoint registration in apiServer.js (mirroring /build-project и /run-tests
  registration lines). These TWO files only.
- ≥5 mock scenarios (S297–S301). Expected suite: 294/0/5 (299 total).
- Gate #10: ONE real review run on phase28_gate10 at REVIEWER_CODE_AND_SECURITY
  iter-1 (openai/gpt-4o, est. $0.02–0.10). TARGET: reviewer catches the
  this.changes defect → REQUEST_CHANGES → loop_back BUILDER iter-2 → STOP.
  EITHER branch is honest evidence (an APPROVE that misses the defect is itself
  data about reviewer quality — report it, do not retry).

## 3. OUT of scope
Fixture Engine (Finding #4 — PHASE-32 candidate); feedback-consuming rebuild at
BUILDER iter-2; DOCUMENTATION bridge; UI wiring; provider switch; §ARC drift.

## 4. Kill bar & evidence
$3.00. Evidence → artifacts/spikes/gate31_phase31/. STOP-AND-REPORT on: pre-state ≠
REVIEWER_CODE_AND_SECURITY iter-1; MANIFEST_REQUIRED at gate; ROLE_INVOKE_FAILED;
any need beyond ONE review run.

## 5. Staging (binding)
§0 → CTO GO → implement + scenarios → MID checkpoint STOP → CTO verify →
STEP A (full suite + Track A greps + stage_final, NO closure) STOP → CTO verify →
STEP B Gate #10 STOP → CTO verifies evidence → closure files + LOCAL commit ONLY
(NO push, NO tag until explicit CTO push GO — re-tightened protocol) →
CTO closure-diff verify → push GO → tag → TRULY CLOSED.
