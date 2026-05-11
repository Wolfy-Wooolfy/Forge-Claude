# DECISION-20260511-0930-phase-7-F-2-build-verify-roles

| Field | Value |
|---|---|
| Date | 2026-05-11 |
| Timestamp | 20260511-0930 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-11 |
| Phase | PHASE-7-F-2 |
| Authority | `DECISION-20260510-vision-shift-multi-agent-conductor.md` (Layer-0) |
| Vision context | `architecture/VISION-PHASE-7-F.md` |
| Track | Track B |
| Depends on | PHASE-7-F-1 (CLOSED) |

---

## §2-A. Scope

- 3 new specialized role modules:
  - `builder_role.js` (delegates to claude_code/codex/aider adapter; tested via mock)
  - `security_auditor_role.js` (BLOCKING authority; Phase SPEC and CODE)
  - `test_designer_role.js` (generates scenarios for the built project, not for Forge)
- 1 role extended: `reviewer_role.js` — adds Phase B support; system_prompt_id updated to reviewer_v2
- 1 new infrastructure module: `_prompt_loader.js` (single source of truth for prompts)
- 4 new system prompts in `docs/10_runtime/18b_ROLE_PROMPTS.md`:
  - `builder_v1`
  - `security_auditor_v1`
  - `test_designer_v1`
  - `reviewer_v2` (Phase A + Phase B; deprecates reviewer_v1)
- `mock_adapter.js` extended: scenario-id key matching (new) alongside prompt-prefix (existing)
- `mock_responses.json` extended for S92–S103 (scenario-id keys) + re-keyed for S89/S90 (reviewer_v2)
- 12 new test scenarios: S92–S103
- 3 PHASE-7-F-1 roles migrated to use `_prompt_loader` (architect, spec_writer, reviewer)
- `roles_runtime.js` doctor check updated to expect 6 roles
- Documentation updates to `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md`

**Out of scope (explicit):**
- Quality & Delivery roles (Documentation, Cost Estimator, Environment, Quality Judge, Deployment) — PHASE-7-F-3
- Reverse Architect — PHASE-11
- Multi-agent orchestration loop — PHASE-10
- Real production builder invocation (tested via mock only)
- Owner approval gates — PHASE-10

---

## §2-B. Namespace

No new L2 tools in this sub-phase. The `role.invoke` tool from PHASE-7-F-1 is reused for all new roles.

**Why no new L2 tool:** Adding roles is a registry-level operation. The L2 surface stays stable at 55 tools.

---

## §2-C. Role Contracts (4 roles)

### 2-C-1. Builder Role

```
id:               "builder"
label:            "Builder"
description:      "Plans the implementation by describing files to create; delegates to executor adapters"
default_provider: "claude_code"
default_model:    "claude-opus-4-7"
system_prompt_id: "builder_v1"
authority_level:  "ADVISORY"

input_schema (required): project_id, spec, design
output_schema (required): files_written (array), summary, dependencies_added (array), notes (array)
```

Builder returns DESCRIPTIONS of files, not content. Actual writes are PHASE-10's job.

### 2-C-2. Security Auditor Role

```
id:               "security_auditor"
label:            "Security Auditor"
description:      "Reviews code/spec from adversarial perspective; identifies threats"
default_provider: "anthropic"
default_model:    "claude-opus-4-7"
system_prompt_id: "security_auditor_v1"
authority_level:  "BLOCKING"

input_schema (required): project_id, phase (SPEC|CODE), spec, design
  + code required when phase = "CODE"
output_schema (required): threat_level (enum), findings (array), summary
```

### 2-C-3. Test Designer Role

```
id:               "test_designer"
label:            "Test Designer"
description:      "Generates deterministic test scenarios that verify the built project spec"
default_provider: "anthropic"
default_model:    "claude-opus-4-7"
system_prompt_id: "test_designer_v1"
authority_level:  "ADVISORY"

input_schema (required): project_id, spec, design
output_schema (required): scenarios (array), coverage_summary (object)
```

Scenarios are for the BUILT project, not for Forge's own harness.

### 2-C-4. Reviewer Phase B Extension

`reviewer_role.js` extended with Phase B. `id` stays "reviewer". `system_prompt_id` updated to "reviewer_v2".

Phase B requires `code` field. Phase A unchanged. Phase B missing code → FAILED INVALID_INPUT.

---

## §2-D. Binding Decisions

**§2-D1.** Builder uses provider routing — NOT direct adapter import. `default_provider: "claude_code"` routes via agent.invoke. Mock provider overrides in tests.

**§2-D2.** Builder output is descriptive (PLAN), not destructive. Builder NEVER calls fs.*. PHASE-10 writes actual files.

**§2-D3.** Security Auditor has BLOCKING authority. Enforcement (halt on CRITICAL/BLOCKER) deferred to PHASE-10. This phase verifies structural output only.

**§2-D4.** Test Designer scenarios are for the BUILT PROJECT, not Forge's harness (S01–S103).

**§2-D5.** Reviewer extension preserves backward compatibility. reviewer_v1 stays in 18b doc with deprecation marker. S89/S90 continue to pass (with updated mock keys for reviewer_v2).

**§2-D6.** `_prompt_loader.js` introduced as single source of truth. Reads 18b_ROLE_PROMPTS.md at load time. Role modules use `loadPrompt(promptId)`. `fs.readFileSync` use is §ARC-1 (consistent with _role_registry.js precedent).

**§2-D7.** New mock key format: `mock|<model>|scenario:<scenario_id>` for S92+. Role modules append `\nSCENARIO_TAG: <scenario_id>` when `ctx.scenario_id` is provided. Existing S83–S91 keep prompt-prefix keys (updated for reviewer_v2).

**§2-D8.** Mock-first testing only. No real API invocations in any scenario.

**§2-D9.** Reviewer Phase B: `code` field missing when phase="B" → FAILED INVALID_INPUT. Phase A: `code` field ignored if present.

**§2-D10.** Per-role cost hints:
- Builder: $1.50–$4.00; Security Auditor: $0.30–$0.80; Test Designer: $0.20–$0.60; Reviewer: $0.30–$0.70

---

## §2-E. Files Created

```
code/src/runtime/agents/_prompt_loader.js
code/src/runtime/agents/roles/builder_role.js
code/src/runtime/agents/roles/security_auditor_role.js
code/src/runtime/agents/roles/test_designer_role.js
artifacts/decisions/DECISION-20260511-0930-phase-7-F-2-build-verify-roles.md  (this file)
code/src/testing/scenarios/S92_*  through  S103_*  (12 files)
```

## §2-F. Files Modified

```
code/src/runtime/agents/roles/architect_role.js     — use _prompt_loader
code/src/runtime/agents/roles/spec_writer_role.js   — use _prompt_loader
code/src/runtime/agents/roles/reviewer_role.js      — use _prompt_loader + Phase B
code/src/runtime/agents/adapters/mock_adapter.js    — scenario-id key matching
code/src/runtime/agents/adapters/mock_responses.json — S92-S103 entries + S89/S90 re-keyed
docs/10_runtime/18b_ROLE_PROMPTS.md                 — 4 new prompts + deprecate reviewer_v1
docs/10_runtime/18_AGENT_ROLES_CONTRACT.md          — additions
code/src/runtime/doctor/checks/roles_runtime.js     — 6 roles expected
code/src/testing/scenarios/S91_*                    — updated assertion (INVALID_INPUT)
verify/smoke/test_harness_meta.js                   — 91 → 103 scenarios
progress/status.json                                — PHASE-7-F-2-CLOSED, next PHASE-7-F-3
```

## §2-G. Acceptance Criteria

- AC-1: `_prompt_loader.js` reads 18b_ROLE_PROMPTS.md, extracts prompt by ID, throws on missing
- AC-2: All 6 roles registered (architect, spec_writer, reviewer, builder, security_auditor, test_designer)
- AC-3: All 6 roles use `_prompt_loader` (no inline SYSTEM_PROMPT const) — grep verifiable
- AC-4: Reviewer's `system_prompt_id` is `"reviewer_v2"`; `reviewer_v1` retained with deprecation marker
- AC-5: Builder role returns descriptive `files_written`; does NOT call `fs.*` tools — grep verifiable
- AC-6: Security Auditor `phase: "SPEC"` accepts without `code`; `phase: "CODE"` requires `code`
- AC-7: Test Designer output includes `coverage_summary` with AC mapping
- AC-8: Reviewer Phase B input requires `code`; Phase A unchanged
- AC-9: Mock adapter supports scenario-id keys (new) AND prompt-prefix keys (existing)
- AC-10: 12 new scenarios S92–S103 all PASS (mock provider)
- AC-11: Existing scenarios S83–S91 still PASS after reviewer_v2 migration
- AC-12: Doctor check `roles_runtime` reports 6 roles
- AC-13: Tool count UNCHANGED: 55
- AC-14: Doctor checks UNCHANGED: 20
- AC-15: Scenarios: 91 → 103
- AC-16: All 5 smoke suites exit 0
- AC-17: Track A discipline preserved — zero violations in PHASE-7-F-2 scope

---

## Architectural Deviations from §2 (explicit)

**§ARC-1 — _prompt_loader.js uses fs.readFileSync:**
Consistent with `_role_registry.js` (PHASE-7-F-1 §ARC-1 precedent). Reads docs at module load, cached in _cache. No repeated disk I/O after first load. Track A discipline: this is a READ operation at tool-load time, consistent with the tool runtime's own file reading.

**§ARC-2 — S91 assertion updated from UNSUPPORTED_PHASE to INVALID_INPUT:**
S91 previously tested "Phase B returns UNSUPPORTED_PHASE". After implementing Phase B, UNSUPPORTED_PHASE is no longer returned. S91's input (phase=B, no code) now returns INVALID_INPUT. S91 is updated to assert INVALID_INPUT. This is behavioral (Phase B is now supported; missing code triggers INVALID_INPUT, not UNSUPPORTED_PHASE). S103 tests the same scenario with fuller fixtures — minimal duplication, both kept to ensure coverage from different directions.

---

## STOP-AND-REPORT instances

None during planning. STOP-AND-REPORT triggers are active during implementation.

---

## Owner Approval

Approved by chat directive: "كمل" (continue) + submission of PROMPT-PHASE-7-F-2.md. Owner: KhElmasry. Date: 2026-05-11.
