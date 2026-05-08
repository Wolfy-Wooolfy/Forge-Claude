# Forge v2.0 — Phase Roadmap (detailed)

> **Companion to:** `architecture/FORGE_V2_BLUEPRINT.md`
> **Status:** PROPOSED — superseding `files.zip` once owner approves.
> **Authored:** 2026-05-07

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

## Section 2 — The thirteen phases (full detail)

### PHASE-0 — Foundation Repair (status: COMPLETE)

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

### PHASE-0.5 — Pre-Blueprint Contradiction Sweep

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

### PHASE-1 — Provider Contract v2 + Provider Registry

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

### PHASE-2 — Tool Runtime Layer

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

### PHASE-3 — Permission / Safety Layer

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

### PHASE-4 — Doctor / Health Layer

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

### PHASE-5 — Forge Self-Test Harness (L5a)

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

### PHASE-6 — apiServer.js migration (Stages 1 + 2)

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

### PHASE-7 — Vision Authority System

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

### PHASE-8 — Built-Project Test Harness (L5b) + projectTestPlanProvider

**Goal.** When Forge generates a project, it generates a deterministic test scenario set alongside the code. The same `scenario_runner.js` from PHASE-5 runs them.

**New files.**
```
code/src/providers/projectTestPlanProvider.js          — emits scenario list
                                                          for a built project
code/src/runtime/tools/built_project_test_tools.js     — generate_test_plan,
                                                          run_built_project_tests
code/src/ai_os/builtProjectTestEngine.js               — orchestrates: generate plan
                                                          → user approves → run after
                                                          each module
code/src/testing/scenarios/built_project/              — meta-scenarios that prove
                                                          this engine works:
  bp_01_test_plan_generated.json
  bp_02_user_approves_plan.json
  bp_03_module_run_blocked_on_test_failure.json
  bp_04_module_advances_on_test_pass.json
```

**Modified files.**
```
code/src/modules/executeEngine.js                      — after each module write,
                                                          run built-project tests;
                                                          block on failure
code/src/orchestrator/pipeline_definition.js           — EXECUTE module gains
                                                          BUILT_PROJECT_TESTS sub-step
```

**Decision artifacts.**
- `DECISION-<ts>-phase-8-built-project-tests.md`.

**Documentation.**
- `docs/03_pipeline/EXECUTE_MODULE_CONTRACT_v1.md` — addendum: the "test after each module" loop.
- `docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md` (new).

**Closure gate.**
- A demo project (e.g. `artifacts/projects/_demo_todo_api`) is built end-to-end:
  - Test plan generated (4 scenarios minimum: create, list, auth, validation).
  - User approval simulated in the scenario.
  - Plant a bug in the generated code → built-project tests fail → execute engine does NOT advance the module.
  - Fix the bug → tests pass → module advances.
- 4 new meta-scenarios PASS.

**Estimated effort.** 6–8 days.

**Depends on.** PHASE-7 (needs vision-aligned spec to drive the test plan).

---

### PHASE-9 — Knowledge Base & Research Agent

**Goal.** What old Phase 2's KB part promised: web research, credibility scoring, local vector store, citation tracking.

**New deps (require owner re-confirmation at phase start).**
```
@lancedb/lancedb            — vector store
node-fetch                   — (verify if needed)
pdf-parse                    — extracting PDF text
cheerio                      — HTML cleaning
gpt-tokenizer                — token counting
TAVILY_API_KEY (env)         — web search
```

**New files.** (sketch — full plan in the phase prompt)
```
code/src/runtime/tools/research_tools.js               — search_web, fetch_url,
                                                          score_credibility,
                                                          embed_chunk, retrieve_relevant
code/src/ai_os/knowledgeBaseManager.js
code/src/ai_os/citationTracker.js
code/src/providers/researchProvider.js                 — rewritten for citations
artifacts/projects/<id>/kb/                            — per-project KB:
  documents.lance/                                       (vector store)
  citations.jsonl                                        (claim → source_id mapping)
  sources/                                               (cached source files)
```

**Modified files.**
```
code/src/providers/openAiDocumentationProvider.js      — every claim must cite a source
                                                          from the KB or be flagged
code/src/modules/auditEngine.js                        — new audit rule:
                                                          uncited claims → WARN/FAIL
```

**Decision artifacts.**
- `DECISION-<ts>-phase-9-kb-research.md`.

**Closure gate.**
- 6 new scenarios:
  - `kb_research_returns_3_sources.json`
  - `kb_credibility_filter_rejects_low_score.json`
  - `kb_doc_generation_includes_citations.json`
  - `kb_uncited_claim_triggers_audit_warn.json`
  - `kb_token_budget_enforced.json`
  - `kb_offline_fallback_to_existing_sources.json`
- All PASS.

**Estimated effort.** 18–21 days.

**Depends on.** PHASE-7. (PHASE-8 is parallel-able — see Section 3.)

---

### PHASE-10 — Frontend Refactor (React)

**Goal.** Same as old Phase 3. Move `web/index.html` to React + Vite + TypeScript + Tailwind + shadcn/ui. Backend unchanged.

**New folder.** `web/apps/forge-workspace/` — full React app.

**Closure gate (deterministic, scenario-driven).**
- Playwright scenarios cover: chat send/receive, project create/activate/delete, vision view, KB view (read-only), doctor health indicator.
- Bundle size budget: < 500 KB gzipped initial chunk.
- Lighthouse score: > 90 on Performance, Accessibility.

**Estimated effort.** 14–21 days.

**Depends on.** PHASE-9 (so the new UI can render KB + citations).

---

### PHASE-11 — Existing Project Intake & Reverse Vision

**Goal.** Same as old Phase 4. User uploads a project folder/zip → Forge analyzes (multi-language tree-sitter), infers vision retroactively, drops it into the same loop.

**Deps (re-confirmed at phase start).** `tree-sitter` + 9 grammar packages, `dependency-cruiser`, `multer`, `adm-zip`, `ignore`.

**Closure gate.**
- 4 fixture projects: a Django app, a Next.js app, a Python CLI, a Go service. For each:
  - Intake completes.
  - A reverse-vision draft is produced.
  - User approval moves the project into the standard pipeline.
- Scenario: `intake_unsupported_language` → graceful `BLOCKED` with reason, not a crash.

**Estimated effort.** 14–21 days.

**Depends on.** PHASE-7 (Vision Authority must be live so reverse-vision can lock).

---

### PHASE-12 — Personal Production Setup

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
PHASE-0 (closeout)
  │
  ▼
PHASE-0.5 (contradiction sweep)
  │
  ▼
PHASE-1 (Provider Contract v2)
  │
  ▼
PHASE-2 (Tool Runtime)
  │
  ▼
PHASE-3 (Permission)
  │
  ▼
PHASE-4 (Doctor)
  │
  ▼
PHASE-5 (Self-Test Harness)
  │
  ▼
PHASE-6 (apiServer migration)
  │
  ▼
PHASE-7 (Vision Authority)
  │
  ├──────────────┐
  ▼              ▼
PHASE-8       PHASE-9
(Built-Proj   (KB + Research)   ← these two can run in parallel
 Tests)        if you have the
              capacity. Otherwise
              do PHASE-8 first
              (smaller).
  │             │
  └───────┬─────┘
          ▼
       PHASE-10 (React Frontend)
          │
          ▼
       PHASE-11 (Existing Project Intake)
          │
          ▼
       PHASE-12 (Production Setup)
```

**Parallelization opportunities (only two real ones):**

1. **PHASE-8 ∥ PHASE-9.** Built-project test plan provider and KB are independent code paths. Both depend on PHASE-7. Risk if parallelized: small — they touch different files. Recommendation: **start serial; parallelize only if a second contributor is on it.**
2. **PHASE-10 ∥ PHASE-11 prep.** Frontend refactor and the *non-code-touching* prep work for intake (fixture project gathering, language allow-list) can overlap in the second week of PHASE-10. Not worth coordinating for a solo build.

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
| PHASE-8 | 6–8 |
| PHASE-9 | 18–21 |
| PHASE-10 | 14–21 |
| PHASE-11 | 14–21 |
| PHASE-12 | 5–7 |
| **Total if all 13 phases run** | **~98–135 days** |
| **Lean v2 only (PHASE-0 → PHASE-5.1)** | **~25–35 days** |

That's roughly **4–6 calendar months** for a solo builder running through Claude Code, assuming ~70% effective time and accounting for review cycles. Compare to the old roadmap's stated total (~9–12 weeks for 6 phases): the old estimate did not include the runtime layers, which is why the new total is higher *and* more realistic.

---

## Section 5 — What changes if a phase fails

Every phase has a closure gate that is *deterministic* (scenario PASS or property check, never "looks good"). If the gate doesn't pass:

1. The phase stays open. `progress/status.json.current_task` does not advance.
2. The decision artifact is not closed. It picks up an `unmet_criteria: [...]` field listing which scenarios failed.
3. A follow-up sub-task is opened to fix the failures. No phase is "partially closed".

This rule is added to `INSTRUCTIONS.md` in Message 3.

---

**END OF PHASE ROADMAP**
