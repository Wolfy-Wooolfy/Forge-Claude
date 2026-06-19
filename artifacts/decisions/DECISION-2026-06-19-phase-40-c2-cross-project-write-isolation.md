# DECISION-2026-06-19-phase-40-c2-cross-project-write-isolation

Status:    APPROVED (owner autonomous-CTO delegation 2026-06-19: "قرر انت باعتبارك CTO المشروع باعلى درجات الاحترافية")
Authored:  2026-06-19 — CTO advisor
Phase:     PHASE-40
Depends on: PHASE-36 (DECISION-2026-06-17-phase-36-permission-real-path-hardening.md — C1/C2/C3 L3 real-path hardening; introduced the ctx-keyed C2 boundary + the two C2 deferrals) + PHASE-39 close (clean base). Creation/bootstrap carve-out governance: DECISION-2026-06-07-ux-multiselect-delete.md (D4 — active-pointer behavior).

## §0 Context
PHASE-36 added the C2 active-project write boundary: the L3 policy keys on EXPLICIT
ctx.active_project_id → SCOPE_CROSS_PROJECT denial when a write targets a different project's
folder; materializerEngine writeCtx + buildProject buildCtx thread the active id onto the real
build write path (S326/S327 green). Two C2 items were DEFERRED: (a) a raw fs.write_file with NO
ctx targeting project B while A is active is NOT blocked — the boundary is inert when
ctx.active_project_id is absent (intentional, so ctx-less orchestration isn't blocked), leaving a
cross-project write hole; (b) an active_project.json field-name conflict (design-independent).
This is the ONLY remaining live-surface correctness gap; the rest of the backlog is enhancement.

## §1 Decision
Close C2 deferral (a): make cross-project write isolation hold EVEN when ctx.active_project_id is
not explicitly threaded, by deriving the owning project from the write's RESOLVED TARGET PATH and
enforcing it against the active project at the L3 policy layer — WITHOUT breaking ctx-less writes
that legitimately occur outside any project (incl. project creation/bootstrap). The precise
redesign approach is PROPOSED in §0 and CTO-APPROVED BEFORE any implementation. Deferral (b) is
in-scope only if the chosen design depends on it; otherwise it stays deferred.

## §2 Target isolation invariant
Any write whose resolved target is under artifacts/projects/<P>/** is permitted ONLY if <P> is the
active project (or no active project is set AND the write is a legitimate creation/bootstrap path).
A write targeting <P> while a DIFFERENT project <A> is active is DENIED (SCOPE_CROSS_PROJECT)
regardless of whether ctx.active_project_id was passed. Writes outside artifacts/projects/** are
unaffected.

## §3 Staging (DESIGN-FIRST — live-surface redesign)
STEP 0 (read-only DESIGN probe): this artifact + the §0.B design proposal → STOP for CTO design review. No code beyond the artifact.
STEP A (after CTO approves the DESIGN): implement the approved design + a NEGATIVE-control scenario (ctx-less write to B while A active → DENIED) + a POSITIVE-control (legitimate active-project write still ALLOWED) + a bootstrap/creation carve-out check; re-confirm S326/S327/S328 + the 10 orchestration scenarios; mid-checkpoint → STOP.
STEP B (closure): full suite (321 + new)/0/5; forge-doctor 35/0-FAIL; Track A clean; invariant proven by the negative-control; status.json; closure checkpoint; LOCAL commit → STOP for CTO closure-diff + push GO → tag phase-40-complete → GitHub-raw → TRULY CLOSED.

## §4 Closure gate (deterministic)
Negative-control proves a ctx-less cross-project write is DENIED; positive-control proves a
legitimate active-project write is ALLOWED; bootstrap/creation path still works; S326/S327/S328 +
the 10 orchestration scenarios unchanged-green; full suite green (321 + N); forge-doctor 35/0-FAIL;
Track A clean; §ARC unchanged (10) unless the design needs a new exception (→ STOP for a ledger
decision first); status.json updated; tag on clean commit + GitHub-raw 200.

## §5 Cost
Mock-only, $0. Real keys only if a scenario truly needs a real run (explicit owner confirmation
first). Kill bar $3.

## §6 Risks
R1 LIVE-SURFACE redesign — highest blast-radius to date. Mitigation: DESIGN-FIRST §0 + explicit CTO
design-review gate BEFORE any code; staged STEP A + mid-checkpoint; negative+positive controls;
re-verify S326/S327/S328 + the 10 orchestration scenarios at every gate. R2 breaking ctx-less
legitimate writes (creation/bootstrap) — the design MUST preserve them (invariant carve-out). R3 a
new §ARC exception needed → STOP for ledger decision first. R4 git "U" auto-snapshots → tag on
clean SHA, rev-list verify.

## §7 Authorization
Owner autonomous-CTO delegation 2026-06-19. CTO selected PHASE-40 = C2 cross-project write
isolation (only remaining live-surface correctness gap; deferred from PHASE-36; on a clean
post-PHASE-39 base). DESIGN-FIRST: the §0 design proposal is CTO-reviewed before any live-code
implementation. Fixture Engine + Anthropic switch remain backlog (Anthropic blocked on key).

## AMENDMENT 1 — CTO design review + Step-A authorization — 2026-06-19
CTO independently verified the Step 0 probe and APPROVES Option (i): PATH-DERIVED owning-project +
policy-ambient active register (parallel to the existing active_mode/setActiveMode/getActiveMode),
hybrid with the existing ctx.active_project_id branch. Options (ii)/(iii) rejected (disk-read breaks
orchestration scenarios + adds policy direct-fs; mandatory-threading blast-radius repeats the
PHASE-36 C1 fail-closed regression). SCOPE RULING (on record): Option (i) enforces cross-project
write isolation DURING DECLARED OPERATIONS (the cross-contamination threat model); writes outside
any declared operation are not constrained (no active operation to violate). This is the correct
scope, NOT a hidden gap; the unconditional disk-reconciled variant is rejected. CARVE-OUT: primary =
create→activate ordering (activate the new project before its init-writes; NO governance-filename
whitelist); Step A.0 traces the real creation flow to confirm viability, else STOP for a carve-out
decision. AMBIENT-REGISTER DISCIPLINE: set/clear via try/finally at the operation entry-point(s);
null carve-out (active==null → allowed) preserves {root}-only writes, tests, and pre-declaration
bootstrap. §ARC stays 10 (no new direct fs). Step A also confirms the pre-existing permission
audit-log fs (permissionPolicy.js:28-32) is §ARC-ledgered.

## AMENDMENT 2 — CTO Step-A mid-review + Step-A.3/B authorization — 2026-06-19
CTO independently verified Step A from a fresh zip: the unified checkScope rule (ctx OR ambient), the
policy-ambient active register (parallel to active_mode/setActiveMode/getActiveMode), the buildProject
try/finally seam (clear in finally — no leak between operations), the 3 controls re-run green in-container
(S329 DENIED / S330 SUCCESS / S331 SUCCESS), the RED proof, Track A clean, §ARC=10. Implementation APPROVED.
RULINGS: (1) SEAM-BREADTH — buildProject (the primary/structural write path) is covered; A.3a traces for a
SINGLE common pipeline-dispatch seam and wires the same set/try/finally-clear pattern there ONLY IF all
orchestration scenarios stay green; if ANY goes red (the PHASE-36 fail-closed lesson) or no single clean
seam exists, REVERT to buildProject-only and document the remaining pipeline-stage coverage as a scoped
PHASE-41 follow-up (justified: structural-confinement = zero current cross-project write; PHASE-36
regression risk; lower marginal value). NO 10 individual seams. (2) CREATION — add a REAL-createProject-path
test + confirm no createProject call site is nested inside a buildProject seam window. (3) BYPRODUCTS —
selective staging at STEP B (never stage decision_log.json / test_apiserver_s28 leakage).

## AMENDMENT 3 — Step-B closure — 2026-06-19
PHASE-40 (C2 deferral(a) — ctx-less cross-project write isolation) is **CLOSED** (LOCAL commit; push/tag
await CTO closure-diff + GO).

**A.3a SEAM-BREADTH outcome — buildProject-only + PHASE-41 follow-up.** Trace finding: there is NO single
common production pipeline-dispatch seam. The 10 pipeline-stage operations (formalizeSpec, reviewSpec,
estimateCost, reportEnv, designTests, runTests, reviewProject, documentProject, judgeQuality, deployProject)
are dispatched as 10 SEPARATE apiServer endpoints (apiServer.js:1885-1951), each calling its own
conversationEngine method; the loop advances endpoint-by-endpoint (no production loop runner; the full-loop
test scenarios use test helpers). Per the CTO ruling, did NOT wire 10 individual seams. buildProject (the
primary/structural write path) keeps the seam; the remaining pipeline-stage coverage is a scoped PHASE-41
follow-up. Justification: structural-confinement (each stage derives its write path from its own
body.project_id and cannot target another project) + the PHASE-36 C1 fail-closed regression risk + defense-
in-depth-only marginal value.

**A.3b REAL-createProject test — DONE (not the fallback).** S332 drives the ACTUAL createProject flow via an
in-process apiServer (POST /api/projects/create) in an isolated temp root + ephemeral port (the S225/S228
pattern): create project A (active), then create project B WHILE A is active → B is created and its
artifacts/projects/<B>/project_state.json is written (NOT denied SCOPE_CROSS_PROJECT), because createProject
runs in the ambient-null window and activates B before its init-writes (apiServer.js:883-885). Confirmed by
grep that NO createProject call site (apiServer.js:871 def, :1968 route handler) executes inside a
buildProject seam window. The §A.0 read-only trace + S331 (policy-level carve-out) corroborate.

**Closure metrics:** full SU **325 / 0 / 5 (330 total)** with --max-old-space-size=4096 (321 baseline + 4 new
S329/S330/S331/S332). forge-doctor **exit 0, HEALTHY, 0 critical/FAIL, 35 checks** (6 known non-blocking
warnings). **§ARC = 10** (no new exception) · **L2 = 80** · **roles = 13** · **doctor = 35** — all unchanged.
Track A clean on the edited live files (permissionRules/permissionPolicy/conversationEngine): no new
fs/child_process/fetch/new OpenAI; permissionPolicy's only fs is the pre-existing §ARC-9 audit append;
conversationEngine's only `child_process` token is a string in a NODE_BUILTINS data whitelist. **Mock-only,
$0.** S329 RED-proven (neutralizing the ambient term → SUCCESS, the exact deferral-(a) hole). Net production
deltas: `permissionPolicy` (ambient register + thread into checkScope), `permissionRules.checkScope`
(unified ctx-OR-ambient rule), `conversationEngine.buildProject` (try/finally seam wrapper). Test-infra:
`scenario_runner` (active_project hook) + `phase40_real_create_test_helper` + 4 scenarios. status.json:
next_phase → PHASE-41-PENDING-DECISION; closure summary prepended. Closure checkpoint:
[_phase_40_checkpoints/stage_closure.md](_phase_40_checkpoints/stage_closure.md).
