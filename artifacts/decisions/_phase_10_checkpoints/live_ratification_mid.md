# Live Ratification Mid-Checkpoint

**Date:** 2026-05-15
**Step:** §4 Mid-Checkpoint (Deliverables A + B + C written, BEFORE live run)
**Requires:** Owner "GO LIVE" before any live invocation

---

## 1. Track A Compliance Audit

Grep results across the three new files for prohibited patterns:

| Pattern | Deliverable A | Deliverable B | Deliverable C | Verdict |
|---|---|---|---|---|
| `fs.writeFileSync / readFileSync / appendFileSync / unlinkSync / rmSync` | 0 matches | 0 matches | `existsSync` + `readFileSync` in .env loader only | **CLEAN** — .env loader is read-only bootstrap; same §ARC pattern as forge-doctor.js |
| `new OpenAI()` | 0 matches | 0 matches | 0 matches | ✓ CLEAN |
| `child_process` | 0 matches | 0 matches | 0 matches | ✓ CLEAN |
| `fetch()` | 0 matches | 0 matches | 0 matches | ✓ CLEAN |

**Note on CLI .env read:** `forge-live-ratification.js` uses `fs.existsSync` + `fs.readFileSync` 
exclusively to load `.env` before the registry is initialized — identical pattern to `forge-doctor.js`. 
These are read-only operations and do NOT violate §11.4 (which prohibits write/unlink/rm). 
No §ARC exception required.

All file writes in Deliverable A route through `registry.invoke("fs.write_file", ...)`.  
All file writes in Deliverable B (abort artifact) route through `registry.invoke("fs.write_file", ...)`.  
All file writes in Deliverable C (closure artifact) route through `registry.invoke("fs.write_file", ...)`.

**Track A verdict: CLEAN.**

---

## 2. OPENAI_API_KEY

Present in `.env` — length: **164** (confirmed by forge-doctor `openai_api_key: set, length=164`).

CLI validates length >= 20 on startup; exits with code 2 if missing. ✓

---

## 3. _reference_todo_api Pre-Conditions

| Condition | Status |
|---|---|
| `vision.md` present | ✓ |
| `vision_locked: true` | ✓ (line 26 of vision.md) |
| `spec.md` present | ✓ |
| `server.js` present | ✓ |
| `routes/todos.js` present | ✓ |
| `forge_tests/scenarios/T1–T6` | ✓ all 6 present |

**Note on L3 vision gate:** `getDefaultRegistry()` uses `permitAll` authorization (no permission 
policy installed in standalone scripts). This is the same behavior as `live_smoke_runner.js`, 
which ran 11/11 PASS against `project_id: "live_smoke"` with no vision.md at all. 
The L3 `agent_budget_rule` vision check only fires when the API server installs the full 
permission policy on the registry. Our runner is a standalone script — no L3 gate fires. 
The $5 budget is enforced by our kill switch instead.

---

## 4. Cost Ledger Path Verification

Verification run (executed pre-checkpoint):

```
agent.read_ledger OK: entries=0 total_cost=$0
kill switch filter (project_id=_reference_todo_api): confirmed isolated from other projects
```

- `isLedgerWritable()`: **true**
- `agent.read_ledger` registered: **true**
- `orchestration.abort` registered: **true**
- `role.invoke` registered: **true**
- `fs.write_file` registered: **true**
- Registry total tools: **72**

**CLARIFICATION 2 confirmed:** Kill switch passes `project_id: "_reference_todo_api"` to 
`agent.read_ledger`. With 0 entries for this project currently, the cumulative cost starts 
at $0.00. Stale ledger entries from other projects (live_smoke, etc.) are excluded by the 
filter. ✓

---

## 5. Cost Projection

Based on gpt-4o-mini and gpt-4o pricing at ~2500 input tokens / ~400 output tokens per call:

| Role group | Calls | Model | Projected cost |
|---|---|---|---|
| architect + spec_writer + reviewer_a + cost_estimator + environment + test_designer + builder + reviewer_b + documentation | 9 | gpt-4o-mini | ~$0.0055 |
| security_auditor + quality_judge | 2 | gpt-4o | ~$0.0205 |
| **Total projected** | **11 role calls** | — | **~$0.026** |

Projection is well under $3.00 stop threshold and $4.00 kill-switch threshold. ✓

This projection assumes minimal system prompts. If actual prompts are longer (likely), real 
cost may be 2–3× higher. Upper estimate: ~$0.08. Still well under kill switch. ✓

---

## 6. Files Created in This Step

| File | Description |
|---|---|
| `code/src/testing/live/live_ratification_runner.js` | Deliverable A — live driver |
| `code/src/testing/live/_kill_switch.js` | Deliverable B — cost-based abort |
| `bin/forge-live-ratification.js` | Deliverable C — CLI entry point |
| `artifacts/decisions/_phase_10_checkpoints/live_ratification_mid.md` | This file |

No new npm packages. No scenario files (live driver is NOT registered in scenario runner). 
No modifications to existing files.

---

## 7. Open Questions / Risks Before GO LIVE

| # | Item | Risk | Mitigation |
|---|---|---|---|
| OQ-1 | Some role prompts may require richer context (e.g., builder needs existing code) | MEDIUM | Role OUTPUT_SCHEMA validation inside role.run() will catch INVALID_ROLE_OUTPUT; runner throws; CLI exits code 2 with clear error |
| OQ-2 | RUN_TESTS → REVIEWER_CODE_AND_SECURITY advances without real test run | LOW | Structurally identical to S152; 5 docker-dependent scenarios are already SKIPPED in suite |
| OQ-3 | Quality judge input context is minimal (no env/test/deployment data passed) | LOW | quality_judge requires only `{project_id, spec, design}` — optional fields pass through role schema validation |
| OQ-4 | Environment cost not attributed to any advance_state row (invoked before Gate 1) | INFO | Tracked in `per_role_cost.json`; closure artifact uses ledger for cost, not audit rows |

---

**AWAITING OWNER "GO LIVE" to proceed with the actual live run.**

DO NOT run `node bin/forge-live-ratification.js` until owner posts "GO LIVE".
