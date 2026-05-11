# DECISION-20260511-1000-phase-7-F-3-quality-delivery-roles

| Field | Value |
|---|---|
| Date | 2026-05-11 |
| Timestamp | 20260511-1000 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-11 |
| Phase | PHASE-7-F-3 |
| Authority | `DECISION-20260510-vision-shift-multi-agent-conductor.md` (Layer-0) |
| Vision context | `architecture/VISION-PHASE-7-F.md` |
| Track | Track B |
| Depends on | PHASE-7-F-2 (CLOSED) |

---

## §2-A. Scope

**Part 1 — 5 new specialized roles:**
- `documentation_role.js` — generates README, API docs, user guide
- `cost_estimator_role.js` — predicts cost before build phase
- `environment_role.js` — detects deps, guides install (NOT auto-install)
- `quality_judge_role.js` — synthesizes verdict from all prior agent outputs
- `deployment_role.js` — proposes deployment plan (does NOT execute)

**Part 2 — Activity Indicator System Foundation:**
- `_activity_emitter.js` — event emitter module
- `_activity_catalog.js` — verb catalog per role and per state
- Activity log: `artifacts/agent/activity.jsonl`
- Integration in all 11 roles to emit lifecycle events
- Integration in `role.invoke` L2 tool to emit INVOKING_ADAPTER/COMPLETED/FAILED
- 1 new L2 tool: `agent.read_activity` (READ_ONLY) — query activity log

**Part 3 — Live Smoke Tests:**
- 11 live invocations (one per role), real OpenAI API
- Live Test Runner: `code/src/testing/live_smoke_runner.js`
- Live Test Report: `artifacts/testing/live_smoke/PHASE-7-F-3.md`
- Cost cap enforcement: $7 maximum spend across the phase
- Each role: real input, real output, JSON validation, schema validation

**Part 4 — Documentation & Tests:**
- 5 new system prompts in `18b_ROLE_PROMPTS.md`
- 15 new mock-based scenarios: S104-S118
- Updates to `18_AGENT_ROLES_CONTRACT.md`
- New doc: `docs/10_runtime/19_ACTIVITY_INDICATORS.md`

**Out of scope:**
- Reverse Architect role — PHASE-11
- Multi-agent orchestration loop — PHASE-10
- Activity Indicators UI display — PHASE-13
- Auto-install of dependencies — never
- Real deployment execution — roles produce plans only

---

## §2-B. Namespace

- New L2 tool: `agent.read_activity` (READ_ONLY)
- Tool count: 55 → 56
- No namespace expansion

---

## §2-C. Role Contracts

See PROMPT-PHASE-7-F-3.md §2-C for full contracts. Summary:

| Role | Provider | Model | Authority | Cost Range |
|---|---|---|---|---|
| documentation | openai | gpt-4o-mini | ADVISORY | $0.30–$0.70 |
| cost_estimator | openai | gpt-4o-mini | ADVISORY | $0.03–$0.10 |
| environment | openai | gpt-4o-mini | BLOCKING | $0.05–$0.15 |
| quality_judge | openai | gpt-4o | BLOCKING | $0.20–$0.50 |
| deployment | openai | gpt-4o-mini | ADVISORY | $0.15–$0.30 |

---

## §2-D. Pre-decided Behaviors

- §2-D1: `agent.read_activity` L2 tool: READ_ONLY, queries activity.jsonl
- §2-D2: Activity event schema: ts, event, invocation_id, project_id, role, state, indicator, duration_ms, outcome
- §2-D3: Verb catalog: 11 roles × 5 states = 55 indicators (per §2-D3 exact text)
- §2-D4: Emit points: INVOKING_ADAPTER from role.invoke; PARSING_OUTPUT, VALIDATING_SCHEMA from role.run(); COMPLETED/FAILED from role.invoke
- §2-D5: Activity log is best-effort — emitter failures never block role execution
- §2-D6: Live tests hard cost cap: $7; soft warn at $5
- §2-D7: 11 live invocations, one per role, chained outputs
- §2-D8: Full capture per role: input, output, cost, latency, validation
- §2-D9: All live tests use openai provider (owner has verified working key, $11.83 balance)
- §2-D10: Live tests are PHASE-7-F-3 closure prerequisites; any failure → STOP-AND-REPORT

---

## §2-E. Files to Create

```
code/src/runtime/agents/_activity_catalog.js
code/src/runtime/agents/_activity_emitter.js
code/src/runtime/tools/activity_tools.js

code/src/runtime/agents/roles/documentation_role.js
code/src/runtime/agents/roles/cost_estimator_role.js
code/src/runtime/agents/roles/environment_role.js
code/src/runtime/agents/roles/quality_judge_role.js
code/src/runtime/agents/roles/deployment_role.js

code/src/testing/live_smoke_runner.js
bin/forge-live-smoke.js

docs/10_runtime/19_ACTIVITY_INDICATORS.md
artifacts/decisions/DECISION-20260511-1000-phase-7-F-3-quality-delivery-roles.md
```

---

## §2-F. Files to Modify

```
code/src/runtime/agents/roles/architect_role.js       ← activity emitter + scenarioTag
code/src/runtime/agents/roles/spec_writer_role.js     ← activity emitter + scenarioTag
code/src/runtime/agents/roles/reviewer_role.js        ← activity emitter
code/src/runtime/agents/roles/builder_role.js         ← activity emitter
code/src/runtime/agents/roles/security_auditor_role.js ← activity emitter
code/src/runtime/agents/roles/test_designer_role.js   ← activity emitter

code/src/runtime/tools/role_tools.js                  ← emit before/after role.run
code/src/runtime/agents/adapters/mock_responses.json  ← add S104-S118
code/src/runtime/doctor/checks/roles_runtime.js       ← 6 → 11 required roles

docs/10_runtime/18b_ROLE_PROMPTS.md                   ← 5 new prompts
docs/10_runtime/18_AGENT_ROLES_CONTRACT.md            ← 5 new roles + Activity section

code/src/testing/scenarios/                           ← S104-S118 (15 new)

verify/smoke/test_tool_runtime.js                     ← 55 → 56
verify/smoke/test_harness_meta.js                     ← 103 → 118

progress/status.json                                  ← PHASE-7-F-3-CLOSED
```

---

## §2-G. Acceptance Criteria

AC-1 through AC-19 per PROMPT §2-G.

---

## Architectural Deviations from §2

**§ARC-1 (extended):** `_activity_emitter.js` uses `fs.appendFileSync` and `fs.readFileSync` directly for JSONL log writes/reads. Precedent established in `cost_ledger.js` (same justification: calling L2 tools from within infrastructure would cause re-entrancy). Acceptable deviation.

**§ARC-2 (live test runner):** `live_smoke_runner.js` uses `fs.writeFileSync` for report writes and `fs.mkdirSync` for directory creation. This is a testing infrastructure file, not a role or L2 tool. Acceptable deviation (same as §ARC-1 precedent for test scripts).

**§ARC-3:** `architect_role.js` and `spec_writer_role.js` did not have scenarioTag injection before PHASE-7-F-3. Adding it during activity emitter retrofit (§3.4) is a coordinated improvement — it doesn't affect existing tests because scenarioTag is empty when ctx.scenario_id is absent.

---

## STOP-AND-REPORT instances during phase

None at time of decision writing. Will be updated if any arise during implementation.

---

## Live Test Cost Cap Policy

- Soft warn: $5.00 (log warning, continue)
- Hard cap: $7.00 (abort, STOP-AND-REPORT)
- Owner's OpenAI balance at phase start: $11.83
- Expected total cost: ~$5-6
