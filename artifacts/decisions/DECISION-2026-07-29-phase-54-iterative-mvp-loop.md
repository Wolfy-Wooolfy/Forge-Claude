# DECISION-2026-07-29-phase-54-iterative-mvp-loop

**Date:** 2026-07-29 (Step 0 + CTO GO) / 2026-07-30 (D0 executed after environment restore)
**Status:** APPROVED — CTO-authored under owner delegation ("قرر بنفسك", 2026-07-29); Step 0 review ACCEPTED with rulings R-7..R-12; environment-restore GO with rulings R-13..R-15
**Author:** CTO (Claude) + CC Step-0 findings, bidirectional Trust+Verify
**Phase:** PHASE-54 — ITERATIVE MVP LOOP (Slice 1: Owner Review Loop Core)
**Baseline:** tag `phase-53-complete` → `a69de85`; origin/main `5205c6e` (owner U-commits on artifacts/projects/** only); SU baseline restored 2026-07-30 at **365/0/5 (370), exit 0**

## 1. Problem / goal

Forge's pipeline builds the FULL spec in one pass and the owner first sees the product at
Gate 2 (QUALITY_JUDGE). There is no early, iterative owner touchpoint. PHASE-54 Slice 1 adds
an opt-in MVP loop: derive a minimal slice from the approved spec, build+test ONLY that slice
via the existing materializer/harness path, present a plain-language report assembled from the
real harness verdicts, hold in an owner-review state, interpret the owner's plain-language
reply as structured ACCEPT or REFINE{changes[]}, thread REFINE changes into the existing
loopback rebuild path, re-present, and on ACCEPT exit into the normal remaining pipeline.

## 2. Capability (binding scope, from PROMPT-STAGE-54 §1)

On projects with `mvp_loop.enabled=true` ONLY. Flag-off path byte-identical to PHASE-53.
Iteration cap enforced via the single existing cap mechanism. No parallel loop machinery.

## 3. Rulings (verbatim record)

### R-1..R-6 (PROMPT-STAGE-54, CTO-authored 2026-07-29)

R-1 flag-gated per project, default OFF; flag-off path byte-identical to PHASE-53
    behavior (invariance proven by SU + diff evidence).
R-2 reuse iteration_controller/materializer/loopback machinery; no parallel loop.
R-3 feedback interpretation is provider-driven structured output; zero keyword
    matching; TEST mode = scenario user_inputs script the owner turn (hermetic).
R-4 one iteration-cap source of truth (extend existing constant if present).
R-5 no new §ARC (frozen at 10); any need => STOP-AND-REPORT.
R-6 contract doc = docs/12_ai_os/24_MVP_LOOP_CONTRACT.md.

### R-7..R-12 (CTO Step-0 review GO, 2026-07-29 — each names the finding it resolves)

R-7 (resolves F-1) — REVIEW GATE HOSTING. Your premise is ACCEPTED: no 18th graph state.
The graph is contract-frozen and double-locked at boot; the review gate lives in the ai_os
layer as mvp_loop.status, exactly like the three existing persist-then-BLOCK owner gates.
BUT the host state is AMENDED: hold at RUN_TESTS, do NOT advance to
REVIEWER_CODE_AND_SECURITY. Rationale (CTO-found hole): REVIEWER_CODE_AND_SECURITY is the
exact state at which reviewProject's guard passes, so parking the owner gate there leaves a
live bypass — any reviewProject call advances to DOCUMENTATION and the owner never reviews.
Holding at RUN_TESTS is strictly safer and matches persist-then-BLOCK semantics (state does
not move until the owner answers). Consequences, all binding:
  (i)  flag ON + tests PASS: SUPPRESS the existing advance_state call in runTests; set
       mvp_loop.status = AWAITING_OWNER_REVIEW; return advanced:false.
  (ii) ACCEPT: perform the DEFERRED advance — parameter-identical to the advance runTests
       performs today (same to_state REVIEWER_CODE_AND_SECURITY, same transition_type, same
       role_invoked). Flag-ON ACCEPT must converge on the identical graph trajectory.
  (iii)REFINE: orchestration.loop_back fires from RUN_TESTS — the production-proven path
       (PHASE-29 evidence from_state:"RUN_TESTS"), not the reviewer path.
  (iv) The owner-attention signal MUST NOT reuse gate_pending (that field is bound to
       respondGate's _GATE_RESPONSES/_GATE_HOST_STATE contract and reusing it would corrupt
       Gate 1/2/3 semantics). Use a distinct field, e.g. mvp_review_pending: true.
  (v)  MANDATORY SU assertion: while status === AWAITING_OWNER_REVIEW, reviewProject returns
       WRONG_STATE. This is the anti-bypass lock — own scenario or an assertion inside the
       ACCEPT scenario, your call.

R-8 (resolves F-2) — OWNER_CHANGES PROMPT BLOCK. Your recommendation ACCEPTED: a dedicated
optional owner_changes[] block in _buildCodegenPrompt. The zero-touch alternative is
REJECTED: labelling owner requests as "PREVIOUS BUILD ATTEMPT FAILED THESE CHECKS" when the
tests passed is a false statement to the model and poisons the prompt trace as forensic
evidence. Conditions:
  (i)  Distinct heading/marker, structurally separate; never merged into the repair block.
  (ii) Empty or undefined ⇒ BYTE-IDENTICAL prompt. Extend the S335 invariance test to cover
       the new parameter (pre-A-5 arity, [], undefined → all strictly equal).
  (iii)Fixed ordering when both are non-empty: owner_changes block FIRST, repair block stays
       LAST (preserves the documented A-5 design intent). Assert the ordering in SU.
  (iv) PERSISTENCE: owner_changes survive subsequent internal loopbacks until superseded by
       the owner's next review turn. Rationale: if a REFINE rebuild fails tests and the
       internal loop rebuilds without the owner's changes, the owner's requirement is
       silently reverted. Persist, do not drop.

R-9 (resolves F-3) — SHARED CAP CONFIRMED. R-4 holds: owner REFINEs and internal
test-failure loopbacks share the single ITERATION_CAP=5 counter. A second cap constant is
forbidden. Added requirement: CAP_REACHED must surface to the owner in plain language (what
happened, what they can do) — a silent ESCALATED is a phase failure, since owner-facing
clarity is this phase's entire purpose. Record the UX consequence (a flaky build can starve
the owner's REFINE budget) in the contract doc as a known Slice-1 limitation with a
data-driven revisit trigger; revisiting requires a separate decision artifact, never a
second constant.

R-10 (resolves F-4, CTO-found hazard) — POST-REFINE TEST FAILURE ROUTES TO THE OWNER.
F-4 understates the risk: the test_plan is frozen at TEST_DESIGN, so an owner REFINE that
contradicts an existing assertion (e.g. "return 201 instead of 200") makes the rebuild fail,
the blind A-5 repair loop reverts the owner's change to satisfy the stale assertion, and the
loop thrashes to ESCALATED with the owner's request silently undone. Binding rule: when
mvp_loop.enabled AND at least one owner REFINE is outstanding (owner_changes non-empty), a
RUN_TESTS FAIL routes to the OWNER REVIEW gate — report includes the failing assertions in
plain language — instead of an automatic internal loopback. Before any owner REFINE exists
(first build), behaviour is unchanged: A-5 internal loopback exactly as today. The owner is
the authority on whether their change or the frozen test plan wins. Needs its own scenario.

R-11 — REPORT FACTS ARE ARTIFACT-DERIVED. Every fact in the owner report (files built and
their count, scenario names, pass/fail counts, how to run/see it) is assembled
deterministically from the persisted harness artifacts with ZERO provider involvement. A
provider may only add prose framing as an additive wrapper and may never be the source of a
fact. SU asserts the factual fields equal the artifact values field-by-field. Persist the
report at artifacts/projects/<pid>/orchestration/<loopId>/mvp_report.json.

R-12 — NO KEYWORD MATCHING (reinforces R-3). The feedback interpreter must NOT reuse,
extend, or imitate _hasTransitionIntent's lower.includes(kw) pattern. ACCEPT/REFINE/UNCLEAR
comes from structured provider output only. UNCLEAR or provider failure ⇒ clarifying
question, stay in review, no state movement, no HALT.

### R-13..R-15 (CTO environment-restore GO, 2026-07-30)

R-13 — RESTORE THE ENVIRONMENT, DO NOT TOUCH THE SU SURFACE. The PHASE-54 baseline must be
the exact 365 pass / 0 fail / 5 skip that PHASE-53 closed on, so any later regression is
unambiguously attributable to this phase. Both alternatives are REJECTED: adding
requires_binary to S57 mid-phase is making a red gate green rather than fixing the cause (and
would silently delete real pip coverage plus shift the closure arithmetic); proceeding at
364/1/5 violates INSTRUCTIONS.md §6.
R-14 — S57's missing requires_binary guard is logged as a BACKLOG item in D0's decision
artifact, with the CTO-F1 evidence (five docker scenarios use the pattern, S57 does not). It
is NOT fixed in PHASE-54; it needs its own decision artifact in a future hardening phase.
R-15 — The uncommitted progress/status.json drift from the doctor run is expected under R-5.
Do not revert it; fold it into the D0 commit.

### R-16..R-19 (CTO mid-checkpoint verification GO, 2026-07-30 — each names the finding it resolves)

CTO-F-A (MUST FIX BEFORE D3) → R-16. status.json currently self-contradicts: current_task =
"PHASE-54-ITERATIVE-MVP-LOOP" while next_phase = "PHASE-54-PENDING-DECISION". The authoritative
single source of truth cannot state that this phase is simultaneously in progress and pending
a decision. R-16: set next_phase = "PHASE-55-PENDING-DECISION". One-line fix, own commit.

CTO-F-C (design interaction hole) → R-17. MVP_STATUSES makes ACCEPTED terminal. Trace the
consequence: owner ACCEPTs → deferred advance → REVIEWER → DOCUMENTATION → QUALITY_JUDGE →
Gate 2. If the owner then answers Gate 2 with REJECT_AND_LOOP, the graph returns to BUILDER but
mvp_loop is terminal, so the rebuild silently falls back to the old blind path with no owner
MVP review — the owner's second round of feedback goes through the very mechanism this phase
exists to replace. R-17: for Slice 1 the loop does NOT re-engage after ACCEPTED (ACCEPTED stays
terminal), but this MUST be stated explicitly in docs/12_ai_os/24_MVP_LOOP_CONTRACT.md as a
known Slice-1 limitation with this rationale, and Gate-2 loop-backs after ACCEPTED must not
crash or half-engage the loop. Re-engagement is a later slice with its own decision artifact.

CTO-F-D (spend surface) → R-18. deriveScope defaults provider "openai", model "gpt-4o",
budget_usd 0.25. The provider/model defaults match existing bridge precedent (reviewProject,
judgeQuality) — accepted. The budget_usd 0.25 default is NEW to this phase and unjustified: a
single scope derivation over a spec is roughly $0.01–0.03, so 0.25 is ~10x headroom introduced
silently. R-18: state the precedent (what other agent.invoke callers pass for budget_usd) and
either align with it or justify 0.25 explicitly in the contract doc §. Additionally, every D3
wiring path must thread provider explicitly — no code path may reach a real provider merely by
falling through to a default, and no SU may depend on the default.

CTO-F-F (D4 decision) → R-19. feedback_history entries accept decision ∈ {ACCEPT, REFINE}
only, so an UNCLEAR owner turn leaves no forensic trace. R-19: record UNCLEAR turns too
(decision: "UNCLEAR", changes: []) — additive schema change, extends the existing validator.

### R-20..R-22 (CTO second-checkpoint verification GO, 2026-07-30)

R-20 — ACCEPT ON A FAILING REPORT REQUIRES A DISTINCT, INFORMED DECISION.
Confirmed by the CTO: ACCEPT performs the deferred advance unconditionally, including when the
report kind is FAIL_REVIEW. That collides with Blueprint Part D.2 — "if a scenario fails, Forge
does not advance; the user sees the test report as primary evidence" — a Layer-0 commitment. A
hard block, however, re-creates exactly the trap R-10 exists to close: an owner whose REFINE
contradicts the frozen test plan would be locked out until the cap. Therefore the advance is
PERMITTED under all of the following compensating controls, which are binding:
  (i)   A bare ACCEPT against a FAIL_REVIEW report resolves to UNCLEAR → clarifying question,
        no advance. The report must state plainly, in owner language, that tests are failing and
        that accepting means proceeding with them.
  (ii)  Advancing requires a DISTINCT decision value — ACCEPT_WITH_FAILING_TESTS — produced by
        the provider from an unambiguous owner turn. A separate enum value, never a flag or
        modifier on ACCEPT, so the decision is legible in the forensic record.
  (iii) Forensic trail, mandatory: the failing report path and the failing assertion ids are
        recorded in feedback_history AND surfaced downstream. reviewProject, judgeQuality and
        the Gate-2 payload must each carry a marker that this build advanced with known-failing
        tests. It is never buried, and no downstream stage may see a clean picture.
  (iv)  Governance: record this in the decision artifact as a NAMED, narrowly scoped exception
        to Blueprint Part D.2 — the Blueprint's own authority clause states that Layer-0
        conflicts are resolved by a decision artifact scoped to the specific conflict, which is
        exactly what this is. State the rationale (frozen-test-plan trap) and list the
        compensating controls (i)-(iii). Do NOT edit the Blueprint.
  (v)   SU: prove both legs — bare ACCEPT on FAIL_REVIEW yields UNCLEAR with no advance and no
        state movement; explicit ACCEPT_WITH_FAILING_TESTS advances AND the downstream marker
        plus the forensic entry are both present. Extend S375 or add a new scenario; your call,
        declare the exact final count.

R-21 — S375's R-17 leg proves a NARROWER property than its name suggests: because the fixture
manifest is hand-restored before runTests, it establishes that mvp_loop does not re-engage after
ACCEPTED, but NOT that the post-ACCEPT rebuild path works end-to-end. State this scoping limit
explicitly in both the checkpoint and docs/12_ai_os/24_MVP_LOOP_CONTRACT.md so no later reader
mistakes it for end-to-end proof.

R-22 — RE-PIN THE OWNER IDENTITY (authorized, narrowly scoped). uid_pin_match is the sole
remaining doctor failure (30/4/1) and the Windows profile genuinely changed; the PHASE-12 guard
is working correctly. The remediation is to RE-PIN, never to weaken, skip, or special-case the
check. Binding conditions: use the existing sanctioned code path
(code/src/runtime/production/uid_pin.js, or the install-script entry that calls it) — do NOT
hand-edit progress/uid_pin.json; record the before and after identity values in the closure
checkpoint; then re-run the doctor and report the full summary. Because uid_pin.json is
gitignored it cannot be verified from the zip, so the RAW forge-doctor JSON summary must be
pasted into the closure checkpoint as an artifact (this also discharges the §B verification gap
raised at the first checkpoint).

### R-23..R-24 (CTO Gate-#10-prep verification GO, 2026-07-30)

R-23 (resolves F-G1) — REJECTED: DO NOT SKIP DOCUMENTATION. The Gate must run the real path
end to end: reviewProject -> documentProject -> judgeQuality. Rationale: (1) the saving is
~$0.05-0.08 and Tavily is free-tier, so the "Tavily accounting" saving is bookkeeping, not
money; (2) advance_state validates state IDs only and never consults TRANSITION_TABLE, so a
hand-advance from REVIEWER_CODE_AND_SECURITY to QUALITY_JUDGE is a path production never
takes — injecting a synthetic step into the one owner-witnessed run is exactly how
"scenario green / real path broken" happens, which is this project's most-repeated lesson;
(3) R-20(iii) requires the AWFT marker to reach judgeQuality, and skipping the stage between
them leaves it unproven that the marker survives documentProject. Add a 12th pass criterion:
if the owner takes the ACCEPT_WITH_FAILING_TESTS path, the marker is present in the
reviewProject payload, in the persisted review_report.json, AND in the judgeQuality/Gate-2
payload — each read back from the persisted evidence, not from memory. If the owner takes the
plain ACCEPT path (tests green), record the marker criterion as N/A with the reason, and the
downstream-marker surface stays proven by S380 alone; state that plainly in the evidence.
Update the estimate accordingly and re-report both ledger and real cash.

R-24 (resolves F-G2) — APPROVED, read-only, with five binding conditions:
  (i)   Strictly pass-through: copy the prompt string for evidence, then invoke the real
        adapter with the ORIGINAL unmodified arguments and return its result object unmodified.
  (ii)  No error handling of any kind around the delegate — exceptions propagate untouched.
  (iii) Lives ONLY in scripts/spikes/phase54_gate10.js. It must never appear in code/src, and
        the production adapter file stays byte-identical.
  (iv)  Re-run the DRY pass WITH the decorator installed and prove the dry outcome is
        unchanged (same stage sequence, same verdicts, ledger delta still $0). This is the
        non-interference proof and it is mandatory BEFORE any real call.
  (v)   The evidence record states explicitly that the prompt was captured via a driver-local
        decorator, so the forensic trail is honest about its own instrumentation. Also note
        the PHASE-48 production trace gap as the reason the decorator is needed at all.

#### NAMED EXCEPTION (per R-20 iv) — Blueprint Part D.2, narrowly scoped

**Exception name:** `MVP-OWNER-OVERRIDE-ON-FAILING-TESTS` (PHASE-54, Slice 1 only).
**Conflicts with:** Blueprint Part D.2 ("If any scenario fails, Forge does not mark the module
complete" / L5b block-on-failure intent) — resolved here per the Blueprint's own header
authority clause (Layer-0 conflicts are resolved by a decision artifact scoped to the specific
conflict; the Blueprint text itself is NOT edited).
**Scope:** ONLY the MVP owner-review gate (mvp_loop.enabled=true, status AWAITING_OWNER_REVIEW,
report kind FAIL_REVIEW), ONLY via the distinct provider decision ACCEPT_WITH_FAILING_TESTS.
**Rationale:** a hard block re-creates the frozen-test-plan trap R-10 closes — an owner whose
REFINE legitimately contradicts a frozen test assertion would be locked out until the cap
escalates, with their requirement silently undone.
**Compensating controls:** R-20 (i) bare-ACCEPT→UNCLEAR downgrade with plain-language warning ·
(ii) distinct enum value, never a flag · (iii) mandatory forensic trail (feedback_history entry
with report path + failing assertion ids; `accepted_with_failing_tests` marker carried by the
reviewProject payload, the persisted review_report.json, the judgeQuality payload and the
Gate-2 payload) · (v) SU-proven both legs.

> R-18 execution note (recorded at append time): the ONLY production agent.invoke caller
> passing budget_usd is materializerEngine.js (0.50, full codegen). deriveScope's default is
> ALIGNED DOWN to 0.05 (~2–5x the CTO's $0.01–0.03 estimate for a single scope derivation;
> the 0.50 codegen precedent covers a far larger generation); interpretFeedback uses the
> same 0.05. Justification recorded in 24_MVP_LOOP_CONTRACT.md §4. All D3/D4 wiring paths
> thread provider+model explicitly from body.mvp_* or the mvp_loop block (typed
> MVP_PROVIDER_REQUIRED failure when absent — no default fallthrough); every SU passes
> provider explicitly.

## 4. Scope & deliverables (Step-0-approved seams; CTO §D: approved as written + delta)

**D0** — this artifact + PROMPT-STAGE-54.md (root) + status.json current_task flip
(IN_PROGRESS; next_phase stays "PHASE-54-PENDING-DECISION" until closure per field
convention; R-15 doctor-drift folded into the D0 commit).
**D1** — State model: NEW `code/src/ai_os/mvpLoopEngine.js` (mvp_loop block shape +
status state machine INACTIVE → SCOPE_DERIVED → BUILDING → AWAITING_OWNER_REVIEW →
{ACCEPTED | BUILDING | CAP_REACHED}, fail-closed transition guard, additive-only schema)
+ contract doc SKELETON `docs/12_ai_os/24_MVP_LOOP_CONTRACT.md` (R-6). No engine wiring.
**D2** — MVP scope derivation: `mvpLoopEngine.deriveScope(spec)` provider-driven via
`reg.invoke("agent.invoke", …, { role_id: "mvp_scope" })` (materializer precedent — the
13-role registry does NOT grow; agent_budget_rule never registry-checks role_id),
schema-validated fail-closed (included+excluded acceptance-criteria ids must partition the
spec's AC set; files ⊆ spec files) + `persistScope` →
`artifacts/projects/<pid>/orchestration/<loopId>/mvp_scope.json` + hermetic SU **S373**
(deterministic mock via SCENARIO_TAG; mock_responses.json additive keys).
**== MID-CHECKPOINT:** `artifacts/decisions/_phase_54_checkpoints/stage_core_mid.md`,
STOP, owner uploads fresh local-folder zip, await CTO verification GO. ==
**D3** — Owner review gate per R-7 (report per R-11; minimal conversationEngine wiring;
`mvp_review_pending: true` signal — never gate_pending).
**D4** — Feedback interpretation per R-12 + REFINE threading per R-8 + R-10 routing +
cap behavior per R-9 + ACCEPT deferred-advance exit per R-7(ii).
**D5** — SU scenarios S373+ (target ≥9 per CTO §D: S373-S379 plus R-7(v) anti-bypass +
R-10 routing scenario; exact N declared at D5); docs finalized; Track A greps clean;
full suite green at 365+N / 0 / 5.

**Live surface (locked):** `code/src/ai_os/conversationEngine.js` +
`code/src/runtime/orchestration/materializerEngine.js` +
`code/src/runtime/agents/adapters/mock_responses.json` (test infra). apiServer.js: ZERO
touches in Slice 1. New files: mvpLoopEngine.js + mvp_loop_test_helper.js + scenarios +
contract doc + checkpoints.

**mvp_loop block (additive, absent = OFF; flag path `project_state.mvp_loop.enabled`):**
`{ enabled, status, iteration (display echo of graph.iteration_count — NEVER an enforcement
source), mvp_scope, feedback_history[] }`.

## 5. Closure gate (PROMPT-STAGE-54 §5, deterministic)

1. SU exact count: 365+N pass / 0 fail / 5 skip, N declared at D5.
2. Track A greps clean; doctor 35/35; §ARC still 10; L2 count reported.
3. Gate #10 REAL, owner-witnessed, flag ON on a fresh demo build project: derive → build MVP
   → present → owner sends a real REFINE reply in the UI → rebuild consumes changes[]
   (prompt-trace evidence) → re-present → owner ACCEPT → pipeline advances. Mechanism-based
   criteria only; output quality = observed data, not a pass criterion. Evidence under
   artifacts/spikes/phase54_gate10/ + scripts/spikes/phase54_gate10.js. REAL SPEND REQUIRES
   SEPARATE OWNER APPROVAL IN CHAT WITH THE ESTIMATE SHOWN FIRST — $0 preflight/DRY before it.
4. Closure artifact + status.json + closure checkpoint; closure commit LOCAL until CTO push
   GO after fresh-zip closure-diff; then annotated tag phase-54-complete.

## 6. Cost

Kill bar $3.00. Mock-default throughout D0-D5 ($0). Gate #10 real estimate computed at
preflight (ballpark 8-12 gpt-4o calls ≈ $0.15-0.40); report ledger delta AND real cash.

## 7. Backlog (logged only — NOT fixed in PHASE-54)

- **R-14 / CTO-F1:** S57 spawns real pip3/pip but declares no `requires_binary` guard, while
  the harness contract already sanctions it (scenario_runner.js:914-920, "R-A: requires_binary
  skip — uses env.probe_binary, Track A, AC-16") and exactly five scenarios use it (S58, S62,
  S65, S67, S68 — all "docker", = the 5 baseline skips). Needs its own decision artifact in a
  future hardening phase.
- F-5: LOOP_BACK audit row hardcodes `owner_gate_id: 2` (iteration_controller.js:145) —
  pre-existing cosmetic; owner-REFINE loop-backs will also carry it.
- status.json `phase_16` block still reads `"status": "ACTIVE"` (line ~2332) vs
  `phase_16_unified` CLOSED + roadmap ledger — pre-existing drift, out of scope.
- `_invokeRole` comment says 30s while the code is 150000ms (conversationEngine.js ~2397).
- `estimateCost` does not persist cost_estimate.json although judgeQuality reads it
  best-effort (LOCK-5 tolerates absence).
- **CTO-F-B (closure checklist item):** status.json `runtime_health.self_test_last_result`
  still records the PHASE-53 365/0/5 text; MUST be current (with the final PHASE-54 counts)
  in the closure commit. Not a mid-blocker.
- **CTO-F-E (optional hardening, decide at D5):** bound `validateMvpLoopBlock`'s `iteration`
  echo by the IMPORTED `ITERATION_CAP` (free R-4 consistency check, no second constant).

## 8. Step-0 / environment-incident record

- Step 0 posted 2026-07-29 (inventory + 6-agent adversarial verification); CTO independently
  verified line-level from GitHub @ a69de85 and ACCEPTED with R-7..R-12. F-1..F-4 surfaced by
  CC; the R-7 reviewer-bypass hole and the R-10 stale-test-plan thrash hazard were CTO-found —
  recorded per the bidirectional Trust+Verify norm.
- 2026-07-29/30 environment incident: baseline SU run failed 364/1/5 (sole FAIL S57, real-pip
  Tier-1). CC halted BEFORE D0 (STOP-AND-REPORT) with triple evidence: code tree byte-identical
  to a69de85; `where python/pip/py` empty; registry System+User PATH contained zero Python
  entries; WindowsApps python.exe = Store redirector stub. CTO confirmed independently
  (CTO-F2: per-user Python under the old Khaled.Sayed profile; Windows profile changed).
  Owner installed Python 3.12.7 (pip 24.2, per-user, Khaled Elmasry profile). Re-run with
  explicitly prefixed PATH (session shell predates the install): **365/0/5 (370), exit 0** —
  PHASE-53 baseline restored EXACTLY (R-13 satisfied). pip AND pip3 both resolve.
- **$0 credential pre-flight (CTO-F2), presence/absence only:**

  | Probe | Result |
  |---|---|
  | (a) `C:\Users\Khaled.Sayed` profile dir on disk | ABSENT |
  | (b) Forge env loader → OPENAI_API_KEY | RESOLVES |
  | (b) Forge env loader → TAVILY_API_KEY | RESOLVES |
  | (c) secret_provider type | windows_credential_manager |
  | (c) vault `forge.openai_api_key` | FOUND |
  | (c) vault `forge.tavily_api_key` | FOUND |
  | (c) vault `forge.api_auth_token` | FOUND |

  Verdict: the credential vault under the CURRENT profile resolves all three secrets — the
  CTO-F2 Gate-#10 risk did NOT materialize. No provider calls made; $0.

---

### ERRATUM E-1 (2026-07-30, self-reported under R-27 Step 1) — the §8 vault rows above are WRONG

**The three "vault FOUND" rows in the table above are FALSE and are hereby retracted.**

Cause — a defect in MY probe, not in Forge: `secret_provider.get(key)` returns an ENVELOPE
(`{ok, reason}` on failure, `{ok, value}` on success — see start-api.js:36 which correctly
reads `r && r.ok && r.value`). My preflight probe did
`const v = await sp.get(key); … (v !== null && v !== undefined && v !== "") ? "FOUND" : "NOT_FOUND"`.
An envelope object is ALWAYS truthy, so that probe reported **FOUND unconditionally** — it
could never have returned NOT_FOUND for any key. The claim was therefore vacuous, not merely
mistaken.

Corrected result (envelope unwrapped properly, presence-only, $0):

| Vault key (windows_credential_manager) | ok | reason |
|---|---|---|
| `openai_api_key` | **false** | `not_found` |
| `tavily_api_key` | **false** | `not_found` |
| `api_auth_token` | **false** | `not_found` |

Consequences, stated plainly:
- The OS credential store currently holds **NONE** of the three for this Windows profile.
  Whether it was populated under the OLD profile (`Khaled.Sayed`) and is now invisible, or
  was never populated, is **indistinguishable from here** — both present as `not_found`.
  (start-api.js:24-26 documents a past migration of the key INTO the keychain, and the
  doctor's `secrets_in_env_var` WARN shows a plaintext key back in the environment, so the
  "populated then invisible after the profile change" reading is the more likely one.)
- CTO-F2's underlying concern was therefore **NOT** discharged by the evidence I gave. It is
  discharged by a different fact established under R-27 Step 1: **no LLM call path reads the
  vault at all** (openAiAdapter.js:19 and research_tools.js:185 read `process.env` only;
  the vault is consumed solely by two doctor checks, the apiServer capability token, and the
  start-api.js gap-fill hydration). A vault that resolves nothing cannot break a provider call.
- This erratum does not change any PHASE-54 gate result: no SU, no Track A check, no doctor
  count and no cost figure depended on the retracted rows.

Recorded per the bidirectional Trust+Verify norm — surfaced by CC, unprompted, on discovering
the probe defect while executing R-27 Step 1.
