# PROMPT-STAGE-48 — Intake (#11) Real-Run Confirmation + Demo-Dir Hygiene
(CTO-authored session opener. Owner-approved scope 2026-06-30.)

## §0 — State inheritance (MANDATORY — before any other action)
Read, in full, before writing anything:
1. architecture/FORGE_V2_BLUEPRINT.md (L5b + Part B-2 conductor model + capability #11 intent)
2. architecture/FORGE_V2_PHASE_ROADMAP.md (PHASE-11 closure-gate intent: 4 fixtures, reverse-vision, graceful BLOCKED on unsupported language)
3. artifacts/decisions/DECISION-2026-06-30-phase-48-intake-real-run-confirmation.md (this phase)
4. progress/status.json (current_task + next_step — PHASE-47 closure record)
5. The two most recent checkpoints under artifacts/decisions/_phase_47_checkpoints/ (if present)

Then POST a Step 0 summary for CTO verification, covering:
- The exact intake chain as it exists on disk (file + line refs): intake_conversation_handler steps, the tool each step invokes, the route(s) that trigger it.
- Which real intake fixtures exist on disk and their sizes (this is also W-1 recon) + your pick of the smallest representative one as the real-run target, with why.
- Confirmation you understand: this is a CONFIRMATION phase — no live-code change is expected; the real run is GATED behind explicit owner spend-approval at the mid-checkpoint.

STOP after the Step 0 summary. Write NO implementation code, run NO real LLM call, until the CTO replies "Step 1 GO".

## §1 — Deliverables
- W-1 Fixture recon (folded into Step 0).
- W-2 scripts/spikes/phase48_intake_real_run.js — per-step forensic capture; proven on a dry/mock pass first ($0).
- W-3 ONE gated real gpt-4o reverse_vision run on the W-1 fixture; evidence -> artifacts/spikes/phase48_intake_real/result.json.
- W-4 .gitignore entry that stops the demo-dir scratch (artifacts/projects/phase4X + phase4X_* scratch vision.md) from being committed on a driver run.

## §2 — Track A rules (binding)
- Live surface = apiServer.js + ai_os/** + runtime/**. NO new fs.*Sync / child_process / fetch / new OpenAI on the live surface. All HTTP via reg.invoke("http.get/post"); all fs via tools.fs.* or an existing §ARC home.
- The spike driver under scripts/spikes/** is OUTSIDE Track A (drivers may use fs directly) — keep ALL non-reg.invoke fs in the driver, never in the live surface.
- §ARC frozen at 10. If anything tempts a new §ARC -> STOP, do not code, report to CTO.
- This phase expects ZERO live-code change. If you believe a live-code edit is required, that is a STOP-AND-REPORT event (§4).

## §3 — Mid-stage checkpoint (MANDATORY before W-3)
After W-2 is proven on a dry/mock pass, write artifacts/decisions/_phase_48_checkpoints/stage_intake_mid.md containing:
- The per-step capture shape your harness produces (proven on the dry pass).
- The chosen fixture + the EXACT real-run command.
- A real-cost estimate for the single reverse_vision call.
Then STOP and wait for the CTO to relay explicit owner spend-approval. Do NOT make the real gpt-4o call before that approval.

## §4 — STOP-AND-REPORT triggers
Stop immediately and report (do not work around) if:
- The real run reveals a defect in the live intake chain (reverse_vision output the lock step can't consume, analyze_source failing on a real tree, pipeline-entry not reached).
- Any live-code edit appears necessary.
- A new §ARC appears necessary.
- The real call would exceed the $0.50 soft-stop.
- Any fixture pushes toward unsupported-language territory (capture the graceful-BLOCKED behavior; report it).

## §5 — Closure gate (deterministic — all must hold)
- W-3 real evidence valid: real reverse_vision LOCKED + project entered the pipeline (state shown).
- Live surface code/src/** byte-identical to PHASE-47 (or any forced fix itemized + Track A grep-clean).
- SU suite 338/0/5 (343) via bin/forge-test.js; no regression.
- forge-doctor 35/0 FAIL.
- §ARC=10, L2=80, roles=13.
- W-4: git status clean after a driver run (scratch no longer committed).
- status.json value-only update (status_json_valid-safe) + decision CLOSURE block + checkpoint.
- Closure commit stays LOCAL; push + annotated tag phase-48-complete await CTO closure-diff + explicit GO.

## §6 — Cost budget
- W-1, W-2, W-4: $0 (no LLM).
- W-3: ONE real gpt-4o reverse_vision, estimate <= $0.50, soft-stop $0.50, kill-bar $3/phase. Real call ONLY after explicit owner spend-approval at the §3 mid-checkpoint.
