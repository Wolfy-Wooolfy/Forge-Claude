# DECISION-2026-06-19-phase-41-fixture-engine

Status:    APPROVED (owner standing-approval 2026-06-19: "موافق على توصياتك بشرط تكون باعلى درجات الاحترافية ولو في حل افضل نعمله")
Authored:  2026-06-19 — CTO advisor
Phase:     PHASE-41 (FOUNDATION of the capability arc: 42 Built-Project Test Harness, 43+ real demonstrable build)
Depends on: PHASE-40 close (clean base); PHASE-36 .gitignore decision (decision_log.json TRACKED).

## §0 Context
Across PHASE-38/39/40, running the SU suite mutated the TRACKED artifacts/llm/decision_log.json
(DECISION_PACKET appends from scenarios like S25) and created stray test project dirs under
artifacts/projects/ (e.g. test_apiserver_s28); the environment's "U" auto-snapshots then committed
these, producing recurring closure-noise that had to be hand-managed (selective staging) every
phase. This is the last hygiene blemish on an otherwise-clean codebase, and it will WORSEN during
the capability arc (which runs many real builds + fixtures). PHASE-41 eliminates test-run byproducts
at the root so every future phase — and the capability work — starts and ends with a clean tree.

## §1 Decision
Build a Fixture / Test-Isolation layer so that a full `bin/forge-test.js` run leaves ZERO byproducts
in the tracked working tree: SU scenarios get an ISOLATED, EPHEMERAL fixture root; test-run writes
that currently hit tracked paths (decision_log.json, artifacts/projects/test_*, any others the §0
probe finds) are REDIRECTED off the tracked tree (or into ignored/ephemeral locations) and TORN
DOWN cleanly. The precise design + scope are PROPOSED in §0 and CTO-approved before implementation.
No change to scenario semantics or pass/fail behavior — only WHERE fixtures/byproducts live.

## §2 Scope (refined by the §0 probe)
IN: redirect/isolate every test-run write that currently lands on a tracked path; ephemeral fixture
root + guaranteed teardown in scenario_runner; the verification that `git status` is clean after a
full suite run.
OUT (this phase): the Built-Project Test Harness (PHASE-42); any built-project capability; real-
provider runs. No live runtime behavior change (test-infra only).
PRESERVED: scenario semantics, the 325 passing scenarios, the PHASE-40 ambient hook, all live code.

## §3 Staging
STEP 0 (read-only): this artifact + the §0.B byproduct inventory + the proposed Fixture Engine design
+ scope + §ARC check + the clean-tree verification approach → STOP-AND-REPORT.
STEP A (after CTO GO): implement the isolation/redirection + teardown; mid-checkpoint (prove a full
suite run leaves `git status` clean) → STOP.
STEP B (closure): full suite 325/0/5 UNCHANGED + `git status` CLEAN after the run; forge-doctor 35/0-
FAIL; Track A clean; §ARC unchanged (10) unless a new exception is truly needed (→ STOP for ledger
decision first); status.json (next_phase → PHASE-42-PENDING-DECISION); closure checkpoint; LOCAL
commit → STOP for CTO closure-diff + push GO → tag phase-41-complete → GitHub-raw → TRULY CLOSED.

## §4 Closure gate (deterministic)
After a full `bin/forge-test.js` run: `git status --porcelain` is EMPTY (zero byproducts); decision_log.json
+ artifacts/projects/ are untouched by the suite; suite still 325/0/5 (330); forge-doctor 35/0-FAIL;
Track A clean; §ARC=10; status.json updated; tag on clean commit + GitHub-raw 200.

## §5 Cost
Mock-only, $0. No LLM calls. Kill bar $3 (untouched).

## §6 Risks
R1 redirecting a write breaks a scenario that reads it back → re-run the full suite (325/0/5 must hold).
R2 a "byproduct" is actually a legitimate tracked artifact → the §0 inventory classifies each before
any redirection; decision_log.json stays TRACKED (PHASE-36) but the suite must not WRITE to the
tracked copy (redirect test-run writes to an ephemeral/ignored path). R3 a new §ARC exception needed →
STOP for ledger decision first (expected: none — harness fs is already §ARC-sanctioned). R4 git "U"
auto-snapshot → tag on clean SHA, rev-list verify.

## §7 Authorization
Owner standing-approval 2026-06-19 + the capability-arc framing. CTO selected PHASE-41 = Fixture Engine
as the FOUNDATION of the capability arc (eliminate test-run byproducts before the build-heavy capability
work). PHASE-42 (Built-Project Test Harness) + 43+ (real demonstrable build) pending owner nod on the
arc direction. The cross-project coverage extension (PHASE-40 follow-up) remains backlog.

---
## AMENDMENT 1 — 2026-06-19 — STEP-0 CTO verification + DESIGN DECISION (D1)

### STEP-0 verified independently by the CTO (fresh zip)
- Artifact present (63 lines).
- Root cause confirmed: bin/forge-test.js L25 `ROOT = path.resolve(__dirname,"..")` (repo root) → L56
  `runScenarios({ root: ROOT })`. The single `root` is threaded by scenario_runner for BOTH module
  `require` (path.join(root,"code",...) at L165/205/322/357) AND data, plus `ctx.root` (L278) and the
  per-scenario `_cleanup` rmSync (L296). Assertions resolve via ctx.root (artifact_exists.js:13,
  file_json_field.js:14).
- Both tracked-file writers honor the PASSED root (NOT __dirname): runDoctor `_patchStatusRuntimeHealth(root)`
  → `root/progress/status.json` (L93-110); apiServer `root` → `root/artifacts/llm/decision_log.json`
  (L56/61), and every engine is constructed with `{ root }` (L74-89). Byproduct inventory accepted
  (S25 → decision_log.json; S196 → status.json; zero stray dirs; /api/system/doctor latent/unhit).

### DECISION: D1 (Ephemeral Overlay Root)
Rationale: (a) `root` is code-root AND data-root (runner requires via path.join(root,...)), so a "data-only
redirect" (D2) would require threading a NEW data-root param through the LIVE surface (apiServer/runDoctor =
Track A, invasive) OR building the same overlay for a subset of scenarios → D2 buys no clean simplicity here.
(b) PHASE-36 already made every write honor the passed root (verified) → the runtime is root-relocatable →
D1 just supplies a different root, test-harness-only, ZERO live-surface change. (c) D1 structurally confines
ALL writes — current AND the capability arc's future writers — which is the reason for doing it before PHASE-42.
D2 (targeted redirect) retained as FALLBACK only if A.2 cannot reach green.

### Design shape
fixtureRoot under os.tmpdir(): directory JUNCTIONS (fs.symlinkSync(absTarget, link, "junction") — Windows, no
admin) for read-only inputs the runtime resolves via root (code/, docs/, node_modules/, web/, architecture/,
and any others A.0 finds) + FRESH writable artifacts/ and progress/, SEEDED with the read-then-write files
(progress/status.json, artifacts/llm/decision_log.json, artifacts/llm/approval_policy.json, + any reference
files A.0 finds). Pass fixtureRoot as the `root` to runScenarios (→ engines/server/doctor/registry) AND as
ctx.root. Guaranteed teardown: rmSync(fixtureRoot, {recursive,force}) in finally. Default PER-SUITE (preserves
the current green cross-scenario sharing model; fast); per-scenario seed only if A.2 requires it for 325/0/5.

### Gate (the real goal)
After the suite runs on fixtureRoot, verification runs in the REAL repo working tree: `git status --porcelain`
EMPTY (zero byproducts) + `git hash-object artifacts/llm/decision_log.json` unchanged + progress/status.json
unchanged + suite 325/0/5 (330). §ARC=10 unchanged (scenario_runner is test-infra, outside Track A).
