# Forge v2.0 — Phase Roadmap (detailed)

> **Companion to:** `architecture/FORGE_V2_BLUEPRINT.md`
> **Status:** LIVE — Track A in progress (as of 2026-05-09)
> **Authored:** 2026-05-07
> **Updated:** 2026-05-10 — Multi-agent conductor vision per `DECISION-20260510-vision-shift-multi-agent-conductor.md`. PHASE-7-E (Agent Adapter Contract) and PHASE-7-F (11 Specialized Agent Roles) added. PHASE-8/9/10/11 scope adjusted for multi-agent model. PHASE-14 (Legacy Support) added as deferred. PHASE-7-D (Browser Automation) status: pending — original placeholder retained.
> **Previous Updated:** 2026-05-09 — Track A / Track B split per `DECISION-20260509-vision-shift-track-b.md`.

This document is the bridge between the Blueprint (the *what*) and the per-phase prompts that go to Claude Code (the *how*). It answers three questions for every phase:

1. **What does the phase produce** — exact files created or modified, exact decision artifacts written.
2. **What is the closure gate** — what must be true (deterministic, not "looks good") before the phase is marked complete.
3. **What does it depend on** — what must be done first.

---

## Section 1 — Old roadmap → New roadmap (mapping)

`files.zip` defined six phases. The new roadmap has thirteen entries (PHASE-0 through PHASE-12, plus PHASE-0.5 for the contradiction sweep). Mapping:

| Old phase (from `files.zip`) | New phase(s) | Reason for change |
|---|---|---|
| **Phase 0 — Foundation Repair** | **PHASE-0** (already complete) | No change. Status.json shows `PHASE-0-FOUNDATION-REPAIR` at 99%. We close it formally, not redo it. |
| *(none in old roadmap)* | **PHASE-0.5 — Contradiction sweep** | New gate. Required by Q5. Reads all 19 files in `docs/12_ai_os/` + runtime docs and resolves any conflict with the Blueprint before PHASE-1. |
| *(none in old roadmap)* | **PHASE-1 — Provider Contract v2** | New. Has to come first because every later phase depends on the contract. |
| *(none in old roadmap)* | **PHASE-2 — Tool Runtime Layer** | New. Highest-leverage change in the Blueprint. |
| *(none in old roadmap)* | **PHASE-3 — Permission / Safety Layer** | New. Depends on PHASE-2 (every Tool declares a `required_mode`). |
| *(none in old roadmap)* | **PHASE-4 — Doctor / Health** | New. Independent of PHASE-1–3 in spirit but uses Tool Runtime once it exists; sequenced after PHASE-3 to keep the boot order linear. |
| *(none in old roadmap)* | **PHASE-5 — Forge Self-Test Harness (L5a)** | New. Has to come before any other migration so we can prove the migration doesn't regress. |
| *(none in old roadmap)* | **PHASE-6 — apiServer.js migration (Stages 1+2)** | New. Mechanical lift of 91 endpoints onto Tool Runtime. Stage 3 (new endpoints) folded into PHASE-3/4 where each is added. |
| **Phase 1 — Vision Authority** | **PHASE-7 — Vision Authority System** | Same intent. Easier to implement now: VisionComplianceGate becomes one L3 deny-rule + one L2 tool, not a bespoke module. |
| **Phase 2 — Knowledge Base & Research** | **PHASE-8 (test plan part) + PHASE-9 (KB part)** | Old Phase 2 conflated two things: deterministic test plans for built projects, and web-research/KB. Splitting them: PHASE-8 builds the test-plan provider (because it's a small, focused capability that depends on the Blueprint's L5b harness); PHASE-9 builds the KB. |
| **Phase 3 — Frontend Refactor (React)** | **PHASE-10 — Frontend Refactor** | Same. Moved later because rewriting `web/index.html` while the backend is still being migrated is wasted churn. |
| **Phase 4 — Existing Project Intake** | **PHASE-11 — Existing Project Intake** | Same. Moved later because intake produces a vision retroactively, and that depends on Vision Authority being live (PHASE-7). |
| **Phase 5 — Personal Production Setup** | **PHASE-12 — Personal Production Setup** | Same. Always last. |

**Net:** No content from the old roadmap is dropped. Six phases became thirteen by inserting six runtime layers in front of Vision Authority and splitting the old Phase 2.

---

## Section 1.B — Multi-Agent Vision Shift (2026-05-10)

`DECISION-20260510-vision-shift-multi-agent-conductor.md` adds the multi-agent orchestration model. The mapping below shows what changed:

| Old phase concept | New phase(s) | Reason for change |
|---|---|---|
| *(none — implicit "single executor")* | **PHASE-7-E — Agent Adapter Contract** | New. Forge needs a uniform interface to invoke LLM agents (Anthropic, OpenAI, Claude Code CLI, Aider) before any specialized roles can be built. |
| *(none — implicit "single agent")* | **PHASE-7-F — Specialized Agent Roles** | New. The 11 roles (Architect, Spec Writer, Reviewer, Cost Estimator, Environment, Builder, Security, Test Designer, Documentation, Quality Judge, Deployment) defined in Section 3 of the vision shift decision. |
| **PHASE-8 — Built-Project Test Harness (L5b)** | **PHASE-8 — Built-Project Test Harness** (scope adjusted) | Same intent. Scope clarified: harness verifies output of the **Builder Agent**, not Forge-internal code. Test scenarios generated by **Test Designer Agent** (PHASE-7-F). |
| **PHASE-9 — Knowledge Base & Research** | **PHASE-9 — Knowledge Base + Agent Memory** (scope adjusted) | Same intent. Scope expanded: KB serves as long-term memory for the agent pool across projects. |
| **PHASE-10 — Iterative Build Loop** | **PHASE-10 — Multi-Agent Orchestration Loop** (scope formalized) | Same intent (closed loop). Scope formalized: defines the conversation graph between agents, debate-to-consensus protocol, iteration cap, owner escalation. |
| **PHASE-11 — Existing Project Intake** | **PHASE-11 — Existing Project Intake + Reverse Architect** (scope expanded) | Same intent. Scope expanded: adds **Reverse Architect Agent** + 4 flows (Improve / Add Feature / Bug Fix / Understand). |
| *(new)* | **PHASE-14 — Legacy Support** (deferred) | New deferred phase. Migration (e.g., Python 2→3), Refactoring (monolith→microservices), Modernization (jQuery+PHP→React+Node). Opens after PHASE-13 if real legacy demand surfaces. |

**Net:** 2 new phases (7-E, 7-F), 4 existing phases adjusted in scope, 1 new deferred phase (14). No phases removed. The 11 agent roles defined in `DECISION-20260510-vision-shift-multi-agent-conductor.md` Section 3 are implemented in PHASE-7-F.

---

**2026-05-09 Track A / Track B renaming (additive — no content removed):**

| Old number | New number | Change |
|---|---|---|
| PHASE-7 (Vision Authority) | **PHASE-7-A** | Re-labeled; content unchanged |
| PHASE-10 (Frontend Refactor) | **PHASE-13** | Re-labeled; content unchanged |
| *(new)* | **PHASE-7-B** | Code Execution Tool (`shell.run`) |
| *(new)* | **PHASE-7-C** | Environment Management |
| *(new)* | **PHASE-7-D** | Browser Automation |
| *(new)* | **PHASE-10** | Iterative Build Loop (MVP → review → refine) |

---

## Section 2 — The thirteen phases (full detail)

### **[Track A]** PHASE-0 — Foundation Repair (status: COMPLETE)

**Goal.** Close the Phase 0 fixes already executed (domain pivot, multi-select chips, project deletion, vision scaffolding).

**Deliverables.**
- A single closure decision artifact that supersedes the four `phase-0-fix-*` decisions and marks `PHASE-0` as `CLOSED` rather than `IN_PROGRESS`: `artifacts/decisions/DECISION-<ts>-phase-0-closure.md`.
- `progress/status.json.current_task` flips from `PHASE-0-FOUNDATION-REPAIR` to `PHASE-0.5-CONTRADICTION-SWEEP`.

**Closure gate.**
- All four fix decisions referenced and not contradicted.
- `progress/status.json` has `next_step: "Begin PHASE-0.5 contradiction sweep"`.
- The `name_goal_mismatch_asked` flag and `domain_history` schema are documented in `docs/12_ai_os/04_PROJECT_OBJECT_MODEL.md` (one-line addendum each).

**Estimated effort.** 0.5 day.

**Depends on.** Nothing. (This is the close-out.)

---

### **[Track A]** PHASE-0.5 — Pre-Blueprint Contradiction Sweep

**Goal.** Read every authoritative document that could conflict with the Blueprint and either confirm alignment or produce a delta list. Required by Q5.

**Files read (full text, not skimmed).**
- `docs/01_system/00–07_*` (all 8 files)
- `docs/03_pipeline/*` (all files including `MODULE_ORCHESTRATION_GOVERNANCE_v1.md`, `DECISION_GATE_CONTRACT_v1.md`, `EXECUTE_MODULE_CONTRACT_v1.md`)
- `docs/04_autonomy/*` (all files including `04_Autonomy_Policy_and_Human_Interrupt_Protocol.md`, `06_Cognitive_Layer_Contract.md`, `07_Cognitive_Engine_Interface_Contract.md`)
- `docs/11_ai_layer/*` (all 13 files)
- `docs/12_ai_os/*` (all 19 files)

**Deliverables.**
- `artifacts/audit/blueprint_contradiction_sweep.md` — table with one row per finding: `{ doc_path, section, conflicts_with_blueprint_section, severity: BLOCKER|WARN|INFO, proposed_resolution }`.
- If any BLOCKER findings exist: `artifacts/decisions/DECISION-<ts>-phase-0-5-resolutions.md` documenting the resolutions agreed with the owner.
- If no BLOCKER findings: a single closure note in the sweep file.

**Closure gate.**
- Every `docs/12_ai_os/` file has been opened and parsed (proven by listing each in the sweep file with a one-line summary).
- All BLOCKER findings have a written resolution.
- `progress/status.json.next_step` points to PHASE-1.

**Estimated effort.** 1.5–2 days.

**Depends on.** PHASE-0 closure.

---

### **[Track A]** PHASE-1 — Provider Contract v2 + Provider Registry

**Goal.** Every provider in `code/src/providers/` is a thin handler over a shared contract. Boot validates the contract.

**New files.**
```
code/src/providers/_contract/providerContract.js       — defineProvider(contract, handler)
code/src/providers/_contract/providerRegistry.js       — Map<id, contract> + boot validation
code/src/providers/_contract/providerTrace.js          — emits cost_ledger.jsonl row
code/src/providers/_contract/providerErrors.js         — typed error classes
code/src/providers/_contract/openAiAdapter.js          — shared OpenAI init + retry + JSON-fence
code/src/providers/_contract/SCHEMA.md                 — authoritative contract spec
```

**Modified files (mechanical lift, no behavior change).**
```
code/src/providers/conversationalResponseProvider.js
code/src/providers/ideationExpansionProvider.js
code/src/providers/intentClassificationProvider.js
code/src/providers/businessAnalysisProvider.js
code/src/providers/codexProvider.js
code/src/providers/documentationReviewProvider.js
code/src/providers/openAiDocumentationProvider.js
code/src/providers/openAiExecutionFilesProvider.js
code/src/providers/openAiOptionsProvider.js
code/src/providers/openAiRequirementDiscoveryProvider.js
code/src/providers/projectReviewProvider.js
code/src/providers/researchProvider.js
code/src/providers/providerRouter.js                   — now driven by registry
```

**Decision artifacts.**
- `DECISION-<ts>-phase-1-provider-contract.md` — establishes the contract and migration strategy.

**Documentation.**
- `docs/11_ai_layer/14_PROVIDER_CONTRACT_V2.md` — authoritative spec.
- `docs/11_ai_layer/02_AI_LAYER_ARCHITECTURE.md` — addendum referencing v2.

**Closure gate.**
- `node bin/forge-doctor.js` *(stub allowed in this phase)* reports `providers_registered: PASS, 13/13 valid`.
- A new test in `code/src/testing/scenarios/` named `provider_contract_boot_validation.json` proves: removing `output_tool` from any provider → server fails to start.
- Cost ledger has at least one row written from a smoke run.
- No provider keeps its own OpenAI init (`grep -rn "new OpenAI(" code/src/providers/` returns matches only inside `_contract/openAiAdapter.js`).

**Estimated effort.** 4–6 days.

**Depends on.** PHASE-0.5.

---

### **[Track A]** PHASE-2 — Tool Runtime Layer

**Goal.** Every side effect that today goes through `fs.*` directly is reachable through a registered Tool with `name`, `required_mode`, `input_schema`, `output_schema`, `preview`, `execute`. The Tool Runtime is *added* in this phase; existing call sites are migrated in PHASE-6.

**New files.**
```
code/src/runtime/tools/_registry.js            — Tool registry + boot validation
code/src/runtime/tools/_contract.js            — defineTool(spec, handler)
code/src/runtime/tools/fs_tools.js             — read_file, write_file, append_file,
                                                  delete_file, list_dir, exists, glob
code/src/runtime/tools/shell_tools.js          — run, run_in_workspace
code/src/runtime/tools/http_tools.js           — get, post (allow-list)
code/src/runtime/tools/project_tools.js        — create, activate, list, delete
code/src/runtime/tools/artifact_tools.js       — write_decision, write_audit, list
code/src/runtime/tools/state_tools.js          — read_state, patch_state (optimistic concurrency)
code/src/runtime/tools/pipeline_tools.js       — run_module, advance_stage, mark_blocked
code/src/runtime/tools/SCHEMA.md               — authoritative spec
code/src/runtime/audit/toolAuditLog.js         — append-only JSONL log per tool call
```

**No file in `code/src/workspace/apiServer.js` is touched in this phase.** The Tool Runtime is built and tested in isolation. Migration is PHASE-6.

**Decision artifacts.**
- `DECISION-<ts>-phase-2-tool-runtime.md`.

**Documentation.**
- `docs/10_runtime/11_TOOL_RUNTIME_CONTRACT.md` — new authoritative spec.

**Closure gate.**
- 31+ tools registered; boot validation runs and passes.
- Scenario `tool_registry_boot_validation` proves: registering two tools with the same name → boot fails.
- Scenario `fs_write_preview_returns_diff` proves: `tools.fs.write_file` with `preview: true` returns a diff and writes nothing.
- Tool audit log has rows from a smoke run, schema-validated.

**Estimated effort.** 6–8 days.

**Depends on.** PHASE-1 (so tools that need a provider use the contract).

---

### **[Track A]** PHASE-3 — Permission / Safety Layer

**Goal.** Every Tool execution passes through a permission policy. Active mode is set at boot. PROMPT mode is wired into the conversation engine.

**New files.**
```
code/src/runtime/permission/permissionMode.js          — enum + ordering
code/src/runtime/permission/permissionPolicy.js        — authorize(tool, input, ctx)
code/src/runtime/permission/permissionPrompter.js      — bridges to conversation
                                                          engine for PROMPT mode
code/src/runtime/permission/permissionRules.js         — deny/allow/ask rules
code/src/runtime/permission/permissionAuditLog.js
code/src/runtime/permission/SCHEMA.md
code/src/providers/permissionPromptProvider.js         — formats prompts as user questions
```

**Modified files.**
```
code/src/runtime/tools/_contract.js   — every execute() call goes through policy first
code/src/workspace/apiServer.js       — new endpoint POST /api/permission/respond
                                          (only this one endpoint in this phase)
```

**Decision artifacts.**
- `DECISION-<ts>-phase-3-permission-layer.md`.

**Documentation.**
- `docs/04_autonomy/08_PERMISSION_POLICY_CONTRACT.md` — new authoritative spec.

**Closure gate.**
- Scenario `tool_denied_in_read_only_mode`: server in `READ_ONLY`, calling `fs.write_file` returns `EnforcementResult.Denied` with `active_mode/required_mode/reason`.
- Scenario `tool_prompts_user_in_prompt_mode`: in `PROMPT` mode, a write triggers a `PermissionRequest` event; user `Allow` reply via API → write succeeds; user `Deny` reply → write fails.
- Scenario `tool_denied_outside_workspace`: `WORKSPACE_WRITE` mode with input path `/etc/foo` → denied even before mode comparison (deny rule).
- Scenario `prompt_mode_in_test_harness_auto_denies`: TEST mode hits PROMPT → deny (no human in the loop).

**Estimated effort.** 4–5 days.

**Depends on.** PHASE-2.

---

### **[Track A]** PHASE-4 — Doctor / Health Layer

**Goal.** A single endpoint and CLI report Forge's runtime state.

**New files.**
```
code/src/runtime/doctor/runDoctor.js                   — shared between CLI + endpoint
code/src/runtime/doctor/_registry.js                   — list of checks
code/src/runtime/doctor/checks/nodeVersion.js
code/src/runtime/doctor/checks/apiServerPort.js
code/src/runtime/doctor/checks/webServerPort.js
code/src/runtime/doctor/checks/openaiApiKey.js
code/src/runtime/doctor/checks/providersRegistered.js
code/src/runtime/doctor/checks/toolsRegistered.js
code/src/runtime/doctor/checks/permissionMode.js
code/src/runtime/doctor/checks/statusJsonValid.js
code/src/runtime/doctor/checks/activeProject.js
code/src/runtime/doctor/checks/missingDependencies.js
code/src/runtime/doctor/checks/envDotfile.js
code/src/runtime/doctor/checks/recentExecution.js
code/src/runtime/doctor/checks/diskSpace.js
code/src/runtime/doctor/checks/traceMatrixSize.js
code/src/runtime/doctor/SCHEMA.md
bin/forge-doctor.js                                    — CLI entry
```

**Modified files.**
```
code/src/workspace/apiServer.js   — new endpoint GET /api/system/doctor
code/src/orchestrator/status_writer.js
                                   — adds runtime_health block (Q4 — additive)
```

**Decision artifacts.**
- `DECISION-<ts>-phase-4-doctor.md`.

**Documentation.**
- `docs/10_runtime/12_DOCTOR_CONTRACT.md`.

**Closure gate.**
- `node bin/forge-doctor.js` exits 0 on a healthy boot, 1 on a planted failure (e.g. delete `OPENAI_API_KEY`).
- `GET /api/system/doctor` returns the same JSON the CLI prints.
- `progress/status.json` shows a `runtime_health` block populated, no other field altered.
- Web UI gets a "Health" indicator (one visible dot, three colors). *Minimal UI change in this phase — full UI rework is PHASE-10.*

**Estimated effort.** 3–4 days.

**Depends on.** PHASE-3.

---

### **[Track A]** PHASE-5 — Forge Self-Test Harness (L5a)

**Goal.** Mock OpenAI service + scenario runner + 12 baseline scenarios. CI-runnable.

**New files.**
```
code/src/testing/mock_openai_service.js                — local HTTP server,
                                                          OpenAI /v1/chat/completions surface
code/src/testing/scenario_runner.js                    — boot Forge with mock,
                                                          replay user_inputs,
                                                          capture tool calls + state diffs,
                                                          evaluate assertions
code/src/testing/playwright_driver.js                  — optional UI driver
code/src/testing/assertions/                           — one assertion type per file:
  tool_called.js
  tool_not_called.js
  active_state.js
  response_contains_question.js
  state_field_equals.js
  ui_link_clickable.js
  artifact_exists.js
  artifact_contains.js
code/src/testing/scenarios/SCHEMA.md
code/src/testing/scenarios/baseline/                   — 12 scenarios:
  01_chat_smoke.json
  02_domain_pivot_hr_to_crm.json
  03_intent_classification_modify.json
  04_provider_failure_fail_closed.json
  05_tool_denied_in_read_only.json
  06_doctor_endpoint_returns_pass.json
  07_pipeline_intake_to_audit.json
  08_decision_artifact_required.json
  09_keyword_matching_blocked_at_runtime.json
  10_state_concurrency_optimistic.json
  11_pending_confirmation_expires.json
  12_blueprint_contract_compliance.json
bin/forge-test.js                                      — CLI entry: runs all scenarios
```

**Modified files.** None outside `code/src/testing/`.

**Decision artifacts.**
- `DECISION-<ts>-phase-5-self-test-harness.md`.

**Documentation.**
- `docs/09_verify/19_FORGE_SELF_TEST_HARNESS.md` (new).

**Closure gate.**
- `bin/forge-test.js` runs all 12 scenarios. 12 PASS or scenario-specific SKIP.
- Each scenario produces `artifacts/testing/scenarios/<name>/run_<ts>/run.json`.
- `INSTRUCTIONS.md` is updated with the new "Closure Gate" rule (see Message 3): Claude Code may not declare any task complete without a green `forge-test` run.

**Estimated effort.** 7–10 days.

**Depends on.** PHASE-4.

---

### **[Track A]** PHASE-6 — apiServer.js migration (Stages 1 + 2)

**Goal.** Lift every direct `fs.*` call in `apiServer.js` and the engines into Tool Runtime calls (Stage 1), then extract handlers out of `apiServer.js` into `code/src/workspace/handlers/` (Stage 2).

**Files modified — Stage 1.**
```
code/src/workspace/apiServer.js                        — every fs.* call → tools.fs.*
code/src/ai_os/conversationEngine.js
code/src/ai_os/ideationEngine.js
code/src/ai_os/conversationMemoryManager.js
code/src/ai_os/activeProjectManager.js
code/src/ai_os/projectRuntime.js
code/src/ai_os/runtimeStateManager.js
code/src/orchestrator/runner.js
code/src/orchestrator/status_writer.js
code/src/forge/forge_state_writer.js
... (audit which engines write directly; ~12 files total)
```

**Files created — Stage 2.**
```
code/src/workspace/handlers/projects.js                — /api/projects/*
code/src/workspace/handlers/aiOsChat.js                — /api/ai-os/chat, /chat/stream
code/src/workspace/handlers/aiOsIdeation.js            — /api/ai-os/ideation/*
code/src/workspace/handlers/aiOsLifecycle.js           — /api/ai-os/{intake,options,decision,...}
code/src/workspace/handlers/system.js                  — /api/system/* (incl. doctor)
code/src/workspace/handlers/permission.js              — /api/permission/respond
code/src/workspace/handlers/testing.js                 — /api/testing/scenario/run
code/src/workspace/router.js                           — pure routing, no logic
```

After Stage 2, `apiServer.js` should be under 800 lines (today: 3596).

**Decision artifacts.**
- `DECISION-<ts>-phase-6-server-migration.md`.

**Closure gate.**
- All 12 baseline scenarios still pass.
- `grep -n "fs\.write\|fs\.unlink\|fs\.rm" code/src/workspace/apiServer.js` returns 0 matches.
- `wc -l code/src/workspace/apiServer.js` shows < 800.
- A new scenario `apiserver_handler_isolation.json` proves: deleting `handlers/projects.js` causes `/api/projects/list` to 503 (handler-scoped, doesn't crash the server).

**Estimated effort.** 5–7 days.

**Depends on.** PHASE-5 (we need scenarios to prove no regression).

---

### **[Track B]** PHASE-7-A — Vision Authority System

**Goal.** What old Phase 1 promised, but built on top of the four runtime layers. VisionComplianceGate is no longer a bespoke regex scanner; it is one L3 deny-rule (`writes to docs/** require vision_locked=true`) plus one L2 tool (`vision.amend_proposal`).

**New files.**
```
code/src/ai_os/schemas/visionSchema.js                 — schema validator
code/src/ai_os/visionEngine.js                         — lock, amend, version,
                                                          history operations
code/src/runtime/tools/vision_tools.js                 — propose_amendment,
                                                          approve_amendment,
                                                          lock_vision
code/src/runtime/permission/rules/vision_lock_rule.js  — deny rule:
                                                          writes to docs/**
                                                          require vision_locked
```

**Modified files.**
```
code/src/modules/visionComplianceGate.js               — activated; now consults
                                                          permission policy
code/src/modules/visionAlignmentValidator.js           — activated
code/src/ai_os/conversationEngine.js                   — calls vision engine
                                                          when state transitions
                                                          to OPTION_DECISION
code/src/orchestrator/pipeline_definition.js           — VISION_COMPLIANCE module
                                                          enabled (today is in pipeline
                                                          but a no-op)
```

**Decision artifacts.**
- `DECISION-<ts>-phase-7-vision-authority.md`.

**Documentation.**
- `docs/01_system/03_Project_Vision_Reference.md` — addendum.
- `docs/12_ai_os/21_VISION_AUTHORITY_CONTRACT.md` (new).

**Closure gate.**
- 5 new scenarios under `code/src/testing/scenarios/vision/`:
  1. `vision_lock_blocks_doc_writes_without_amendment.json`
  2. `amendment_proposal_required_for_vision_change.json`
  3. `vision_version_increments_on_approved_amendment.json`
  4. `unapproved_amendment_does_not_apply.json`
  5. `vision_history_append_only.json`
- All scenarios PASS.
- `progress/status.json` `runtime_health.vision_authority: ENABLED`.

**Estimated effort.** 10–14 days.

**Depends on.** PHASE-6 (needs migrated apiServer + tool runtime + permission).

---

### **[Track B]** PHASE-7-B — Code Execution Tool *(placeholder)*

**Capability added.** `shell.run` and `shell.run_in_workspace` — sandboxed shell execution. Forge can run build commands, test suites, and package-install commands on behalf of the owner.

**Status.** Placeholder — requires fresh decision artifact + owner approval before this phase begins.

**Depends on.** PHASE-7-A (Vision Authority must be live before ungoverned execution tools are added).

---

### **[Track B]** PHASE-7-C — Environment Management *(placeholder)*

**Capability added.** `env.install`, `env.docker_run`, `env.detect` — detect local runtime environment, install dependencies, launch Docker containers.

**Status.** Placeholder — requires fresh decision artifact + owner approval before this phase begins.

**Depends on.** PHASE-7-B (needs shell execution tool as foundation).

---

### **[Track B]** PHASE-7-D — Browser Automation *(placeholder)*

**Capability added.** `browser.navigate`, `browser.read`, `browser.click` — Playwright-backed browser control for research, scraping, and UI validation tasks.

**Status.** Placeholder — requires fresh decision artifact + owner approval before this phase begins.

**Depends on.** PHASE-7-A. (Independent of 7-B/7-C — can be sequenced separately if needed.)

---

### **[Track B]** PHASE-7-E — Agent Adapter Contract + Multi-Provider Support

**Goal.** Establish the `agent.*` namespace and uniform adapter contract for LLM agent invocation. Plug-in support for Anthropic (Claude API), OpenAI (Codex/GPT), Claude Code CLI, Aider CLI, and a deterministic mock provider for testing.

**Authority.** `DECISION-20260510-vision-shift-multi-agent-conductor.md` (Layer-0).

**New files.**
```
code/src/runtime/agents/_adapter_contract.js     — adapter shape, result helpers
code/src/runtime/agents/_adapter_registry.js     — auto-discovery
code/src/runtime/agents/adapters/anthropic_adapter.js
code/src/runtime/agents/adapters/openai_adapter.js
code/src/runtime/agents/adapters/claude_code_adapter.js
code/src/runtime/agents/adapters/aider_adapter.js
code/src/runtime/agents/adapters/mock_adapter.js
code/src/runtime/tools/agent_tools.js            — L2 tools (agent.invoke, etc.)
code/src/runtime/agents/cost_ledger.js           — cost tracking
code/src/runtime/agents/budget_enforcer.js       — per-project budget caps
code/src/runtime/permission/rules/agent_budget_rule.js  — L3 budget enforcement
code/src/runtime/doctor/checks/agent_runtime.js
docs/10_runtime/17_AGENT_RUNTIME_CONTRACT.md
artifacts/decisions/DECISION-<ts>-phase-7-E-agent-adapters.md
```

**L2 tools added.**
- `agent.invoke` — call any registered agent with role, prompt, context
- `agent.list_available` — which providers configured
- `agent.estimate_cost` — predict cost before invoking
- `agent.read_ledger` — query cost history (READ_ONLY)

**Closure gate.**
- 5 adapters loaded (anthropic, openai, claude_code, aider, mock); registry validation passes
- 4 new L2 tools registered (50 → 54)
- Doctor check `agent_runtime` PASS
- Cost ledger writes deterministic JSONL entries
- Mock provider returns scripted responses (TEST mode)
- Budget enforcer blocks invocation when project cap reached
- New scenarios S71–S82 (12 scenarios) cover: adapter parity, cost tracking, budget enforcement, mock mode determinism

**Estimated effort.** 8-12 days.

**Depends on.** PHASE-7-C-3 (closed). Track A foundation + Provider Contract v2.

---

### **[Track B]** PHASE-7-F — 11 Specialized Agent Roles

**Goal.** Implement the 11 specialized agent roles defined in `DECISION-20260510-vision-shift-multi-agent-conductor.md` Section 3. Each role has a system prompt, input/output schema, evaluation criteria, and dedicated test scenarios.

**Authority.** `DECISION-20260510-vision-shift-multi-agent-conductor.md` (Layer-0).

**The 11 roles (full taxonomy in Decision Artifact §3):**
- Architect — system design
- Spec Writer — §2 artifact generation
- Reviewer — spec review (Phase A) + code review (Phase B)
- Cost Estimator — pre-build cost prediction
- Environment Agent — dependency detection + install guidance
- Builder — implementation (delegates to claude_code/codex/aider adapter)
- Security Auditor — adversarial threat review
- Test Designer — scenario generation
- Documentation — README, API docs, user guides
- Quality Judge — final go/no-go verdict
- Deployment — ship to Vercel/Railway/AWS
- Reverse Architect (PHASE-11 only — implemented later)

**New files (one per role + supporting infra).**
```
code/src/runtime/agents/roles/architect_role.js
code/src/runtime/agents/roles/spec_writer_role.js
code/src/runtime/agents/roles/reviewer_role.js
code/src/runtime/agents/roles/cost_estimator_role.js
code/src/runtime/agents/roles/environment_role.js
code/src/runtime/agents/roles/builder_role.js
code/src/runtime/agents/roles/security_auditor_role.js
code/src/runtime/agents/roles/test_designer_role.js
code/src/runtime/agents/roles/documentation_role.js
code/src/runtime/agents/roles/quality_judge_role.js
code/src/runtime/agents/roles/deployment_role.js
code/src/runtime/agents/_role_contract.js      — uniform role interface
code/src/runtime/agents/_role_registry.js      — auto-discovery
code/src/runtime/tools/role_tools.js           — role.invoke L2 tool
docs/10_runtime/18_AGENT_ROLES_CONTRACT.md
docs/10_runtime/18b_ROLE_PROMPTS.md            — system prompts per role (versioned)
```

**Closure gate.**
- 11 roles loaded (Reverse Architect deferred to PHASE-11)
- Each role has ≥3 test scenarios (33+ new scenarios total: S83–S115)
- Mock adapter scenarios prove deterministic role behavior
- Role-to-role I/O schemas validated
- Cost per role tracked in ledger

**Estimated effort.** 14-21 days.

**Depends on.** PHASE-7-E.

---

### **[Track B]** PHASE-8 — Built-Project Test Harness (L5b)

**Goal.** When the Builder Agent (PHASE-7-F) generates a project, the Test Designer Agent (PHASE-7-F) generates test scenarios alongside it. PHASE-8 provides the execution and verdict infrastructure that runs those scenarios deterministically.

**Authority.** `DECISION-20260510-vision-shift-multi-agent-conductor.md` (scope adjustment).

**Scope adjustment from original:** The original PHASE-8 envisioned a `projectTestPlanProvider` generating scenarios. With multi-agent vision, scenario generation is the responsibility of the **Test Designer Agent** (PHASE-7-F). PHASE-8 now focuses on:
- Scenario execution infrastructure for built projects
- Verdict aggregation (pass/fail/skip per scenario)
- Loop-back trigger when scenarios fail (signals Builder Agent to fix)
- Built-project audit trail

**New files.**
```
code/src/runtime/builtproject/test_runner.js       — runs built-project scenarios
code/src/runtime/builtproject/verdict_aggregator.js
code/src/runtime/builtproject/loopback_signal.js   — signals Builder on failure
code/src/runtime/tools/builtproject_tools.js       — L2 tools
```

**Decision artifacts.**
- `DECISION-<ts>-phase-8-built-project-tests.md`.

**Closure gate.**
- A demo project (`artifacts/projects/_demo_todo_api`) built end-to-end via multi-agent loop
- Test Designer Agent generates ≥4 scenarios for the demo
- Plant a bug → tests fail → Builder Agent receives loopback signal → fixes → tests pass
- Built-project audit trail captures full agent dialogue + test results

**Estimated effort.** 6–8 days.

**Depends on.** PHASE-7-F.

---

### **[Track B]** PHASE-9 — Knowledge Base + Agent Memory

**Goal.** What old PHASE-9 promised (web research, credibility scoring, vector store, citation tracking) **plus** long-term memory for the agent pool across projects.

**Authority.** `DECISION-20260510-vision-shift-multi-agent-conductor.md` (scope expansion).

**Scope expansion from original:** Beyond research, the KB now serves as:
- **Project memory:** Architect Agent recalls prior project decisions → faster decisions
- **Pattern library:** Reviewer Agent recalls anti-patterns flagged in prior projects → consistent reviews
- **Cost history:** Cost Estimator Agent uses past project costs to refine predictions
- **Citation tracking:** Documentation Agent cites sources for technical claims

**Implementation note:** The old "Research Agent" concept becomes a **capability the agent pool uses** rather than a dedicated agent role. Any agent (typically Architect or Builder) can invoke `kb.research(query)` as part of its workflow.

**New deps (require owner re-confirmation at phase start).**
```
@lancedb/lancedb            — vector store
node-fetch                  — (verify if needed)
pdf-parse                   — extracting PDF text
cheerio                     — HTML cleaning
gpt-tokenizer               — token counting
TAVILY_API_KEY (env)        — web search
```

**New files.**
```
code/src/runtime/tools/research_tools.js               — search_web, fetch_url,
                                                          score_credibility,
                                                          embed_chunk, retrieve_relevant
code/src/ai_os/knowledgeBaseManager.js
code/src/ai_os/citationTracker.js
code/src/runtime/kb/agent_memory.js                   — per-agent memory across projects
code/src/runtime/kb/pattern_library.js                — anti-patterns, idioms, decisions
code/src/runtime/kb/cost_history.js                   — cost predictions refinement
```

**Decision artifacts.**
- `DECISION-<ts>-phase-9-kb-research.md`.

**Closure gate.**
- 6 new research scenarios (same as original) + 4 agent-memory scenarios — all PASS.

**Estimated effort.** 18–21 days.

**Depends on.** PHASE-7-F. (PHASE-8 parallel-able if capacity exists.)

---

### **[Track B]** PHASE-10 — Multi-Agent Orchestration Loop

**Goal.** Formalize the conversation graph between agents, debate-to-consensus protocol, iteration cap, and owner escalation flow defined in `DECISION-20260510-vision-shift-multi-agent-conductor.md` Section 5.

**Authority.** `DECISION-20260510-vision-shift-multi-agent-conductor.md` (scope formalized).

**Scope formalized from original:** The original PHASE-10 was "MVP → owner review → refine cycle" (vague). This is now a precise 14-step multi-agent orchestration loop (see Decision §5). Key additions:
- Conversation graph between agents (state machine)
- Debate-to-consensus protocol when agents disagree
- Iteration cap (5 rounds) with owner escalation
- 3 explicit owner approval gates

**New files.**
```
code/src/runtime/orchestration/conversation_graph.js    — agent dialogue state
code/src/runtime/orchestration/debate_protocol.js       — consensus when agents disagree
code/src/runtime/orchestration/iteration_controller.js  — cap + escalation
code/src/runtime/orchestration/approval_gates.js        — 3 owner gates
code/src/runtime/tools/orchestration_tools.js           — L2 tools
```

**Closure gate.**
- Demo project completes full 14-step loop end-to-end via multi-agent
- Iteration cap triggers escalation correctly
- Owner approval gates block progression until owner responds
- Conversation graph audit captures every agent message and decision
- Debate protocol resolves Reviewer vs Security disagreement

**Estimated effort.** 10-14 days.

**Depends on.** PHASE-7-F + PHASE-8 + PHASE-9.

---

### **[Track B]** PHASE-13 — Conversational UX Polish

**Goal.** Same as old Phase 3 (Frontend Refactor). Move `web/index.html` to React + Vite + TypeScript + Tailwind + shadcn/ui. Add voice input and visual feedback. Backend unchanged. **Sequenced last in Track B** because polished UX investment is warranted only after the orchestration layer is genuinely impressive.

*(Formerly: PHASE-10 — Frontend Refactor. Re-labeled 2026-05-09 per vision shift decision.)*

**New folder.** `web/apps/forge-workspace/` — full React app.

**Closure gate (deterministic, scenario-driven).**
- Playwright scenarios cover: chat send/receive, project create/activate/delete, vision view, KB view (read-only), doctor health indicator.
- Bundle size budget: < 500 KB gzipped initial chunk.
- Lighthouse score: > 90 on Performance, Accessibility.

**Estimated effort.** 14–21 days.

**Depends on.** PHASE-9 (so the new UI can render KB + citations).

---

### **[Track B]** PHASE-14 — Legacy Support *(deferred)*

**Capability added.** Migration, Refactoring, and Modernization for existing legacy codebases.

**Authority.** `DECISION-20260510-vision-shift-multi-agent-conductor.md` (deferred phase).

**The 3 capabilities:**
- **Migration** — version upgrades (e.g., Python 2→3, Node 14→20). Specialized Migration Agent analyzes breaking changes, generates migration plan in phases, applies changes with tests passing per phase.
- **Refactoring** — structural improvements (e.g., split 3000-line file, extract functions, reorganize modules). Behavior must remain 100% identical.
- **Modernization** — stack replacement (e.g., jQuery+PHP → React+Node, monolith → microservices). Old version runs in parallel until new is verified.

**Status.** **DEFERRED.** Opens after PHASE-13 only if real legacy demand surfaces. Reasoning:
- PHASE-11 ships the basics for existing projects (improve/add feature/bug fix/understand)
- Legacy capabilities are complex (~7-10 days of work each)
- Better to gather real-world feedback before committing scope

**Depends on.** PHASE-11 + PHASE-13. Requires fresh decision artifact + owner approval to begin.

---

**PHASE-15 (deferred)** — Vision + KB Frontend Views; added 2026-05-22 per `DECISION-2026-05-22T10-00-phase-13-scope-amendment-kb-vision-stubs.md`; requires own decision artifact + owner approval; depends on PHASE-13.

**PHASE-13.6** — Backend Health Fixes — fix forge-test.js exit code + S184–S189 undefined titles; opens immediately after PHASE-13; requires its own decision artifact + owner approval.

---

### **[Track B]** PHASE-11 — Existing Project Intake + Reverse Architect Agent

**Goal.** Same as original (user uploads existing project → Forge analyzes → enters the same orchestration loop) **plus** the 4 specific flows defined in `DECISION-20260510-vision-shift-multi-agent-conductor.md` Section 7.

**Authority.** `DECISION-20260510-vision-shift-multi-agent-conductor.md` (scope expanded).

**Scope expansion from original:**
- **Reverse Architect Agent** — the 12th specialized role (deferred from PHASE-7-F to here)
- **4 explicit flows:**
  - **Improve** — performance/quality improvements to existing
  - **Add Feature** — extend existing functionality
  - **Bug Fix** — debug + repair specific issues
  - **Understand** — analyze without changes (produces docs only)

**Constraints:**
- Project must be in `artifacts/projects/<id>/`
- Initial intake size limit: ~5MB code (larger needs owner ack on cost)
- Project must produce a vision document during intake

**What PHASE-11 does NOT cover (deferred to PHASE-14):**
- Migration (Python 2→3, Node version upgrades)
- Refactoring (monolith→microservices)
- Modernization (jQuery+PHP→React+Node)

**New files.**
```
code/src/runtime/agents/roles/reverse_architect_role.js
code/src/runtime/intake/project_scanner.js
code/src/runtime/intake/tech_stack_detector.js
code/src/runtime/intake/issue_identifier.js
code/src/runtime/tools/intake_tools.js
```

**Deps (re-confirmed at phase start).** `tree-sitter` + 9 grammar packages, `dependency-cruiser`, `multer`, `adm-zip`, `ignore`.

**Closure gate.**
- 4 fixture projects (Django, Next.js, Python CLI, Go service) — each enters intake successfully
- Each fixture: Reverse Architect produces design doc → owner approves → enters appropriate flow
- Improve flow: demonstrably faster after improvement
- Add Feature flow: existing functionality preserved + new feature works
- Bug Fix flow: bug reproduced, fixed, regression test added
- Understand flow: README + USER_GUIDE produced, no code changes
- Unsupported language → graceful BLOCKED with reason (not crash)

**Estimated effort.** 14–21 days.

**Depends on.** PHASE-7-F + PHASE-10.

---

### **[Track B]** PHASE-12 — Personal Production Setup

**Goal.** Same as old Phase 5: PM2/systemd/launchd, encrypted key storage, backups, monitoring, INSTALL.md.

**Closure gate.**
- Service starts on boot on Linux (systemd) and macOS (launchd) — verified by a separate bash test, not a scenario.
- After a planted crash (`kill -9` of the node process), service restarts within 10 s and Doctor reports `recent_execution: PASS`.
- Backup runs nightly via cron and produces a tar.gz under 200 MB for a typical workspace.
- INSTALL.md verified by following it on a clean VM.

**Estimated effort.** 5–7 days.

**Depends on.** Everything else.

---

## Section 3 — Dependency graph & parallelization

```
[CLOSED] PHASE-0 -> PHASE-7-C-3

PHASE-7-A (Vision) ->
  |
  v
PHASE-7-B (Shell) ->
  |
  v
PHASE-7-C-1, C-2, C-3 (Trilogy) ->
  |
  v
PHASE-7-E (Agent Adapters)        <- NEXT
  |
  v
PHASE-7-F (11 Specialized Roles)
  |
  v
PHASE-8 (Built-Project Tests)
  |
  v
PHASE-9 (KB + Agent Memory)
  |
  v
PHASE-10 (Multi-Agent Loop)
  |
  v
PHASE-11 (Existing Projects + Reverse Architect)
  |
  v
PHASE-12 (Personal Production)
  |
  v
PHASE-13 (Frontend Refactor)
  |
  v (deferred)
PHASE-14 (Legacy Support)
PHASE-15 (Vision + KB Frontend Views) — deferred, PHASE-13 complete

PHASE-7-D (Browser Automation) — independent placeholder, sequenced as needed
```

**Parallelization opportunities:**

1. **PHASE-8 ∥ PHASE-9.** Built-project test runner and KB are independent code paths. Both depend on PHASE-7-F. Recommendation: **start serial; parallelize only if a second contributor is on it.**
2. **PHASE-13 ∥ PHASE-11 prep.** Frontend refactor and non-code-touching prep work for intake can overlap.

Everything else is strictly serial because each phase establishes a contract that the next one consumes.

---

## Section 4 — Total estimate

| Phase | Days |
|---|---|
| PHASE-0 (closeout) | 0.5 |
| PHASE-0.5 (sweep) | 1.5–2 |
| PHASE-1 | 4–6 |
| PHASE-2 | 6–8 |
| PHASE-3 (incl. **Module Audit/delete sub-step**, Q7) | 4–6 |
| PHASE-4 | 3–4 |
| PHASE-5 (Mock = chat+tools only, Q8) | **5–7** |
| PHASE-5.1 (**Complexity Review**, Q9) | **1** |
| **🏁 LEAN v2 EXIT (Q6) — sum so far: ~25–35 days** | — |
| PHASE-6 (incl. **Endpoint Audit/delete sub-step**, Q7) | 5–7 |
| PHASE-7 | 10–14 |
| PHASE-7-E | 8–12 |
| PHASE-7-F | 14–21 |
| PHASE-8 | 6–8 |
| PHASE-9 | 18–21 |
| PHASE-10 | 10–14 |
| PHASE-11 | 14–21 |
| PHASE-12 | 5–7 |
| PHASE-13 | 14–21 |
| **Total post-multi-agent-shift (PHASE-7-E → PHASE-13)** | **~95–130 days** |
| **PHASE-14 (deferred)** | 21–30 (if opened) |
| **Lean v2 only (PHASE-0 → PHASE-5.1)** | **~25–35 days (CLOSED)** |

That's roughly **4–6 calendar months** for a solo builder running through Claude Code, assuming ~70% effective time and accounting for review cycles. Compare to the old roadmap's stated total (~9–12 weeks for 6 phases): the old estimate did not include the runtime layers, which is why the new total is higher *and* more realistic.

---

## Section 5 — What changes if a phase fails

Every phase has a closure gate that is *deterministic* (scenario PASS or property check, never "looks good"). If the gate doesn't pass:

1. The phase stays open. `progress/status.json.current_task` does not advance.
2. The decision artifact is not closed. It picks up an `unmet_criteria: [...]` field listing which scenarios failed.
3. A follow-up sub-task is opened to fix the failures. No phase is "partially closed".

This rule is added to `INSTRUCTIONS.md` in Message 3.

---

---

## Section 6 — PHASE-16: UX Closure Gap (corrective — added 2026-05-24)

> **Authority:** `DECISION-2026-05-24T16-00-phase-16-ux-closure-gap.md`
> **Status:** ACTIVE — Stage 16.1 next
> **Type:** Corrective phase. The project-closure artifact
> (`DECISION-2026-05-23T16-00-project-closure.md`) declared all roadmap phases
> complete, but the first real owner-use session exposed that Forge is
> mechanically correct but not usable. This phase closes the gap between the
> Blueprint Part B-2 Conductor Model promise and the implementation.

### Why a corrective phase

The SU suite proves mechanics; it does not prove outcomes. The central failure:
Forge has no free-form conversation mode — every message enters the pipeline
state machine immediately, making looping structurally inevitable. The cure is
a conversation mode that precedes the pipeline.

### **[Corrective]** PHASE-16 — UX Closure Gap

**Six stages, independently closable, ordered by user impact:**

| Stage | Title | Defects closed | Status |
|-------|-------|----------------|--------|
| **16.1** | Conversation Mode | G1 (BLOCKER: loop, no proposal) | NEXT |
| **16.2** | Intake in the UI | G2 (BLOCKER: no UI path to intake existing project) | PENDING (after 13.8 CLOSED) |
| **16.3** | Shared Project State | G10 (selected project not carried to Chat) | PENDING |
| **16.4** | Doctor Fixes | G3 (stale port 4505), G5 (summary wording) | PENDING (after 13.8 CLOSED) |
| **16.5** | UX Polish | G6 (RTL), G7 (test artifacts in list), G8 (raw enums), G9 (empty state) | PENDING |
| **16.6** | Provider Contract v2 Completion | G4 (12/13 providers pre-v2) | PENDING |

**Closure gate rule (binding):** Every stage closes against a user *outcome*,
not a widget's existence. Each stage requires: (1) SU/Playwright scenarios
PASS, (2) Track A grep clean, (3) owner real-use test with screenshot,
(4) decision artifact + status.json update + checkpoints under
`artifacts/decisions/_phase_16_checkpoints/`.

**Sequencing note:** 16.1, 16.3, 16.5 may begin while PHASE-13.8 reboot test
is pending (they do not touch the startup path). 16.2, 16.4, 16.6 require
PHASE-13.8 to be fully CLOSED first.

**§ARC:** Ledger stays at 7. Any new §ARC need → STOP, write decision, get
owner approval before code.

**Track A:** Backend touches (16.2 upload, 16.4 doctor, 16.6 provider migration)
must hold Track A. 16.6 improves compliance by removing direct `new OpenAI()`
from `conversationalResponseProvider`.

**Estimated effort:** 20–29 days total across all 6 stages.

---

**END OF PHASE ROADMAP**
