# PHASE-47 — Final Checkpoint (closure)

Date: 2026-06-30

## Real validation (owner-gated, ONE gpt-4o run)
Harness: `scripts/spikes/phase47_fp_replay.js` (mock dry-run first = $0 plumbing proof, then
`PHASE47_MODE=real`). Three direct `role.invoke` cases over openai/gpt-4o. Evidence:
`artifacts/spikes/phase47_fp_replay/result.json`. Cost delta **$0.08386** (≤ $0.60 estimate;
soft-stop $0.60, hard-kill $3).

| Case | Input | Result | Gate |
|---|---|---|---|
| 1 — FP replay | REAL PHASE-46 Notes-API in-memory build (frozen fixture) | reviewer **APPROVED / 0 BLOCKERs**; security **LOW / 0 BLOCKERs**; derived_verdict **APPROVE** | §4.1 ✓ + §4.6 ✓ |
| 2 — recall SQLi | concatenated-SQL search route (real sink) | security threat **HIGH**, **SQLi BLOCKER fires** | §4.2 ✓ |
| 3 — recall 404 | missing-404 + DELETE-no-affected-check (spec requires 404) | reviewer **REJECTED**, BLOCKER fires for BOTH the 404 and the DELETE-no-check | §4.2 ✓ |

CASE 3 is the key recall control: when the not-found / affected-row check is GENUINELY absent,
the absence-claim clause does NOT suppress it — the reviewer still raises both BLOCKERs. So the
v6 precision tightening removed the false positives without lowering recall.

## Acceptance gate — ALL MET
- §4.1 named FPs fixed (404 + SQLi gone) ✓ — and both over-fires (query-validation, insecure-ID)
  also cleared → reviewer APPROVED, security LOW.
- §4.2 recall retained (SQLi BLOCKER + 404/affected BLOCKER still fire) ✓
- §4.3 S89/S90 + S96-S99 still PASS ✓
- §4.4 full SU 338/0/5 (343), 0 fail ✓
- §4.5 forge-doctor 35/0 FAIL · Track A clean · §ARC=10 ✓
- §4.6 (stretch) ONE real gpt-4o run → derived_verdict APPROVE (pipeline would advance) ✓

W-5 (structural cross-check) NOT triggered — prompts alone passed deterministically (eval) AND
behaviorally (real run). W-5 remains a scoped owner-gated backlog item.

## Change set (LOCAL commit candidates)
LIVE surface (2 files, string-literal bumps only):
- code/src/runtime/agents/roles/reviewer_role.js → reviewer_v6
- code/src/runtime/agents/roles/security_auditor_role.js → security_auditor_v7
docs (pure addition +239):
- docs/10_runtime/18b_ROLE_PROMPTS.md (## reviewer_v6, ## security_auditor_v7)
test-infra:
- code/src/testing/helpers/reviewer_security_fp_prompt_helper.js
- code/src/testing/scenarios/S344_reviewer_v6_citation_discipline.json
- code/src/testing/scenarios/S345_security_v7_no_sink_clause.json
spike (evidence + harness + frozen fixture):
- scripts/spikes/phase47_fp_replay.js
- scripts/spikes/phase47_fp_replay_fixture.json
- artifacts/spikes/phase47_fp_replay/result.json
decision + checkpoints + status:
- artifacts/decisions/DECISION-2026-06-30-phase-47-reviewer-security-fp-remediation.md
- artifacts/decisions/_phase_47_checkpoints/stage_mid.md + stage_final.md
- progress/status.json (phase_47 block + next_phase + self_test counts)

## Disclosed residue (NOT staged)
- artifacts/projects/phase47_fp_replay/, phase47_recall_sqli/, phase47_recall_404/ — vision.md
  scratch from the replay's vision-lock (demo-dir churn; the known forward backlog). Left
  UNTRACKED, not staged.
- progress/status.json also carries a 1-line forge-doctor runtime_health auto-refresh
  (last_doctor_run); folded into the closure status update.

## Closure protocol
LOCAL commit only → CTO closure-diff (fresh zip from local folder) → push GO → annotated tag
phase-47-complete → CTO GitHub-raw verify. Next: PHASE-48-PENDING-DECISION (demo-dir churn /
remaining backlog — needs fresh decision artifact + owner approval; do NOT auto-open).
