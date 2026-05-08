# Forge — Engineering Blueprint v2.0

> **Status:** ADOPTED — 2026-05-08 via `DECISION-20260508-phase-0-closure-and-blueprint-prep.md`
> **Authored:** 2026-05-07
> **Authority:** This blueprint is a peer Layer-0 authority alongside `docs/03_pipeline/*`, `docs/04_autonomy/*`, and the other Layer-0 members defined in DOC-11. It was adopted via decision artifact `DECISION-20260508-phase-0-closure-and-blueprint-prep.md`. Conflicts between this blueprint and any other Layer-0 document are resolved by a dedicated decision artifact scoped to the specific conflict — not by automatic priority. Blueprint clauses that duplicate or extend Layer-0 content are additive unless a decision artifact explicitly marks a Layer-0 clause as superseded.
> **Inspiration (not source):** patterns mined from the `claw-code` reference project (permission modes, tool runtime, mock parity harness, doctor command, session resume). No code is copied. All implementations are Forge-native.

---

## Part A — What Does Not Change

The following are **frozen** and any modification requires a new vision-amendment decision (per `docs/12_ai_os/05_PROJECT_LIFECYCLE.md` §amendment rules):

1. **Forge is a personal AI Operating System** for building software projects. Single-owner, local-first, not SaaS, not multi-tenant.
2. **The four-stage operating model** stays:
   - Stage A — Idea Engine (idea → vision lock)
   - Stage B — Documentation Engine (vision → docs with gap loops)
   - Stage C — Code Engine (docs → code with trace + verify)
   - Stage D — Verification & Release Gate (execution evidence → release authority)
   > Stage D is the only gate that grants release authority. Defined authoritatively in `docs/03_pipeline/03_14` and `docs/03_pipeline/03_15`. See **Part D-Stage** below for the L4+L5 relationship. Added 2026-05-08 via `DECISION-20260508-phase-0.5-resolutions.md`.
3. **Authority hierarchy stays:** `docs/**` and `progress/status.json` are the sources of truth.
4. **Hard rules from `CLAUDE.md` §3** stay in force, plus the new ones added in this blueprint.
5. **Backend stack stays:** Vanilla Node.js + CommonJS. No TypeScript on the backend.
6. **Provider-driven discovery stays:** no keyword matching, no `String.includes()` for intent classification.

What this blueprint adds is **how Forge enforces those rules at runtime**, not a re-imagining of what Forge is.

---

## Part B — The Four New Layers

Today, Forge has 33 modules under `code/src/modules/` that mostly do post-hoc validation (audit, trace, gap, verify). The pipeline runs, then validators check whether it ran correctly. This is **fail-late**.

Forge v2 inverts this: it adds four **fail-early** layers that sit between the user/agent and any side effect. Every write, every tool call, every state change passes through them first.

```
┌─────────────────────────────────────────────────────────────────┐
│  User / Claude Code Agent / Internal Engine                     │
└─────────────────────┬───────────────────────────────────────────┘
                      │  intent
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  L1. Provider Contract v2     │ every LLM call has a contract   │
└─────────────────────┬───────────────────────────────────────────┘
                      │  structured output
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  L2. Tool Runtime            │ every side effect is a Tool      │
└─────────────────────┬───────────────────────────────────────────┘
                      │  tool invocation
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  L3. Permission / Safety     │ every Tool is gated by mode      │
└─────────────────────┬───────────────────────────────────────────┘
                      │  authorized invocation
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Filesystem / API / Shell / Network                             │
└─────────────────────────────────────────────────────────────────┘

Cross-cutting:
  L4. Doctor / Health   — read-only diagnostics over all of the above
  L5. Scenario Harness  — deterministic tests that drive L1–L4 end-to-end
```

L4 and L5 are not in the request path; they are observability and correctness scaffolding.

---

### L1. Provider Contract v2

**Problem today.** Every provider in `code/src/providers/` (`conversationalResponseProvider.js`, `ideationExpansionProvider.js`, `intentClassificationProvider.js`, etc.) implements its own ad-hoc OpenAI call, JSON extraction, error handling, and retry policy. There is no shared contract beyond `executeTask({ task_id, context }) → { status, output, metadata }`. `providerRouter.js` only knows about `codex`. This means:

- No central place to enforce token budgets.
- No central place to handle model-incompatibility (e.g. `tool_choice` not supported).
- No central place to record traces.
- Every new provider re-invents fences and try/catch.

**Solution.** A single `ProviderContract` interface, enforced at construction time:

```
ProviderContract {
  // Static metadata
  id            : string                    // "conversational_response", "intent_classification"
  version       : "1.0.0"
  authority_doc : string                    // path to authoritative spec
  required_capabilities : string[]          // ["function_calling", "streaming"]

  // Input contract
  input_schema  : JSONSchema                // exactly what context.* must contain
  
  // Output contract — function calling tool definition
  output_tool   : { name, description, parameters: JSONSchema }
  
  // Behavior policy
  retry_policy  : { max_attempts: 2, backoff_ms: [500, 2000] }
  timeout_ms    : 30000
  temperature   : 0                           // deterministic by default
  creative_override : false                   // set true on creative providers (e.g.
                                              // ideation_expansion) to default to 0.6.
                                              // Requires explicit contract declaration;
                                              // cannot be assumed.
  fail_mode     : "FAIL_CLOSED"             // never silent fallback to local logic

  // Trace requirement
  trace         : (req, resp) => { provider_id, model, tokens, latency_ms, cost_estimate }
}
```

A new file `code/src/providers/_contract/providerContract.js` exports a `defineProvider(contract, handler)` helper. Every existing provider gets re-expressed as a thin handler over this contract. No duplication of OpenAI init, JSON-fence parsing, tool-call extraction, or retry-on-rate-limit.

**Provider registry.** `code/src/providers/_contract/providerRegistry.js` keeps a `Map<provider_id, ProviderContract>`. `providerRouter.js` is rewritten to be the only consumer of the registry. Every provider is loaded once at boot and validated:

- `output_tool.parameters` is a real JSON Schema, not a string.
- `authority_doc` exists on disk.
- `id` is unique.

If validation fails at boot, **the API server refuses to start**. Fail-closed at startup.

**Provider Registry and Engine Selection are distinct layers.**
The registry (`providerRegistry.js`) answers: *what providers are available and valid?*
The Cognitive Engine Selection Mode (`COGNITIVE_ENGINE_SELECTION_MODE` — governed by
`docs/10_runtime/10_05_Cognitive_Engine_Selection_and_Routing_Policy.md`) answers:
*which registered provider gets invoked for this call type in the current mode?*
`providerRouter.js` consumes both: reads the active selection mode to determine the
target `provider_id`, then executes it via the registry. The two mechanisms are
complementary, not conflicting.

**Trace + cost accounting.** Every `executeTask()` invocation produces FOUR mandatory
artifacts (per `docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md` §6,
Fail-Closed):

1. `artifacts/llm/metadata/<task_id>.json` — provider_id, model, tokens, latency, attempt
2. `artifacts/llm/requests/<task_id>.json`  — full prompt (system + messages) sent to model
3. `artifacts/llm/responses/<task_id>.json` — full raw model response received
4. `artifacts/ai/cost_ledger.jsonl`         — one row appended per call (rolling summary)

Files 1–3 are **forensic trace** (mandatory, Fail-Closed: if the write fails, `executeTask()`
returns `{ status: "FAIL_CLOSED", metadata: { reason: "TRACE_WRITE_FAILED" } }`).

File 4 is the **rolling cost summary** for cost-budget gates:

```
{ "ts": "...", "provider_id": "conversational_response", "model": "gpt-4o",
  "prompt_tokens": 412, "completion_tokens": 89, "latency_ms": 1240,
  "estimated_usd": 0.00231, "project_id": "hr_demo", "task_id": "conv_msg_..." }
```

Rotation/archival of Files 1–3 is a PHASE-12 production concern.

---

### L2. Tool Runtime

> **Terminology note.** Throughout this Blueprint, "Tool" (capital T) refers
> exclusively to an L2 Runtime Tool — a registered object with `name`,
> `required_mode`, `input_schema`, `output_schema`, `preview()`, and `execute()`.
> The lowercase "tool" used in `docs/11_ai_layer/07_TOOL_VS_CONVERSATION_CONTRACT.md`
> refers to AI Layer approved API endpoints (e.g., `/api/ai/analyze`,
> `/api/ai/propose`) — a different concept at the UX/API layer. The two are
> NOT interchangeable. When this Blueprint says "Tool", it always means the L2
> runtime object. Added 2026-05-08 via DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-2.

**Problem today.** When the conversation engine wants to "save a file", it calls `fs.writeFileSync` directly. When the API server wants to "list projects", it walks the filesystem directly. Side effects are scattered across 91 endpoints and 17 engines. There is no inventory of "what can Forge do to the filesystem / shell / network", and no way to:

- Reject a write in `read-only` mode.
- Produce a preview before applying.
- Replay an action deterministically in a test.

**Solution.** Every side effect becomes a registered **Tool** with a strict contract.

```
Tool {
  name              : string              // "fs.read_file", "fs.write_file", "fs.delete_dir",
                                          // "shell.run", "http.get", "project.create"
  description       : string
  required_mode     : PermissionMode      // see L3
  input_schema      : JSONSchema
  output_schema     : JSONSchema
  preview           : (input) => Preview  // optional but required for write tools
  execute           : (input, ctx) => Output
  audit_record      : (input, output) => AuditEntry
}
```

The tool catalogue lives in `code/src/runtime/tools/`. One file per tool family:

```
code/src/runtime/tools/
  fs_tools.js          — read_file, write_file, append_file, delete_file, list_dir, glob
  shell_tools.js       — run (no shell expansion by default), run_in_workspace
  http_tools.js        — get, post (allow-list of hosts)
  project_tools.js     — create, activate, delete, snapshot, restore
  artifact_tools.js    — write_decision, write_artifact, list_artifacts
  state_tools.js       — read_state, patch_state (with optimistic concurrency)
  pipeline_tools.js    — run_module, advance_stage, mark_blocked
```

These are not new functionality. They are **wrappers around the side effects that already happen inside `apiServer.js` and the engines**, lifted out and standardized. The migration is mechanical and incremental: each endpoint that today calls `fs.writeFileSync` directly is rewritten to call `tools.fs.write_file({ path, content })`.

**Why this is worth the migration cost.** Once a side effect is a Tool, it inherits — for free — permission gating (L3), audit trail, preview, dry-run, and scenario-harness replay (L5). This is the single highest-leverage change in the blueprint.

**Tool Registry boot validation.** `code/src/runtime/tools/_registry.js` validates at boot:

- No two tools share a `name`.
- Every write tool has a `preview` function.
- `required_mode` is a valid `PermissionMode` value.
- `input_schema`/`output_schema` parse as JSON Schema.

Boot fails on violation.

**L2 Tool Runtime does NOT replace pipeline modules.** The pipeline modules defined
in `code/src/modules/` and governed by `docs/11_ai_layer/09_WORKSPACE_RUNTIME_LANE.md`
(WORKSPACE_DECISION_GATE → WORKSPACE_BACKFILL → WORKSPACE_EXECUTE → WORKSPACE_VERIFY)
are **orchestration stages** — they sequence work, produce artifacts, and enforce
governance contracts. L2 Tools are **side-effect executors** — they perform atomic
write/read/shell operations with schema validation, permission gating, and audit trail.

The relationship is: pipeline modules **USE** L2 Tools to perform side effects. They
ARE NOT L2 Tools themselves and do not need to be rewritten as Tools. The two layers
coexist: pipeline modules orchestrate; L2 Tools execute side effects.

PHASE-6 (apiServer.js migration) will mechanically lift direct `fs.*`, `child_process.*`,
and `fetch()` calls inside pipeline modules to L2 tool invocations — without changing
the pipeline structure, module boundaries, or governance contracts.

---

### L3. Permission / Safety Layer

**Problem today.** `code/src/modules/providerAuthorityEnforcer.js` is a regex scanner that runs after the fact. It looks at source files for forbidden patterns. It cannot stop a runtime write. The Decision Gate is documented but not actually called before every write. Approval flow exists in conversation but not for filesystem operations.

**Solution.** Borrowed from `claw-code/rust/crates/runtime/src/permissions.rs`. Forge defines four modes (we drop `Allow` from claw-code as it duplicates `DangerFullAccess`; we keep `Prompt` because Forge has a human in the loop):

```
PermissionMode (ordered, lowest → highest):
  READ_ONLY          — read files, read state, list dirs. No writes anywhere.
  WORKSPACE_WRITE    — read all + write inside the active project's folder
                       (artifacts/projects/<id>/**) and inside artifacts/decisions/.
                       No writes to docs/**, code/**, web/**, tools/**, package.json.
  WORKSPACE_BUILD    — (deferred per Q1: collapsed into WORKSPACE_WRITE for v2.0;
                       re-evaluated in PHASE-8 once real scenarios prove the need.)
  DANGER_FULL_ACCESS — write anywhere. Required to modify Forge itself
                       (docs/**, code/**, package.json). Only enabled by an
                       explicit env var FORGE_ALLOW_SELF_MODIFY=1.
```

Plus two control modes:

```
  PROMPT             — every gated tool call asks the user via the conversation engine
                       before executing. Used in interactive sessions.
  TEST               — used only by the Scenario Harness; rejects PROMPT escalation
                       deterministically (no human in the loop in tests).
```

**Per-tool requirement.** Every Tool declares its `required_mode`. The active mode is set at server start from env (`FORGE_PERMISSION_MODE`, default `WORKSPACE_WRITE`). Authorization rule:

```
  authorize(tool, input, active_mode):
    1. Check global deny rules (e.g., never write to /etc, never shell `rm -rf`).
       → Deny with reason. Hard stop.
    2. If active_mode is PROMPT: emit a PermissionRequest event,
       wait for user reply via /api/permission/respond. Fail-close on timeout.
    3. If active_mode is TEST: deny if tool.required_mode > active_mode would
       have triggered a PROMPT.
    4. If active_mode >= tool.required_mode: Allow.
       Otherwise: Deny with active_mode/required_mode/reason.
```

**File:** `code/src/runtime/permission/permissionPolicy.js`. Used by the Tool Runtime before every `execute()`.

**Forbidden patterns become deny rules, not regex post-scans.** The patterns from `providerAuthorityEnforcer.js` (e.g. `inferDomain`, `String.includes` for intent) are still scanned in CI, but at runtime they cannot fire because intent classification is a Tool that lives in the Provider, not in the engine. The architecture closes the door, not just locks it.

---

### L4. Doctor / Health Layer

**Problem today.** When something is wrong — port already taken, `OPENAI_API_KEY` missing, `progress/status.json` malformed, an engine throwing on startup — the user gets a stack trace. There is no single command that says "what is the state of Forge right now?".

**Solution.** A single read-only endpoint and CLI command that runs all health checks and returns a structured report. Inspired by claw-code's `/doctor` slash command, but adapted to Forge's runtime.

**Endpoint:** `GET /api/system/doctor`

**CLI:** `node bin/forge-doctor.js`

**Output:**

```json
{
  "ok": false,
  "summary": "2 critical, 1 warning",
  "checks": [
    { "id": "node_version",        "status": "PASS", "detail": "v20.10.0" },
    { "id": "api_server_port",     "status": "PASS", "detail": "listening on 4505" },
    { "id": "web_server_port",     "status": "PASS", "detail": "static at /web" },
    { "id": "openai_api_key",      "status": "PASS", "detail": "set, length=51" },
    { "id": "providers_registered","status": "PASS", "detail": "13/13 valid" },
    { "id": "tools_registered",    "status": "PASS", "detail": "31 tools" },
    { "id": "permission_mode",     "status": "PASS", "detail": "WORKSPACE_WRITE" },
    { "id": "status_json_valid",   "status": "PASS", "detail": "ok" },
    { "id": "active_project",      "status": "PASS", "detail": "default_project" },
    { "id": "missing_dependencies","status": "FAIL", "detail": "express not in package.json but required by apiServer.js" },
    { "id": "env_dotfile",         "status": "WARN", "detail": ".env not found; relying on shell env" },
    { "id": "recent_execution",    "status": "PASS", "detail": "last verify at 2026-05-07T08:14Z" },
    { "id": "disk_space",          "status": "PASS", "detail": "12.4 GB free" },
    { "id": "trace_matrix_size",   "status": "WARN", "detail": "1.4 MB; consider archiving" }
  ],
  "links": {
    "ui":         "http://localhost:4505/",
    "api":        "http://localhost:4505/api/system/doctor",
    "logs":       "logs/forge.log",
    "decisions":  "artifacts/decisions/"
  }
}
```

**Each check is a small module** under `code/src/runtime/doctor/checks/`. Adding a new check is one new file + one line in `_registry.js`. Every check has the same signature: `() => { id, status: "PASS"|"WARN"|"FAIL", detail }`.

The web UI gets a "Health" tab that polls this every 5 seconds and shows green/yellow/red. The first time the server starts after an upgrade, the doctor runs once and writes its report to `artifacts/health/doctor_<ts>.json` — so a regression has a record.

---

### L5. Scenario Harness — two of them

This is the heart of "stop letting Claude Code judge by eye". Two distinct harnesses that share one runner.

#### L5a. Forge Self-Test Harness (tests Forge itself)

**Inspired by `claw-code/rust/crates/mock-anthropic-service/`** but written for Forge's stack: a deterministic mock of the OpenAI Chat Completions API plus a scenario file.

**Files:**

```
code/src/testing/mock_openai_service.js     — local HTTP server speaking OpenAI's
                                              /v1/chat/completions, scripted by scenario.
code/src/testing/scenario_runner.js          — runs one scenario end-to-end:
                                              boot Forge with mock URL, replay user
                                              messages, capture every tool call,
                                              every state mutation, every artifact.
code/src/testing/scenarios/                  — one .json per scenario.
code/src/testing/playwright_driver.js        — optional UI-level driver for
                                              scenarios that need the browser.
```

**Scenario shape (deterministic — no judgment of "is the response good?"):**

```json
{
  "name": "domain_pivot_hr_to_crm",
  "description": "User starts HR, pivots to CRM mid-conversation, must be asked once.",
  "permission_mode": "WORKSPACE_WRITE",
  "mock_provider_responses": {
    "ideation_expansion#1": { "detected_domain": "HR",  "follow_up_question": "كم عدد الموظفين؟" },
    "ideation_expansion#2": { "detected_domain": "CRM", "pivot_detected": true, "follow_up_question": "هل تريد التحويل لـ CRM؟" },
    "intent_classification#1": { "intent": "AFFIRM", "confidence": 0.95 }
  },
  "user_inputs": [
    "عايز نظام HR",
    "بصراحة غيرت رأيي، عايز CRM",
    "نعم"
  ],
  "assertions": [
    { "type": "tool_called",      "tool": "state.patch_state",     "with_field": "requirement_domain", "equals": "CRM" },
    { "type": "tool_not_called",  "tool": "fs.write_file",         "in_path": "artifacts/projects/*/code/" },
    { "type": "active_state",     "equals": "IDEATION" },
    { "type": "response_contains_question", "count": 1 },
    { "type": "domain_history_length", "equals": 2 },
    { "type": "ui_link_clickable", "url": "http://localhost:*" }
  ]
}
```

**The assertions are deterministic.** "Did Forge call the write_file tool inside the project's code/ directory?" is yes/no. "Is the active state IDEATION?" is yes/no. There is no "is the response good".

**The mock provider** does not call OpenAI. It returns the scripted response keyed by `<provider_id>#<call_index>`. Forge cannot tell the difference between mock and real, because the Provider Contract v2 is the only seam.

**Runner output:** `artifacts/testing/scenarios/<name>/run_<ts>/`:
- `run.json` — full transcript: inputs, tool calls, state diffs, assertion results.
- `screenshots/*.png` — for UI scenarios.
- `pass_fail.json` — single-line summary.

**CI integration:** `node bin/forge-test.js` runs all scenarios. Exits non-zero if any fail. Claude Code is required to run this at the end of every change set.

#### L5b. Built-Project Test Harness (tests projects Forge builds)

When Forge generates a project for the user, that project also needs deterministic tests — not just "the agent looked at it and it seemed fine". This is the second part of your request: *"عايز Forge يقدر يبني ان المشروع يعمل ان test بالطريقة دي للمشاريع اللي بيبنيها"*.

**Approach.** When the user-built project is being generated (Stage C), Forge generates **a scenario file alongside the code**. The scenario lives in `artifacts/projects/<id>/forge_tests/` and uses the same runner as L5a.

For example, when Forge builds an HR system, it generates:

```
artifacts/projects/hr_demo/forge_tests/
  scenarios/
    create_employee.json       — POST /employees with valid payload returns 201
    create_employee_dup.json   — duplicate national_id returns 409
    list_employees_pagination.json
    auth_required.json         — unauthenticated GET returns 401
  fixtures/
    base_users.sql
  run_after_each_module.sh     — what Forge runs to verify the module works
```

After every module (file group) Forge writes, it runs the scenario set. If a scenario fails, Forge does not advance; it loops back into the engine and generates a fix. The user sees the test report, not the raw code, as primary evidence.

**Provider responsibility.** A new provider — `projectTestPlanProvider.js` — is the only thing allowed to invent assertions. It takes the project's vision + spec and emits a JSON list of scenarios. The user reviews and approves them before code generation starts. Once approved, scenarios become part of the spec and cannot drift.

---

## Part C — Existing Modules: Decisions

Every existing file in `code/src/modules/`, `code/src/providers/`, `code/src/ai_os/`, `code/src/orchestrator/`, `code/src/workspace/` is classified into one of:

- **KEEP** — used as-is.
- **MIGRATE** — kept but rewritten over Provider Contract v2 / Tool Runtime.
- **ABSORB** — folded into one of the new layers; the old file is deleted.
- **DELETE** — no longer needed; behavior covered by new layers.

### `code/src/modules/` (33 files)

| Module | Decision | Notes |
|---|---|---|
| `auditEngine.js` | KEEP | Stage B audit, runs over docs/code. Useful as-is. |
| `backfillEngine.js` | KEEP | Stage between gap and execute. |
| `boundaryAuditStageGate.js` | KEEP | |
| `canonicalArtifactValidator.js` | KEEP | Schema validation, valuable. |
| `closureEngine.js` | KEEP | |
| `codeToSpecTraceValidator.js` | KEEP | |
| `codexContractValidator.js` | MIGRATE | Becomes a Provider Contract v2 conformance check. |
| `cognitiveLayerContractEnforcer.js` | MIGRATE | Becomes a registry validator, not a regex scanner. |
| `crossDocConsistencyEngine.js` | KEEP | |
| `decisionArtifactValidator.js` | KEEP | |
| `decisionFileNameEnforcer.js` | KEEP | |
| `decisionFinalityEnforcer.js` | KEEP | |
| `decisionGate.js` | MIGRATE | Becomes the canonical write-side approval gate; backed by L3 Permission. |
| `designExplorationEngine.js` | KEEP | |
| `docGapLoopContract.js` | KEEP | |
| `docsGapAnalyzerValidator.js` | KEEP | |
| `executeEngine.js` | MIGRATE | Every side effect routed through Tool Runtime. |
| `forkDetectionEngine.js` | KEEP | |
| `gapEngine.js` | KEEP | |
| `intakeEngine.js` | KEEP | |
| `loopEnforcementOrchestrator.js` | KEEP | |
| `loopTerminationValidator.js` | KEEP | |
| `nodeSmokeCheck.js` | ABSORB | Becomes a Doctor check. |
| `projectIsolationGuard.js` | KEEP | |
| `providerAuthorityEnforcer.js` | KEEP (but demoted) | Stays as a CI-time scanner. The runtime equivalent is now L1+L3. |
| `recommendationSeparationValidator.js` | KEEP | |
| `researchTransparencyLayer.js` | KEEP | |
| `specCompletenessEnforcer.js` | KEEP | |
| `toolIntegrationReadiness.js` | ABSORB | Becomes part of Doctor + Tool Registry boot validation. |
| `traceEngine.js` | KEEP | |
| `verifyEngine.js` | KEEP | |
| `visionAlignmentValidator.js` | KEEP | Activated by Phase 1 (Vision Authority). |
| `visionComplianceGate.js` | KEEP | Activated by Phase 1. |

**No deletions.** The existing 33 modules are well-factored at the validation layer; they just lacked a runtime that fed them clean inputs. The new layers feed them, they keep doing their job.

### `code/src/providers/` (13 files)

All MIGRATE — every one is rewritten as a thin handler over Provider Contract v2. The behavior does not change for callers; the boilerplate (OpenAI init, JSON-fence parsing, tool-call extraction) moves into the contract.

Two new providers added:

- `projectTestPlanProvider.js` — emits scenario list for L5b.
- `permissionPromptProvider.js` — formats permission requests as user-facing questions in PROMPT mode.

### `code/src/ai_os/` (17 files)

All KEEP, except `conversationEngine.js` and `ideationEngine.js` which MIGRATE: any direct `fs.*` call is replaced with a Tool Runtime call. No behavior change visible to the user.

### `code/src/workspace/apiServer.js` (3596 lines, 91 endpoints)

Hardest file. **MIGRATE in three sub-stages, not all at once:**

1. **Stage 1 (mechanical).** Every direct `fs.writeFileSync` / `fs.readFileSync` / `fs.rmSync` becomes a `tools.fs.*` call. No new endpoints. The server shrinks by ~400 lines.
2. **Stage 2 (extract handlers).** Every endpoint handler is moved to `code/src/workspace/handlers/<feature>.js`. `apiServer.js` becomes pure routing. Target: under 800 lines.
3. **Stage 3 (add new endpoints).** `/api/system/doctor`, `/api/permission/respond`, `/api/testing/scenario/run`, `/api/tools/registry`.

Stage 1 happens in a phase by itself before any other migration touches the file. Stage 2 happens incrementally per feature. Stage 3 adds the new layers.

### `code/src/orchestrator/` and `code/src/forge/`

KEEP. Pipeline definition, runner, state writer remain authoritative. `autonomous_runner.js` is updated to emit Tool Runtime calls instead of direct fs writes (Stage 1 migration above).

---

## Part D — Two QA Harnesses Recap (with the contract)

Two harnesses, one runner.

### D.1 Forge Self-Test Harness

- Lives in `code/src/testing/`.
- Tests Forge end-to-end: API + engines + tools + UI (Playwright optional).
- Uses mock OpenAI service. Deterministic.
- Runs on every commit (`bin/forge-test.js`).
- Catches regressions before Claude Code declares "done".

**Mandatory rule:** Claude Code is forbidden from declaring a task complete unless `bin/forge-test.js` exits with status 0 on a clean checkout. This is added to `INSTRUCTIONS.md` as `§6 Closure Gate`.

### D.2 Built-Project Test Harness

- Lives per-project in `artifacts/projects/<id>/forge_tests/`.
- Uses the same runner with project-specific scenarios.
- Generated by `projectTestPlanProvider` and approved by the user before Stage C.
- Forge runs it after every module it generates. If any scenario fails, Forge does not mark the module complete.

---

## Part D-Stage — Stage D and the New Runtime Layers

> Added 2026-05-08 via `DECISION-20260508-phase-0.5-resolutions.md` (B-01 resolution, Option C).

Stage D — Verification & Release Gate — is the acceptance gate that grants release authority after Stage C completes. It is defined authoritatively in `docs/03_pipeline/03_14` and `docs/03_pipeline/03_15`; this section describes only Stage D's relationship to the new runtime layers introduced by this Blueprint.

### Stage D is served by L4 + L5

```
Stage A/B/C complete
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  Stage D — Verification & Release Gate                           │
│                                                                  │
│  Evidence 1:  L4 Doctor (forge-doctor.js exits 0)               │
│    └─ all L1/L2/L3 green, providers validated, tools registered │
│                                                                  │
│  Evidence 2:  L5 Scenario Harness (forge-test.js all PASS/SKIP) │
│    └─ behavioral correctness across all defined scenarios        │
│                                                                  │
│  Evidence 3:  Boundary Audit passes (docs vs built artifacts)   │
│                                                                  │
│  Gate outcome: Release Authority granted → artifact written to  │
│  artifacts/stage_D/                                             │
└──────────────────────────────────────────────────────────────────┘
```

### Stage D closure gate (additive to pipeline docs)

The following conditions, read together with the authoritative rules in `docs/03_pipeline/03_14` and `03_15`, determine Stage D closure:

1. Stage A, B, and C closure artifacts pass Boundary Audit.
2. `node bin/forge-doctor.js` exits 0.
3. `node bin/forge-test.js` all scenarios PASS or SKIP (none FAIL).
4. Stage D closure artifact is written to `artifacts/stage_D/`.

Stage D is only executable after PHASE-4 (Doctor layer) and PHASE-5 (Self-Test Harness) both close. Before those phases, Stage D is in a `PENDING_LAYER_AVAILABILITY` state.

---

## Part E — Governance: How a Feature Gets In

The blueprint introduces three new gates that any change to Forge must pass:

```
┌───────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Decision Artifact│────▶│  Doctor Pass     │────▶│  Scenario Pass    │
│  (signed by user) │     │  (forge-doctor)  │     │  (forge-test)     │
└───────────────────┘     └──────────────────┘     └───────────────────┘
        │                                                   │
        │                                                   │
        └──────────────────  status.json patched  ──────────┘
```

Every Phase prompt (Part F) ends with these three checkpoints. Skipping any of the three is a contract violation per `CLAUDE.md` §7.

---

## Part F — Phase Roadmap (preview only; full prompts in Message 6)

The previous 6-phase roadmap (Phase 0–5 in `files.zip`) is partially superseded. New roadmap:

| New Phase | Title | Replaces | Estimated effort |
|---|---|---|---|
| **PHASE-0** *(complete)* | Foundation Repair | Phase 0 (old) | ✓ Done in repo |
| **PHASE-1** | Provider Contract v2 + Provider Registry | (new) | 4–6 days |
| **PHASE-2** | Tool Runtime Layer | (new) | 6–8 days |
| **PHASE-3** | Permission / Safety Layer | (new) | 4–5 days |
| **PHASE-4** | Doctor / Health Layer | (new) | 3–4 days |
| **PHASE-5** | Forge Self-Test Harness — chat + tool calling mock only (Q8) | (new) | 5–7 days |
| **PHASE-5.1** | **Complexity Review checkpoint (Q9)** | (new) | 1 day |
| **🏁 LEAN v2 EXIT (Q6)** | **Optional stop point. Forge is already substantially safer here.** PHASE-6+ requires fresh owner decision. | — | — |
| **PHASE-6** | apiServer.js migration — starts with **Endpoint Audit (Q7)** | (new) | 5–7 days |
| **PHASE-7** | Vision Authority System | Phase 1 (old) | 10–14 days |
| **PHASE-8** | Built-Project Test Harness + projectTestPlanProvider | (extends old Phase 2) | 6–8 days |
| **PHASE-9** | Knowledge Base & Research Agent | Phase 2 (old) | 18–21 days |
| **PHASE-10** | Frontend Refactor (React) | Phase 3 (old) | 14–21 days |
| **PHASE-11** | Existing Project Intake | Phase 4 (old) | 14–21 days |
| **PHASE-12** | Personal Production Setup | Phase 5 (old) | 5–7 days |

**Key changes from the old roadmap:**

- New phases 1–6 sit in front of Vision Authority. Reason: Vision Authority is itself easier to build correctly once the four layers exist, because the Vision Compliance Gate becomes one more permission rule (L3) and one more tool (L2).
- Old Phase 2 is split: the part that is "deterministic test scaffolding for built projects" moves up to PHASE-8 (right after Vision); the part that is "web research + KB" stays as PHASE-9.
- Frontend Refactor is unchanged in content but moves later. The current `web/index.html` works; refactoring it before the backend is stable is wasted churn.

---

## Part G — Risks & Open Questions

### Risks

1. **apiServer.js migration is big.** 3596 lines, 91 endpoints. Mitigation: PHASE-6 is staged in three sub-phases, each with its own scenario tests. We do not refactor all 91 endpoints in one go.
2. **Scenario harness depends on a mock that Forge could grow out of.** OpenAI's API surface evolves (function calling → tools → built-in tools). Mitigation: the mock targets the *Provider Contract v2 surface*, not OpenAI directly. If OpenAI changes, the providers change; the mock keeps working.
3. **Permission PROMPT mode adds a UI dependency for any background flow.** Mitigation: background flows run in `WORKSPACE_WRITE` (not PROMPT). Only interactive sessions use PROMPT. The Scenario Harness uses TEST.

### Resolved decisions (owner-approved 2026-05-07)

1. **Q1 — WORKSPACE_BUILD mode.** **Collapsed into WORKSPACE_WRITE for now.** Re-evaluated in PHASE-8 once real scenarios show whether the distinction matters.
2. **Q2 — Doctor surface.** **Both.** `bin/forge-doctor.js` (CLI, exit 0/1) and `GET /api/system/doctor` (endpoint, JSON body), sharing `runDoctor()` in `code/src/runtime/doctor/runDoctor.js`.
3. **Q3 — Playwright.** **Optional.** `optionalDependencies`. Scenarios that require it declare `requires: ["playwright"]` and report `SKIPPED` if unavailable.
4. **Q4 — `progress/status.json` extension.** **Additive only.** Doctor populates a new `runtime_health` block; no field removed or repurposed.
5. **Q5 — Pre-Phase-1 contradiction sweep.** **Yes, before Phase 1.** Sweep across all `docs/12_ai_os/`, `docs/04_autonomy/`, `docs/11_ai_layer/`. Findings written to `artifacts/audit/blueprint_contradiction_sweep.md`. (See PHASE-0.5.)
6. **Q6 — Lean v2 Exit.** **Adopted.** After PHASE-5 closes, the project hits a formal exit point. PHASE-7 through PHASE-12 are *not assumed*; each requires a fresh decision artifact to begin. The Blueprint, Roadmap, and `progress/status.json` schema all treat PHASE-6 onward as conditional on owner re-confirmation. This protects against momentum loss and over-engineering.
7. **Q7 — Module/Endpoint Audit (delete, not migrate).** **Adopted.** PHASE-3 includes a "Module Audit" sub-step that deletes any module whose responsibility is fully subsumed by L1+L2+L3 (candidates: `nodeSmokeCheck.js`, `toolIntegrationReadiness.js`, the runtime portion of `providerAuthorityEnforcer.js`). PHASE-6 starts with an "Endpoint Audit" sub-step that lists every endpoint in `apiServer.js`, cross-references against `web/index.html` calls, and deletes orphans before migration. Every deletion gets its own decision artifact line.
8. **Q8 — Mock OpenAI scope.** **Limited in PHASE-5.** Chat completions + tool calling only. Streaming, vision, and audio deferred to a later phase ("PHASE-5b") to be opened only if a scenario actually needs them. This keeps PHASE-5 in the 5–7 day band, not 7–10.
9. **Q9 — Complexity Review checkpoint.** **Adopted.** A 1-day checkpoint immediately after PHASE-5 closes. Output: `artifacts/audit/complexity_review_post_phase_5.md`. Measures: Forge runtime LOC, Forge test LOC, runtime LOC ÷ average built-project LOC, dead code candidates. If Forge runtime is more than 3× the size of an average built project's runtime, a `STOP_AND_SIMPLIFY` decision is opened before any further phase.

---

## Part H — Approval

This blueprint is binding only after:

1. The owner replies "approved" or equivalent in chat.
2. `artifacts/decisions/DECISION-20260507-forge-v2-blueprint.md` is committed (template provided in Message 3).
3. `progress/status.json` `next_step` is updated to point at PHASE-1.

Until those three steps happen, this document is `DRAFT` and has no authority.

---

**END OF BLUEPRINT v2.0**
