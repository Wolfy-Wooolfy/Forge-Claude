# DECISION-2026-06-30-phase-48-intake-real-run-confirmation

- Phase: PHASE-48
- Status: APPROVED (scope) — owner approval in chat 2026-06-30
- Author: CTO advisor
- Prior phase: PHASE-47 RELEASED (tag phase-47-complete -> 37917df)

## 1. Context
Capability #11 (Existing Project Intake & Reverse Vision), state established by CTO orientation of origin/main @ PHASE-47:
- Tools registered (auto-discover): project.intake_zip, project.analyze_source. Role present: reverse_vision.
- Live wiring PRESENT: ai_os/intake_conversation_handler.js chains intake_zip -> analyze_source -> role.invoke(reverse_vision) -> vision lock -> loop, all via reg.invoke (Track A clean). Routes: POST /api/intake/upload (zip persist) + structural attachment signal -> handler.
- Mock e2e SU coverage PRESENT: Next.js (S166/S167), Go CLI (S170/S171), reverse_vision (S160), intake_zip variants (S158/S185/S187/S189), sync flow (S174).
- UNCONFIRMED: the chain has never run with a REAL gpt-4o reverse_vision on a real uploaded project. Mock proves the wiring; it cannot prove the model produces a usable reverse-vision that locks and enters the pipeline.

Contrast — capability #9 (KB/Research): tools registered but NOT driven by any pipeline stage (only read-only kb.list_sources + kb.retrieve referenced inside research_role; zero ingest/search driver; documentProject + auditEngine carry zero citation integration). KB is a wire problem, not a prove problem, and a real run depends on an external web-search key (TAVILY_API_KEY) the project does not hold. KB is therefore deferred to its own phase.

## 2. Decision
PHASE-48 = Intake (#11) real-run confirmation + demo-dir churn hygiene.
KB (#9) deferred -> PHASE-49 (own decision artifact; resolve TAVILY vs offline-mode design first).
Rationale: Intake is the closer-to-done capability (wired + mock-covered); a single real-run confirmation closes #11 with high confidence and a contained, deterministic gate. Bundling KB would inflate the phase and risk stalling on a missing external key.

## 3. Scope (work items)
- W-1 Fixture recon (scripts-only, $0): inventory the real intake fixtures already on disk; select the smallest/cheapest representative real project as the real-run target. Report at the mid-checkpoint.
- W-2 Forensic instrumentation (scripts-only, $0): scripts/spikes/phase48_intake_real_run.js with per-step capture (intake_zip result, analyze_source result, reverse_vision raw output + parse, lock result, pipeline-entry state). Prove the harness on a dry/mock pass first (no real call).
- W-3 Gated REAL run (owner-approved spend): ONE real gpt-4o reverse_vision on the W-1 fixture: upload -> intake_zip -> analyze_source -> real reverse_vision -> vision lock -> confirm pipeline entry. Evidence -> artifacts/spikes/phase48_intake_real/result.json. Estimate <= $0.50; soft-stop $0.50; kill $3.
- W-4 demo-dir hygiene: .gitignore the scratch project dirs that drivers clobber/commit on run (artifacts/projects/phase4X + phase4X_* scratch vision.md). Config-only; Track A N/A.

## 4. Out of scope (do NOT expand without a new work item)
- KB/Research pipeline wiring (#9) -> PHASE-49.
- 4-fixture breadth completion (Django + Python-CLI mock scenarios) -> forward backlog.
- Anthropic provider switch (blocked on ANTHROPIC_API_KEY).
- Any reverse_vision/analyze_source code change beyond a defect surfaced by W-3 (which triggers STOP-AND-REPORT, not silent expansion).

## 5. Closure gate (deterministic — all must hold)
- W-3 real evidence valid: real gpt-4o reverse_vision produced a reverse-vision that LOCKED and the project entered the pipeline (state shown).
- Live surface code/src/** byte-identical to PHASE-47 (confirmation phase; no live-code change expected). If W-3 forced a fix: itemized + Track A grep-clean.
- SU suite invariant: 338 pass / 0 fail / 5 skip (343) [no regression; no new SU required].
- forge-doctor: 35 checks / 0 FAIL.
- §ARC frozen at 10; L2 = 80; roles = 13.
- W-4: git status clean after a driver run (scratch no longer committed).
- status.json updated value-only (must not break the status_json_valid doctor check — same field-handling as PHASE-47 closure) + this decision's CLOSURE block appended + checkpoint written.

## 6. Cost
Mock/instrumentation: $0. Real run: estimate <= $0.50 (one gpt-4o reverse_vision). Kill-bar $3/phase. Real spend requires explicit owner approval at the mid-checkpoint with the estimate shown.

## 7. §ARC / Track A
No new §ARC (frozen at 10). The intake handler is already reg.invoke-only. The spike driver lives under scripts/spikes/** (outside Track A by rule). .gitignore is config, not runtime code.

---

## 8. CLOSURE (2026-06-30) — owner-approved, CTO-verified

**Status: CLOSED (LOCAL).** GOAL MET — capability #11 (existing-project intake → reverse-vision →
vision lock → pipeline entry) confirmed end-to-end with ONE real gpt-4o call.

### W-1 — Fixture recon
`fixture_nextjs` selected (smallest by bytes: 5,517 B / 9 files; dedicated S166 reverse_vision + S167
e2e mock backing). Inventory in the §0 Step-0 summary + mid checkpoint.

### W-2 — Forensic driver (scripts-only, $0)
`scripts/spikes/phase48_intake_real_run.js` drives the REAL handler `processIntakeRequest` end-to-end
with per-step capture (intake_zip effect, analyze_source READ-ONLY re-run, reverse_vision InferredVision
+ ledger row, vision.md post-lock frontmatter, get_status pipeline-entry). Proven on a $0 mock dry pass:
5/5 gates GREEN, exit 0. Evidence `artifacts/spikes/phase48_intake_real/result.mock.json`.

### W-3 — Gated REAL validation (owner-approved spend)
ONE real `gpt-4o-2024-08-06` reverse_vision. `PHASE48_MODE=real node scripts/spikes/phase48_intake_real_run.js`.

| Step | Result |
|---|---|
| intake_zip | 9 files → `source/` (REAL) |
| analyze_source | `[javascript,typescript]`, framework `next`, 9 files (REAL) |
| reverse_vision | **REAL gpt-4o** → InferredVision `nextjs_tasks_demo` / `web_application` / `HIGH`, `parse_ok`, schema-valid; **1** ledger row, tokens 1438/165, 6926ms |
| vision.lock_vision | **REAL** → `vision_locked:true`, `locked_by_role:intake_owner` |
| start_loop | **REAL** → loop_id `2b078f53-0c12-47a6-8900-bcc4f22f0981`, `current_state: ARCHITECT_DESIGN` |

5/5 gates PASS: `intake_started · reverse_vision_valid · single_reverse_vision_call · vision_locked · pipeline_entry`.
**Cost: $0.009665** (≤ $0.014 est, ≤ $0.50 soft-stop). RULING 1 honored — sole stub = intent classifier
(AFFIRM); intake_zip/analyze_source/reverse_vision/lock_vision/start_loop all real; pipeline-entry
evidence = a real `loop_id` from a real `start_loop` read back via `orchestration.get_status`.
Evidence `artifacts/spikes/phase48_intake_real/result.json`.

reverse_vision vision-lock exemption verified IN CODE (`agent_budget_rule.js:64` — `role_id === "reverse_vision"`
skips the lock check; reverse_vision runs before the vision exists). Anti-fabrication corroboration:
`artifacts/agent/cost_ledger.jsonl` row (real tokens 1438/165, $0.009665, 6926ms) +
`artifacts/llm/metadata/a20e97ab-…json` (model gpt-4o-2024-08-06, latency 6926ms, SUCCESS).

**Honest note (forward backlog, NOT a defect):** `artifacts/llm/responses/<inv>.json` = `null` for the
agent.invoke provider_id (function-calling) path — a PRE-EXISTING providerTrace fidelity gap (code/src
byte-identical to PHASE-47). The intake chain itself worked end-to-end; the real-call proof is the ledger
row + metadata trace + the output being DISTINCT from the mock (real `goals.secondary:[]` vs mock's 2).

### W-4 — Demo-dir hygiene (config-only, $0)
`.gitignore` now ignores `artifacts/projects/phase4*/` (driver scratch). Forensic evidence under
`artifacts/spikes/**` stays tracked (verified `git add -n` would stage `result.json`). After a driver
run, git status shows only intended deliverables — the project scratch no longer churns.

### Closure gate — ALL MET
- W-3 real evidence valid: real reverse_vision LOCKED + pipeline entered (ARCHITECT_DESIGN, real loop_id) ✓
- Live surface `code/src/**` BYTE-IDENTICAL to PHASE-47 (`git diff phase-47-complete -- code/src` empty) ✓
- SU suite 338 / 0 / 5 (343); no new SU; zero scenario add/remove (git diff scenarios empty) ✓
- forge-doctor 35 checks / 0 FAIL (7 benign WARN) ✓
- §ARC = 10 · L2 = 80 (`tools_registered`) · roles = 13 (`roles_runtime`) ✓
- W-4: git status clean of project scratch after a driver run ✓
- status.json value-only update (statusJsonValid REQUIRED_FIELDS preserved) + this CLOSURE block + final checkpoint ✓

### Out-of-scope confirmed NOT actioned
- KB/Research (#9) → PHASE-49 (resolve TAVILY vs offline-mode first).
- reverse_vision_v2 goals.secondary tuning — forward observation only (CTO directed: do NOT action here).

**Protocol:** LOCAL commit only. Push + annotated tag `phase-48-complete` await CTO closure-diff (fresh
zip) + explicit GO. `next_phase → PHASE-49-PENDING-DECISION`.
