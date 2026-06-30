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
