# PHASE-48 — Mid Checkpoint (intake real-run gate)

Date: 2026-06-30 · Mode: dry/mock-proven ($0 real spend) · Awaiting owner spend-approval for W-3.

This checkpoint is written per PROMPT-STAGE-48 §3, AFTER W-2 (`scripts/spikes/phase48_intake_real_run.js`)
was proven on a $0 dry/mock pass. It contains: (a) the per-step capture shape, (b) the EXACT real-run
command, (c) the real-cost estimate for the single reverse_vision call. **No real gpt-4o call has been
made.** STOP held until the CTO relays explicit owner spend-approval.

---

## 0. CTO RULING compliance (RULING 1 + RULING 2 — explicit stub/real split)

The driver drives the REAL handler `intake_conversation_handler.processIntakeRequest` end-to-end. The
ONLY component stubbed is the intent classifier; `lock_vision` and `start_loop` run REAL, and the
pipeline-entry evidence is a REAL `loop_id` read back via `orchestration.get_status`.

| Component | Real run (W-3) | Dry pass (W-2, proven) | Why |
|---|---|---|---|
| intent classifier (the AFFIRM) | **STUBBED** (deterministic `{intent:"AFFIRM"}` via `opts.intent_classifier`) | STUBBED | RULING 1 — keeps real spend to exactly ONE gpt-4o call (the approval-turn classifier is the only other LLM seam in the chain) |
| `project.intake_zip` | **REAL** | REAL | RULING 1 |
| `project.analyze_source` | **REAL** | REAL | RULING 1 |
| `reverse_vision` | **REAL gpt-4o** | mock (scenario S167; $0 real) | the capability under test; the ONLY mock↔real difference between dry and real |
| `vision.lock_vision` | **REAL** (offline, $0) | REAL (offline, $0) | RULING 1 — runs for real even in the dry pass |
| `orchestration.start_loop` | **REAL** (offline, $0) | REAL (offline, $0) | RULING 1 — real `loop_id`; pipeline-entry evidence |

Per RULING 2: nothing else is stubbed. If the real run reveals that anything else must be stubbed to
work, that is a STOP-AND-REPORT (§4), not a silent addition.

The reverse_vision exemption from the vision-lock L3 gate is verified present in CODE (not just docs):
`code/src/runtime/permission/rules/agent_budget_rule.js:64` — `if (!isMock && projectId && roleId !== "reverse_vision")` skips the lock check for `role_id === "reverse_vision"`; the chain passes `role_id: "reverse_vision"` into `agent.invoke`. So the real reverse_vision (which runs BEFORE the vision is locked) is not denied. Mock e2e never exercised this (mock is exempt) — the real run is the first to traverse it.

---

## (a) Per-step capture shape (proven on the $0 dry pass)

Driver writes `artifacts/spikes/phase48_intake_real/result.<mode>.json` (real mode → `result.json`,
the §3/decision evidence path; dry mode → `result.mock.json`). Shape, with the values the dry pass produced:

```
{
  phase, mode, provider_reverse_vision, model_reverse_vision, scenario_id, fixture, project_id,
  soft_stop_usd: 0.50, hard_kill_usd: 3.00,
  stub_real_split: { stubbed:[...], real:[...] },        // RULING 2 itemization, machine-readable
  steps: {
    step1_3_intake_start : { ok, stage, reason, message_excerpt },
    step1_intake_zip     : { source_file_count, source_files[] },                 // effect of intake_zip
    step2_analyze_source : { status, detected_languages, detected_framework, file_count,
                             entry_points, manifest_keys, ast_sample_count, note }, // READ-ONLY re-run
    step3_reverse_vision : { provider, model_returned, parse_ok, missing_fields,
                             inferred_vision{...}, ledger_row{tokens_in,tokens_out,latency_ms,
                             cost_usd_actual,outcome}, new_rv_ledger_rows, raw_forensic_trace_note },
    step4_5_approval     : { ok, stage, reason, loop_id },
    step4_vision_lock    : { vision_locked, vision_locked_at, locked_by_role },    // vision.md post-lock
    step5_pipeline_entry : { loop_id, current_state, iteration_count, started_at } // get_status read-back
  },
  gates: { intake_started, reverse_vision_valid, single_reverse_vision_call, vision_locked, pipeline_entry },
  all_pass, reverse_vision_cost_usd, reverse_vision_cost_kind, duration_ms
}
```

**Dry-pass (mock) result — all 5 gates PASS, exit 0:**
- step1 intake_zip → `source_file_count: 9` (fixture_nextjs copied to `source/`).
- step2 analyze_source → `detected_languages:["javascript","typescript"]`, `detected_framework:"next"`,
  `file_count:9`, `entry_points:["app/page.tsx"]`, `manifest_keys:[next_config,package_json,readme_excerpt,tsconfig]`, `ast_sample_count:6`.
- step3 reverse_vision (mock S167) → `parse_ok:true`, `inferred_vision` = `nextjs_tasks_demo` / domain
  `web_application` / confidence `HIGH`, `new_rv_ledger_rows:1`. Ledger row `cost_usd_actual: 0.00174`.
- step4 vision_lock → **`vision_locked:"true"`, `locked_by_role:"intake_owner"`** (REAL lock).
- step5 pipeline_entry → **`loop_id:"8e1c89f1-61e9-4d5a-bc91-f11d2361dd98"` (real UUID), `current_state:"ARCHITECT_DESIGN"`** (REAL start_loop; intake mode skips OWNER_INTENT → ARCHITECT_DESIGN per INTAKE_CONTRACT §6).
- gates: `intake_started ✓ · reverse_vision_valid ✓ · single_reverse_vision_call ✓ · vision_locked ✓ · pipeline_entry ✓`.

Honest disclosure on cost in MOCK mode: the agent cost-ledger row records a NOTIONAL $0.00174 computed
by `agent_tools._estimateCostUsd` from the fabricated mock token counts (150 in / 180 out). That is
**not real money** — the mock branch makes zero network calls; real spend in the dry pass = **$0**. The
notional number is useful: it proves the cost-capture plumbing (snapshot → project-scoped ledger slice →
sum `cost_usd_actual`) works end-to-end, so the real run's USD will be read the same way.

**Cost-capture mechanism (proven):** reverse_vision routes through `agent.invoke` provider_id path,
which writes `cost_usd_actual` to the **agent ledger** `artifacts/agent/cost_ledger.jsonl`
(`agent_tools.js:142`), NOT the providerTrace `artifacts/ai/` ledger. The driver snapshots the
reverse_vision rows for this `project_id` before the run and slices the new rows after → the single
call's USD. (Confirmed reverse_vision's real path returns `metadata.tokens_in/out` from OpenAI usage
at `reverseVisionProvider.js:260-262`, so `_estimateCostUsd(...,"gpt-4o")` yields real USD.)

---

## (b) EXACT real-run command (W-3 — DO NOT run before approval)

Fixture: `artifacts/test_fixtures/intake/fixture_nextjs` (smallest by bytes, dedicated S166/S167 mock
backing). Real-run `project_id`: `phase48_intake_nextjs_real` (distinct from the mock scratch).

```bash
# Bash:
PHASE48_MODE=real node scripts/spikes/phase48_intake_real_run.js
```
```powershell
# PowerShell:
$env:PHASE48_MODE="real"; node scripts/spikes/phase48_intake_real_run.js
```

Behavior in real mode: loads `.env` via `code/src/startup/env_loader.loadDotEnv` (OPENAI_API_KEY, as used
by prior real gates); reverse_vision = openai/gpt-4o; intent classifier stubbed AFFIRM; soft-stop $0.50,
hard-kill $3 enforced after each step via the ledger-delta `costGuard`; evidence →
`artifacts/spikes/phase48_intake_real/result.json`; exits 0 only if all 5 gates pass AND cost ≤ soft-stop.

---

## (c) Real-cost estimate (single reverse_vision call)

Grounded offline ($0, no network) from the ACTUAL prompts:
- `reverse_vision_v2` system prompt = **4,296 chars**; real user prompt (fixture_nextjs SourceTreeAnalysis) = **1,397 chars**.
- ≈ **1,424 input tokens + ~450 output tokens**. gpt-4o rates $5/1M in, $15/1M out:
  - one call ≈ **$0.01387**
  - with one validation-retry (provider retries once on schema-miss) ≈ **$0.02774**
- Conservative ceiling = the role's declared `typical_cost_usd_max` = **$0.10**.

All paths are far under the **$0.50** soft-stop and the **$3** hard-kill. Expected actual ≈ **$0.014–0.028**.

---

## W-4 (demo-dir hygiene) — DONE (config-only, $0)

`.gitignore` now ignores `artifacts/projects/phase4*/` (the intake/build DRIVER scratch projects that
churn on run; covers phase43_*..phase48_*; `_reference_todo_api` kept). Forensic evidence under
`artifacts/spikes/**` stays tracked (verified: `git add -n` would stage `result.json`; `check-ignore -v`
finds no rule). After the dry run, `git status` shows ONLY the intended deliverables — the
`phase48_intake_nextjs_mock` project scratch no longer appears:
```
 M .gitignore
?? artifacts/spikes/phase48_intake_real/
?? scripts/spikes/phase48_intake_real_run.js
```

---

## STOP

Holding here per §3. **No real gpt-4o call until the CTO relays explicit owner spend-approval** (estimate
≈ $0.014–0.028, ceiling $0.10, soft-stop $0.50). On approval I run the §(b) command once, capture
evidence, and verify the closure gate. STOP-AND-REPORT (§4) stands: a live-chain defect, any live-code
edit, a new §ARC, a >$0.50 call, or unsupported-language territory halts and reports instead of working
around.
