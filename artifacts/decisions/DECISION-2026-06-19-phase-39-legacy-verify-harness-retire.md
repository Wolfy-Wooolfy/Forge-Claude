# DECISION-2026-06-19-phase-39-legacy-verify-harness-retire

Status:    APPROVED (owner standing-approval 2026-06-19: "موافق على توصياتك طالما باعلى درجات الاحترافية")
Authored:  2026-06-19 — CTO advisor
Phase:     PHASE-39
Depends on: DECISION-2026-06-19-phase-38-legacy-cluster-retire.md (AMENDMENT 3 deferred this) + the PHASE-37 reachability audit.

## §0 Context
PHASE-38 retired the Forge-v1 self-build CLI cluster + dead tooling (60 files) and (AMENDMENT 3) DEFERRED the legacy v1 verification/audit harness (verify/unit/ + verify/audit/) plus its contract-doc reconciliation to its own phase, because it is a distinct, contracted subsystem. This is that phase. The harness is orphaned: its scripts require only fs/path; no live code consumes them; no automated gate invokes them (forge-test runs code/src/testing only; forge-doctor does not touch verify/; no package script consumes them after audit:smoke was removed in PHASE-38). The v2 live verification is the SU scenario harness + forge-doctor.

## §1 Decision
RETIRE the orphaned legacy v1 verification/audit harness FILES and RECONCILE the contract docs that describe them, restoring docs↔reality alignment (a docs-as-source-of-truth integrity fix). Preserve the 5 live v2-layer tests in verify/smoke/ and everything live.

## §2 Scope (re-confirmed in the §0 PROBE before any action)
IN SCOPE — retire (pending §0 re-confirmation of orphaned + no-live-consumer + no-gate):
  - verify/unit/{docs_gap_analyzer.js, mismatch_reporter.js, cross_doc_consistency.js, trace_validator.js}
  - verify/unit/{cross_document_consistency_report.json, docs_gap_validation_report.json, mismatch_report.json, trace_validation_report.json}
  - verify/audit/{audit_logger.js, audit_log.jsonl}
IN SCOPE — doc reconciliation (per-doc plan produced in §0, CTO-reviewed BEFORE any edit):
  the six contract docs listed in §0, plus any other doc the §0 scan finds presenting a
  retired harness file as a CURRENT verification component. Reconciliation = a dated
  addendum/banner marking the described capability superseded by the v2 SU harness +
  forge-doctor; ORIGINAL TEXT PRESERVED (addendum style, like the PHASE-38 Blueprint
  Part C addenda). NOT a rewrite of the verification philosophy.
PRESERVED (do NOT touch): verify/smoke/{test_doctor, test_harness_meta, test_permission_layer,
  test_provider_contract_v2, test_tool_runtime}.js; all of code/src/runtime/**, ai_os/**,
  workspace/**, providers/**, and the 2 live modules.
OUT OF SCOPE: any live runtime code change; the verify/ directory itself (if a doc requires
  the dir to exist/be-writable, keep the dir — only the legacy scripts/reports are retired).

## §3 Critical pre-checks (in the §0 PROBE; STOP-AND-REPORT on any failure)
(a) Re-confirm EVERY in-scope file is orphaned: no require from code/src/** (excluding the
    harness itself), no invocation by any package.json script, by forge-test, or by forge-doctor.
(b) specCompletenessEnforcer.js (LIVE) reads artifacts/verify/unit/docs_gap_validation_report.json
    — an artifacts/-rooted path, distinct from the root verify/unit/ report being retired.
    CONFIRM: (i) retiring the root verify/unit/ files does NOT affect that artifacts/-rooted
    path; (ii) whether a live writer produces artifacts/verify/unit/docs_gap_validation_report.json
    or specCompletenessEnforcer handles its absence gracefully. Report findings. If retiring
    would break a live read, STOP-AND-REPORT.
(c) Confirm the 5 PRESERVED verify/smoke/ tests do NOT import any in-scope file.

## §4 Staging
STEP 0 (read-only): create this artifact + produce the exact retire manifest (per-file
  orphaned evidence) + the per-doc reconciliation plan + the §3 pre-check results → STOP-AND-REPORT.
STEP A (after CTO GO): retire the manifest; apply the CTO-approved doc reconciliation
  (addendum style); mid-checkpoint → STOP.
STEP B (closure): SU suite 321/0/5 (326) UNCHANGED; forge-doctor 35/0-FAIL; Track A live-surface
  clean (no live code touched); post-deletion zero-dangling re-scan; status.json (next_phase →
  PHASE-40-PENDING-DECISION + PHASE-39 closure note); closure checkpoint; LOCAL commit → STOP for
  CTO closure-diff + push GO → annotated tag phase-39-complete → GitHub-raw verify → TRULY CLOSED.

## §5 Closure gate (deterministic)
Manifest retired; the 5 live verify/smoke tests intact; SU suite 321/0/5 UNCHANGED; forge-doctor
35/0-FAIL; Track A live-surface unchanged; zero-dangling re-scan clean (frozen history excepted);
the reconciled docs no longer present a retired file as a live component; status.json updated;
checkpoint written; tag on the clean closure commit + GitHub-raw 200.

## §6 Cost
Mock-only, $0. No LLM calls. Kill bar $3 (untouched).

## §7 Risks
R1 a "harness" file is actually live → §3(a) + STOP. R2 specCompletenessEnforcer live-read
breakage → §3(b) + STOP. R3 doc-reconciliation over-reach → per-doc plan CTO-reviewed before
edits; addendum style; bounded. R4 git "U" auto-snapshot → tag on the clean commit, rev-list verify.

## §8 Authorization
Owner standing-approval 2026-06-19. CTO selected PHASE-39 = legacy verify/audit harness retirement
+ 09_verify/08_audit reconciliation (finishes the PHASE-38-deferred legacy-domain retirement +
restores contract-doc/reality alignment). C2 cross-project write isolation queued as PHASE-40
(higher-value live-surface item, on a fully-clean base). Fixture Engine + Anthropic switch remain
backlog (Anthropic blocked on missing ANTHROPIC_API_KEY). §0 PROBE + STOP-AND-REPORT preserves the
CTO gate before any destructive or doc action.

## AMENDMENT 1 — CTO Step-0 verification + Step-A authorization — 2026-06-19
CTO independently re-verified Step 0 from a fresh zip and confirms: (a) all 10 manifest
files orphaned (zero refs in code/src + bin + package.json; only frozen records); (b) §3b —
specCompletenessEnforcer.js:41 reads artifacts/verify/unit/docs_gap_validation_report.json
(artifacts-rooted, DISTINCT from the retired root verify/unit/ report) and line 43 returns a
deferred PASS on absence; no live writer of that artifacts-rooted path exists — retirement
breaks no live read; (c) the 5 verify/smoke/test_*.js import none of the manifest; (d) the SU
suite (code/src/testing) references none of the manifest → suite count invariant.
CTO RULINGS for Step A:
- Bucket A docs (09_17, 09_18, 09_19, 08_audit) → dated addenda (originals preserved).
- Bucket B: 09_Build_and_Verify_Playbook_Local.md + 10_Tech_Assumptions §6.1.3 → fold-in
  (these contract docs present PHASE-38-deleted files as live workflow/must-exist).
  06_Progress §(L416) + 05_16 (L376) → minimal one-line dated note, OR log as residual if
  not cleanly a one-liner (no rewrites).
- 08_audit: retire ONLY the v1 logger mechanism (audit_logger.js + audit_log.jsonl). The
  fail-closed BOUNDARY RULES themselves are NOT retired (Track A / §ARC still enforces them).
- verify/unit/ + verify/audit/ retained as required dirs (10_Tech §6.1.3) via .gitkeep.

## AMENDMENT 2 — CTO Step-A mid-review + Step-B closure — 2026-06-19
CTO independently re-verified Step A from a fresh zip and confirmed: 10 manifest files
retired; verify/unit/ + verify/audit/ hold only .gitkeep (dirs retained per 10_Tech §6.1.3;
no live bootstrap creates them); specCompletenessEnforcer.js UNTOUCHED; the 5 verify/smoke/test_*.js
intact; all 8 doc addenda are ADDITIVE dated banners (originals preserved); 08_audit retires the
LOGGER MECHANISM ONLY (audit_logger.js → audit_log.jsonl) with the fail-closed boundary RULES
explicitly preserved via Track A/§ARC + SU permission-layer + forge-doctor; the 09_19 path
disambiguation (retired root verify/unit/ report vs. the LIVE artifacts/verify/unit/ read) present.
STEP B closure metrics (all GREEN):
- Full SU suite (mock, --max-old-space-size=4096): 321 passed / 0 failed / 5 skipped (326) —
  UNCHANGED from PHASE-38 (PHASE-39 touched zero executable/test code). duration ~261s.
- forge-doctor: exit 0, HEALTHY — 0 critical, 6 warning, 35 checks, 0 FAIL.
- Track A live-surface: untouched (git status shows no code/src/{workspace,ai_os,runtime,providers}).
- Dangling re-scan (code/config): zero true dangles — the only code hit is the deliberately-preserved
  live read in specCompletenessEnforcer.js:41 (the DISTINCT artifacts/verify/unit/ path, substring-matched),
  plus progress/status.json frozen PHASE-38 history. DOC re-scan: every hit sits inside/under a dated
  RETIRED banner (zero uncovered).
- 06_Progress L416 DISPOSITION: RESIDUAL CLOSED via clean micro-fix — the illustrative current_task
  example "Run verify/smoke/smoke_check.sh" (PHASE-38-deleted) swapped to "Run bin/forge-test.js"
  (live), command-string-only, preserving the Valid/Invalid teaching structure (no banner, no rewrite).
- status.json: next_phase → PHASE-40-PENDING-DECISION; PHASE-39 closure summary prepended to next_step
  (prior history retained); JSON validated.
- §ARC=10 / L2=80 / roles=13 / doctor=35 unchanged; pipeline COMPLETE; mock-only $0.
PHASE-40+ owner-gated BACKLOG ONLY (do NOT auto-start): (1) C2 cross-project write isolation;
(2) Fixture Engine; (3) Anthropic provider switch (blocked on ANTHROPIC_API_KEY).
LOCAL commit only — push + annotated tag phase-39-complete await explicit CTO closure-diff + GO.
