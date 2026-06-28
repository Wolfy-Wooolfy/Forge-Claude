# PHASE-44 (A-5) — STEP B REAL VALIDATION CHECKPOINT

> Real-provider validation of the build loopback self-correction (gate-B).
> Authority: `DECISION-2026-06-28-phase-44-build-loopback-self-correction.md` (ADOPTED) §7.B.
> Date: 2026-06-28. Author: Claude Code. Owner spend-approval: Khaled, 2026-06-28.
> Status: **STEP B COMPLETE — gate-B MET. STOPPED.** Awaiting CTO forensic verification → explicit "closure GO".
> Real spend this run: **$0.01627** (ONE gpt-4o materializer call; soft-stop $1.50 / hard-kill $3.00 — far under).

---

## 0. What gate-B proves (and does not)
Gate-B confirms the loopback is **no longer blind with a REAL provider**: a real gpt-4o rebuild's codegen prompt **carries the real failing assertions**, and attempt-2 is a **materially different, corrected build** whose previously-failing scenario **improves to PASS**. Causal *sufficiency* (the flip happens BECAUSE of the feedback, not chance) was already proven deterministically by S337 in STEP A; gate-B does NOT re-claim causal isolation — it confirms the **real-provider path carries + corrects**.

## 1. Driver + setup (test-infra, $0 except the one real call)
- Driver: `scripts/spikes/phase44_loopback_real.js` (scripts/ only — OUT of the Track A live surface; NO edit to apiServer.js / ai_os/** / runtime/**). Drives the REAL engine `buildProject` → `runTests`. Loads `.env` (OPENAI_API_KEY). Two modes: `dry` ($0 plumbing) and `real` (the one gpt-4o call).
- **Forced-loopback seed** (project `phase44_loopback_real`, loop `phase44b-loop`): `orchestration.start_loop` → `advance_state(BUILDER)` → `loop_state.loadLoop/saveLoop` with `iteration_count = 1`; seeded `spec.json` + `architect_design.json` (small in-memory Notes API; AC-3 = "GET /notes/:id returns 200 for an existing id and 404 for a missing id"); seeded a **DEFECTIVE attempt-1 build** on disk (runnable Express API MISSING `GET /notes/:id`); seeded `forge_tests/last_report.json` = overall FAIL with `T-3 get_by_id` FAIL carrying `{type:"http_status_equals", pass:false, reason:"expected 200 but got 404"}`.
- **One-real-call routing**: planner → `planstub` (mock plan; keeps "Files to generate:" = the Notes API files); materializer → `openai_traced` (a thin wrapper that captures the exact prompt then delegates to the REAL `openai` adapter). The ONLY real call is the materializer codegen.

## 2. §B.1 mock dry-run (PHASE44B_MODE=dry, $0) — plumbing proven
`seeded_iteration_count=1` → `buildProject` advanced to RUN_TESTS → captured codegen prompt has `has_repair_marker=true`, `has_assertion_type=true` ("http_status_equals"), `has_assertion_reason=true` ("expected 200 but got 404") → `plumbing_ok=true` → `runTests` PASS → REVIEWER_CODE_AND_SECURITY. Confirms A-5 distils `repair_feedback` from the seeded report and threads it into `builder.materialize`. (`artifacts/spikes/phase44_loopback_real/summary_dry.json`.)

## 3. §B.2 the ONE real gpt-4o run — gate-B evidence

### 3.1 Trace — the REAL codegen prompt carried the real failing assertions
Captured verbatim at the adapter seam (`artifacts/spikes/phase44_loopback_real/real_codegen_prompt.txt`, 3290 chars). Tail:
```
PREVIOUS BUILD ATTEMPT FAILED THESE CHECKS — fix exactly these without regressing the checks that already passed:
- [FAIL] T-3 — get_by_id_existing_returns_200
    • http_status_equals: expected 200 but got 404
RESPOND WITH VALID JSON ONLY.
```
> Note: the agent-adapter path does NOT write `artifacts/llm/requests/<task_id>.json` (that is the legacy `executeTask` provider path). The prompt was captured at the `openai_traced` wrapper — the exact bytes sent to gpt-4o — which is a functionally equivalent trace.

### 3.2 Output — attempt-2 is materially different + corrected (GET /notes/:id now exists)
- attempt-1 (seeded DEFECTIVE) `src/routes/notes.js`: only `router.get('/notes', …)` (list) — **no get-by-id**.
- attempt-2 (REAL gpt-4o) `src/routes/notes.js`: **`router.get('/:id', (req, res) => { … res.status(404).send('Note not found') … })`** (mounted at root → served path `/notes/:id`, A-10 coherence; 404-on-missing present).
- `summary_real.json`: `attempt1_has_get_by_id=false`, `attempt2_has_get_by_id=true`, `attempt2_get_by_id_route_lines=["src/routes/notes.js: router.get('/:id', (req, res) => {"]`.
- Side-by-side files: `attempt1_defective/` vs `attempt2_corrected/` under the evidence dir.

### 3.3 Report — the previously-failing scenario improves FAIL → PASS
- attempt-1 (seeded): `overall_status=FAIL`, `T-3 get_by_id` FAIL ("expected 200 but got 404") — `attempt1_last_report.json`.
- attempt-2 (REAL L5b harness: `npm install express` + server spawn + create-first POST + `GET /notes/{{created.id}}`): `overall_status=PASS`, `T-3 PASS` → `runTests` advanced to REVIEWER_CODE_AND_SECURITY — `attempt2_last_report.json`.
- **FAIL → PASS via the real loopback.**

### 3.4 Cost
- Real materializer call: `provider=openai_traced model=gpt-4o-2024-08-06 tokens_in=789 tokens_out=822 cost_usd_actual=0.01627 outcome=success` (`artifacts/agent/cost_ledger.jsonl`).
- Planner (`planstub`) and dry-run (`matmock`) = $0. **Cumulative real spend this run = $0.01627** (well under soft-stop $1.50). No second real call.

## 4. Track A / §ARC / SU
- STEP B touched ONLY `scripts/` (the driver) + per-project artifacts (`artifacts/projects/phase44_loopback_real/`) + the evidence bundle (`artifacts/spikes/phase44_loopback_real/`). NO live-surface code changed in STEP B. No new §ARC entry; §ARC stays 10.
- SU remains **330/0/5** from STEP A (the prompt's re-run condition — "touched anything beyond scripts/ + per-project artifacts" — was not triggered).
- Adapter injections (`planstub` / `matmock` / `openai_traced`) are in-process cache additions removed in `finally` (same pattern as STEP A's `conv_stub`); not files under `runtime/agents/adapters/`.

## 5. Notes / disclosures
- **STEP A was committed by the owner as an interim "U" commit** `138922a` (D1–D3 + the STEP-A forge-doctor `runtime_health` auto-refresh in status.json). The A-5 live changes are intact in HEAD (repair block + gate verified present). STEP B made NO commit.
- §B.0 path corrections vs the prompt: cost ledger is `artifacts/agent/cost_ledger.jsonl` (not `artifacts/ai/…`); the request trace is captured at the adapter wrapper (the agent-adapter path does not write `artifacts/llm/requests/`).
- The real project dir `artifacts/projects/phase44_loopback_real/` contains `node_modules` (from `npm install express`) — it is NOT gitignored; exclude it when zipping for verification. The forensic-relevant files are mirrored in `artifacts/spikes/phase44_loopback_real/`.

## 6. Gate status
- **Gate A (mock): MET** (STEP A — S335/S336/S337; SU 330/0/5; doctor 35/0; Track A clean; §ARC=10).
- **Gate B (real, one gated run): MET** — real prompt carried the failing assertions; attempt-2 materially corrected (GET /notes/:id now exists); the previously-failing scenario improved FAIL→PASS; cost $0.01627 within ceiling.
- **Gate C (bookkeeping/closure): PENDING** — closure note + status.json `next_phase` advance + LOCAL closure commit happen ONLY after CTO forensic verification + explicit "closure GO".

🛑 **STOPPED.** Phase NOT closed. status.json `next_phase` NOT advanced. NO commit / push / tag. Owner will zip the LOCAL folder (excluding node_modules) for independent CTO forensic verification.
