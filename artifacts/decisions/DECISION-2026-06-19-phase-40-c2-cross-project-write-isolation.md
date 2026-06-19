# DECISION-2026-06-19-phase-40-c2-cross-project-write-isolation

Status:    APPROVED (owner autonomous-CTO delegation 2026-06-19: "قرر انت باعتبارك CTO المشروع باعلى درجات الاحترافية")
Authored:  2026-06-19 — CTO advisor
Phase:     PHASE-40
Depends on: PHASE-36 (DECISION-2026-06-07 — C1/C2/C3 L3 real-path hardening; introduced the ctx-keyed C2 boundary + the two C2 deferrals) + PHASE-39 close (clean base).

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
