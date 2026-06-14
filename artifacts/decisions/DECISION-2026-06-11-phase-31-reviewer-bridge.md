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

---

# CLOSURE SECTION — PHASE-31 CLOSED (2026-06-14)

**Status:** CLOSED — CTO-verified through Gate #10 (HONEST EVIDENCE) + RULING-8 clean suite.
**Owner approval:** CTO "GATE #10 VERIFICATION COMPLETE — HONEST EVIDENCE VERIFIED → CLOSURE GO
(PHASE-31)" (chat 2026-06-14), delegated owner authority.

## C.1 What shipped
- `reviewProject()` in `conversationEngine.js` (after `runTests()`) + export in the return block.
- `POST /api/ai-os/project/review-project` in `apiServer.js` (4-line mirror of `/run-tests`).
- 7 per-role mock entries (`mock-rev-sNNN` / `mock-sec-sNNN`) in `mock_responses.json`.
- `review_project_test_helper.js` (NEW) + scenarios `S297–S301` (NEW).
- `reviewer_role.js` / `security_auditor_role.js` **NOT modified** — the derived verdict is
  computed in the bridge from the two native schemas (RULING-6).

## C.2 RULING-6 / RULING-7 / RULING-8 — satisfied
- **RULING-6 (verdict mapping):** `reviewer_approve = (verdict !== "REJECTED") && no finding
  severity=="BLOCKER"`; `security_approve = (threat_level NOT IN {CRITICAL,HIGH}) && no finding
  severity=="BLOCKER"`; `final = APPROVE iff both, else REQUEST_CHANGES`. Fail-closed taxonomy:
  role.invoke non-SUCCESS with `metadata.reason==="INVALID_ROLE_OUTPUT"` → `REVIEW_PARSE_FAILED`;
  any other non-SUCCESS → `ROLE_INVOKE_FAILED`; a valid REJECTED/HIGH-threat is the working
  REQUEST_CHANGES branch, not a failure.
- **RULING-7 (inputs):** `build_manifest.json` REQUIRED (absent/corrupt/empty → `MANIFEST_REQUIRED`,
  no role calls, no write); `spec.json` + `architect_design.json` REQUIRED → `REVIEW_INPUT_NOT_FOUND`;
  code object assembled manifest-restricted from on-disk content (unreadable listed file →
  `REVIEW_INPUT_NOT_FOUND`); reviewer `phase:"B"`, security `phase:"CODE"`. Per-role mock
  disambiguation via stage-split params (S270 precedent).
- **RULING-8 (closure-gate integrity for the S57 flake):** the post-gate clean full-suite run
  returned **294 passed / 0 failed / 5 skipped (299)**, exit 0, zero failures → **S57 confirmed an
  environmental full-suite-load subprocess flake** (pip `--target`, PHASE-3 package management,
  untouched by PHASE-31; GREEN in isolation 8.2s and in the off-load pkg cluster 6/6). Recorded as a
  known full-suite-load flake (same class as S120/121/124–127, S191).

## C.3 Gate #10 — REAL dual-role review (HONEST EVIDENCE)
- **Run:** in-process apiServer (port 0; production pm2:3100 untouched, session restored); CLEAN body
  `{project_id, loop_id, provider:"openai", model:"gpt-4o"}`, no `_test_*`; explicit
  loop_id `98eae33f-105c-4dbc-8f96-71efbb4827b7`.
- **Pre-state:** REVIEWER_CODE_AND_SECURITY iter-1 (verified). **Post-state:** BUILDER iter-2;
  LOOP_BACK audit row `from_state=REVIEWER_CODE_AND_SECURITY`, `mock:false`.
- **Roles (real gpt-4o-2024-08-06, both `success`):**
  - reviewer → `APPROVED_WITH_CONCERNS`, 3 findings, **0 BLOCKER** — 2525/233 tok, 3821ms, $0.01612.
  - security_auditor → `threat_level HIGH`, 5 findings, **2 BLOCKER** — 2564/540 tok, 4316ms, $0.02092.
- **RULING-6 derivation (against raw outputs):** reviewer_approve = (APPROVED_WITH_CONCERNS ≠ REJECTED
  && 0 BLOCKER) = **true**; security_approve = (HIGH ∈ {CRITICAL,HIGH}) = **false** →
  `derived_verdict = REQUEST_CHANGES` → `orchestration.loop_back` → BUILDER iter-2.
- **Cost:** $0.03704 total (kill bar $3.00 untouched).
- **Evidence:** `artifacts/spikes/gate31_phase31/` — `gate31_result.json`, `step4_http_response.json`,
  `step4_review_report.json`, `step4_role_reviewer_output.json`, `step4_role_security_output.json`,
  `step1_graph_before.json`, `step4_graph_after.json`, `step4_loop_back_row.json`,
  ledger before/after, `ruling8_clean_suite_stdout.txt` (294/0/5).

## C.4 Role-QUALITY findings (recorded VERBATIM — NOT PHASE-31 code defects)
The bridge is correct (honest dual-role aggregation → self-correcting loop-back). The real-world
finding is role output QUALITY at this prompt, CTO-adjudicated against the built code:
1. **Reviewer MISS (confirmed):** `updateTodo`/`deleteTodo` in `src/controllers/todoController.js`
   lack `this.changes` row-existence checks (success shapes returned for non-existent ids). The
   reviewer flagged persistence/dependencies/AC-3 completeness instead — it under-caught the logic
   defect that was the gate's target.
2. **Security SQLi BLOCKER = FALSE POSITIVE:** all four queries are parameterized (`?` + bound
   arrays — the correct SQLi defense). The auditor over-flagged.
3. **Security sensitive-data-exposure (errorHandler returns `err.message` to client):** DEFENSIBLE
   information-leak smell (BLOCKER is aggressive; WARN would fit) — a genuine finding.
- **Per RULING-5/8 honest-evidence principle:** raw outputs recorded verbatim; NOT retried.

## C.5 FORWARD backlog (PROMPT-tuning items, not PHASE-31 defects)
- (a) Reviewer prompt may need strengthening on logic/contract defects (row-existence, status-code
  correctness for not-found update/delete).
- (b) Security prompt may need calibration against parameterized-query SQLi false positives.
- Carry-overs unchanged: Finding #4 (harness fixtures); §ARC drift; provider switch
  (anthropic when ANTHROPIC_API_KEY set).

## C.6 Closure-gate ledger
- Suite **294/0/5 (299)**, exit 0 (RULING-8 clean run). Track A: zero new violations (§ARC=8, L2=80).
- Doctor exit 0, 35 checks, 6 known/environmental warnings. Roles 13.
- Files changed: the 9 authorized items (engine + apiServer + mock_responses modified; helper + 5
  scenarios added) + decision/checkpoints + gate31 evidence. reviewer_role.js,
  security_auditor_role.js, iteration_controller.js, orchestration tools, graph: byte-identical.
- Cumulative real spend ≈ $0.58 (this phase +$0.03704).

**Next:** PHASE-32 pending decision. Closure commit stays LOCAL until explicit CTO push GO.
