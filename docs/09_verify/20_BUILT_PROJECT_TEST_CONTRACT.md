# Built-Project Test Contract (L5b) — Authority Document

> Layer: L5b Built-Project Test Harness
> Decision: DECISION-2026-06-22-phase-42-built-project-test-harness (PROPOSAL + AMENDMENT A-1)
> Status: ADOPTED 2026-06-22
> Authority: This document is the authoritative reference for the built-project test path. It supersedes the Roadmap PHASE-8 file list (which still names the retired `projectTestPlanProvider.js`) and is the companion to the Blueprint Part B "L5b. Built-Project Test Harness" subsection + its 2026-06-22 addendum.

---

## 1. Status banner

- **ADOPTED 2026-06-22** via `artifacts/decisions/DECISION-2026-06-22-phase-42-built-project-test-harness.md` (AMENDMENT A-1, owner-ratified against commit `bedf6721`).
- Authority for: the deterministic test path that runs against projects **Forge builds for the owner** (Stage C / the multi-agent build loop), and the owner-facing surface that exposes the resulting test report.
- Execution layer: **as-built and live** (proven end-to-end with a real `gpt-4o` run in the PHASE-28/29 Gate #10). Owner-facing report surface: **specified here, implemented in STEP B**.

---

## 2. Purpose

A non-technical owner cannot read generated source code to judge whether a built project works. The L5b harness makes each built project arrive **with deterministic, owner-readable evidence**:

- The Test Designer agent generates a test plan from the project's spec + design.
- After the build, the scenario set runs against the running project (real HTTP requests, deterministic assertions).
- A failing run **blocks** the pipeline and loops back to the Builder — the project never advances on red.
- The verdict is written as a report the owner reads as **primary evidence** (overall PASS/FAIL + per-scenario verdicts), instead of the raw code.

---

## 3. As-built surface

### 3.1 L2 tools — `code/src/runtime/tools/builtproject_tools.js`

**`builtproject.run_scenarios`**
- `required_mode`: `WORKSPACE_WRITE`.
- Input: `{ project_root: string (required), scenario_ids?: string[] }`. `project_root` = absolute path to the built project directory; `scenario_ids` omitted/`[]` ⇒ run all.
- Output: `{ overall_status, total, pass, fail, error, report_path, signal_path, load_errors, scenarios }`.
- Behavior: resolves `project_root` (fail-closed `PROJECT_NOT_FOUND` if missing) → `loadScenarios` (fail-closed `SCENARIO_LOAD_FAILED` / `NO_SCENARIOS`) → runs each scenario via `runScenario` → `aggregate` writes `last_report.json` → `emit` writes `loopback_signal.json`.

**`builtproject.read_report`**
- `required_mode`: `READ_ONLY` (`is_read_only: true`).
- Input: `{ project_root: string (required) }`.
- Output (on success): `{ report_path, total, pass, fail, error, overall_status, ran_at, scenarios }` — i.e. `{ report_path, ...<parsed last_report.json> }`.
- Fail-closed: `REPORT_NOT_FOUND` when `<project_root>/forge_tests/last_report.json` is absent; `REPORT_PARSE_ERROR` on malformed JSON.

> **As-built note (binding on STEP B).** `read_report` takes `project_root` (an absolute path), **not** `project_id`. The owner-facing endpoint (§5) resolves `project_id → <root>/artifacts/projects/<project_id>` before invoking the tool. The tool output has **no** `ok` field of its own — the L2 tool contract wraps it with `status: "SUCCESS"`. The top-level success fields are exactly: `report_path, total, pass, fail, error, overall_status, ran_at, scenarios`.
> **As-built note (2026-06-22, normalization).** The endpoint applies `normalizeProjectId` to `project_id` before building `project_root`, so the resolved path is `artifacts/projects/<normalized_id>/forge_tests/last_report.json` (leading/trailing `_` stripped, lower-cased, non-alphanumerics → `_`). See §5.1.

### 3.2 Harness core — `code/src/runtime/builtproject/`

- `scenario_loader.js` — `loadScenarios(projectRoot, ids)` reads `<projectRoot>/forge_tests/scenarios/*.json`, validates required fields `["id","name","description","category","setup","execution","assertions","teardown"]`, returns `{ scenarios, errors }`.
- `harness_runner.js` — `runScenario(scenario, projectRoot)`: runs `setup.actions` (`start_server` via `child_process.spawn`, port-poll until ready or timeout), executes `execution` (`http_request`), evaluates `assertions`, tears the server down in `finally`. Returns `{ id, name, status: PASS|FAIL|ERROR, assertions[], error?, duration_ms }`.
- `verdict_aggregator.js` — `aggregate(results, projectRoot)`: `overall_status = (fail===0 && error===0) ? "PASS" : "FAIL"`; writes `<projectRoot>/forge_tests/last_report.json`; returns `{ summary, report_path }`.
- `loopback_signal.js` — `emit(summary, projectRoot)`: writes `<projectRoot>/forge_tests/loopback_signal.json` (`{ emitted_at, overall_status, total, pass, fail, error, failed_ids[] }`); returns `{ signal_path }`.

**8 assertion types** — `code/src/runtime/builtproject/assertion_types/` (each exports `assert(assertion, context)`):
`http_status_equals`, `response_body_contains_key`, `response_body_field_equals`, `response_body_is_array`, `response_body_matches_schema`, `process_exit_code_equals`, `file_exists`, `stdout_contains`.

### 3.3 Pipeline wiring — `code/src/ai_os/conversationEngine.js`

**`designTests` (`TEST_DESIGN → BUILDER`)** — reads `spec.json` + `architect_design.json` for the loop, invokes the `test_designer` role (30 s timeout), persists `orchestration/<loop_id>/test_plan.json`, advances to `BUILDER`. Any failure ⇒ `{ ok:true, test_error:<code>, advanced:false }` (stays `TEST_DESIGN`). No owner gate on this edge.

**`runTests` (`RUN_TESTS → …`)** — deterministic, no LLM call:
1. State guard (`RUN_TESTS`), read `test_plan.json`.
2. PHASE-30 entry derivation from `build_manifest.json` (fail-closed `ENTRY_UNRESOLVED` if a manifest is present but no entry resolves).
3. **Dependency install** — scan `require(...)` across the build's `.js` files (manifest-scoped when present), merge non-builtin deps into `package.json`, run `npm install` via `shell.run_in_workspace` (fail-closed `DEPS_INSTALL_FAILED`).
4. **Bridge** — write each `test_plan.scenarios[*]` to `forge_tests/scenarios/<id>_<name>.json`, rewriting `start_server` command to the derived entry.
5. **Run** — `reg.invoke("builtproject.run_scenarios", { project_root })`.
6. **Verdict routing:**
   - `overall_status === "PASS"` ⇒ `orchestration.advance_state` to `REVIEWER_CODE_AND_SECURITY`.
   - `FAIL` ⇒ `orchestration.loop_back` to `BUILDER` (cap-aware; `ESCALATED` at the iteration cap). **No state advance on FAIL** — this is the block + loopback.

### 3.4 Test Designer role — `code/src/runtime/agents/roles/test_designer_role.js`

- `id: "test_designer"`, `authority_level: ADVISORY`, default `anthropic / claude-opus-4-7` (overridable; `designTests` defaults to `openai / gpt-4o` in production today).
- Input: `{ project_id, spec, design }`. Output: `{ scenarios[], coverage_summary:{ acs_total, acs_covered, gaps[] } }`.
- The `scenarios[*]` **output schema is identical to the L5b scenario schema** consumed by `scenario_loader.js` (`id, name, description, category, fixture?, setup, execution, assertions, teardown, metadata`) — the test plan flows into the harness without transformation.
- **The `test_designer` role is the sanctioned test-plan generator.** The Blueprint's `projectTestPlanProvider.js` is RETIRED / never built (superseded by this role per `DECISION-20260510-vision-shift-multi-agent-conductor.md`).

### 3.5 §ARC mapping (quoted from `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md`)

The harness path uses two numbered §ARC exceptions; §ARC count = **10** (frozen).

- **§ARC-3** — `code/src/runtime/builtproject/harness_runner.js` — "`child_process.spawn` (server lifecycle: start, stdout capture, port polling, teardown)." The L2 `shell.run_in_workspace` tool is blocking and cannot host a background server with streaming capture; the exception is bounded to this file. Authorization: `DECISION-202605131800-phase-8-arc-3-spawn-exception.md`.
- **§ARC-10** — `code/src/runtime/builtproject/verdict_aggregator.js`, `code/src/runtime/builtproject/loopback_signal.js` — "Direct `fs.mkdirSync` / `fs.writeFileSync` into the **built project's** `forge_tests/` directory (an EXTERNAL project root, NOT the Forge workspace)… The L2 `fs.write_file` tool / L3 policy are scoped to the Forge root and would deny writes to an arbitrary external project root. … 6 writes / 2 files." Authorization: `DECISION-2026-06-18-phase-37-arc-drift-audit.md`.

All other harness, tool, role, doctor, and rule files on this path are Track-A clean (side effects only via `reg.invoke` / `agent.invoke`).

### 3.6 L3 vision gate + L4 doctor check

- **L3 gate** — `code/src/runtime/permission/rules/builtproject_vision_rule.js` fires for `builtproject.run_scenarios`: (A) `project_root` must resolve inside `artifacts/projects/<id>/` (else `PROJECT_ROOT_OUT_OF_SCOPE` / `PROJECT_ROOT_MISSING`); (B) the project's vision must have `vision_locked: true` (else `VISION_NOT_FOUND` / `VISION_NOT_LOCKED`). **TEST-mode bypass** — the SU harness owns its own isolation. Per `DECISION-20260512-1430 §4.1`.
- **L4 check** — `code/src/runtime/doctor/checks/builtproject_runtime.js` (`builtproject_runtime`) verifies the 4 core modules require cleanly, all 8 assertion types export `assert`, and the reference fixture has `server.js` + `forge_tests/scenarios/` with ≥ 6 scenarios. Locked by SU scenario `S119`.

### 3.7 Reference fixture + SU coverage

- Reference project: `artifacts/projects/_reference_todo_api/` (`server.js`, `routes/`, `db.js`, `package.json`, `node_modules/`) with `forge_tests/scenarios/T1–T6.json`. There is **no** `run_after_each_module.sh` — that filename in the Blueprint example is illustrative only (see §4).
- SU scenarios `S119–S128` lock the path: `S119` doctor check; `S120` reference all-6-PASS; `S121` `scenario_ids` filter; `S122` `read_report` after run; `S123` missing project ⇒ FAILED; `S124` empty `scenario_ids` runs all; `S125` T-1 assertions; `S126` T-6 400; `S127` writes `last_report.json` + `loopback_signal.json`; `S128` `read_report` with no prior run ⇒ FAILED.

---

## 4. Execution model — PER-BUILD (v2.0)

The adopted v2.0 model is **PER-BUILD**, per AMENDMENT A-1 §A-1.3 and the Blueprint L5b addendum (2026-06-22):

- The materializer (`code/src/runtime/orchestration/materializerEngine.js`) writes the **full file plan in one `buildProject` pass** (optionally with a single `node <entry>` smoke check, exit 0).
- The scenario set runs **once** at the `RUN_TESTS` state; FAIL routes back to `BUILDER` (cap-aware), no advance on failure.
- This satisfies the L5b intent — deterministic tests + block-on-failure + loopback + owner-readable report — at **build** granularity.

**PER-MODULE** (incremental build with a test run after each module/file group, as the Blueprint L5b prose literally describes) is an architectural rework of the live build path and is **DEFERRED to the Iterative Build Loop phase (Roadmap PHASE-10)**. It is out of scope for PHASE-42.

---

## 5. Owner-facing report contract (implemented in STEP B)

The harness writes `last_report.json`, but today it is reachable only via the `read_report` tool — there is **no** owner-facing surface. STEP B implements exactly this contract.

### 5.1 Endpoint

```
GET /api/ai-os/project/test-report?project_id=<id>
```

- **READ-ONLY.** No mutation, no LLM call, `$0`.
- **Source:** the handler resolves `project_id → <root>/artifacts/projects/<project_id>` and invokes `reg.invoke("builtproject.read_report", { project_root })`. **No direct `fs.*` on the live surface** — Track A (see §6 + AMENDMENT A-1 §A-1.6).
- **Note (2026-06-22, PHASE-42 Gate #10 prep).** The handler applies `normalizeProjectId(project_id)` BEFORE resolving (lower-cases, maps non-alphanumerics → `_`, strips leading/trailing `_`), so the resolved folder is `artifacts/projects/<normalized_id>/`. Consequently an underscore-prefixed id such as `_reference_todo_api` resolves to `reference_todo_api` — a built-project report must live under the **normalized** folder name to be reachable via this endpoint. (Real owner projects already use normalized ids; the underscore-prefixed reference fixture is the only exception.)

### 5.2 Success (200) — report present

```json
{
  "ok": true,
  "project_id": "<id>",
  "overall_status": "PASS|FAIL",
  "total": 0,
  "pass": 0,
  "fail": 0,
  "error": 0,
  "scenarios": [ { "id": "T-1", "status": "PASS", "name": "...", "duration_ms": 0, "assertions": [], "error": null } ],
  "report_path": "<abs path>",
  "ran_at": "<iso8601>"
}
```

`overall_status / total / pass / fail / error / scenarios / report_path / ran_at` are taken directly from the `read_report` tool output (§3.1); `ok` + `project_id` are added by the handler.

### 5.3 Report-absent — fail-SOFT (NOT a 500)

When `read_report` returns `REPORT_NOT_FOUND` (the project exists but has no run yet):

```json
{ "ok": true, "project_id": "<id>", "report": null, "reason": "NO_REPORT" }
```

### 5.4 Errors — fail-closed with a typed reason

Any genuine error (project not found, parse error, tool failure) returns `{ ok: false, reason: "<TYPED_CODE>", detail?: "..." }` with an appropriate non-2xx status. Reasons mirror the tool taxonomy (`PROJECT_NOT_FOUND`, `REPORT_PARSE_ERROR`, …). No silent fallback.

### 5.5 Render

A **minimal owner-readable view** of the report: the overall PASS/FAIL banner + a per-scenario pass/fail list. **Non-React** — it must not pre-empt the PHASE-13 frontend rework. The owner reads this as primary evidence; raw code is not surfaced here.

---

## 6. Track A constraint (binding)

The owner-facing endpoint lives on the live runtime surface (`code/src/workspace/apiServer.js`). It MUST source the report via `reg.invoke` / the `builtproject.read_report` tool. Direct `fs.*Sync` / `child_process` / `fetch` / `new OpenAI()` on the live surface (`apiServer.js` + `ai_os/**` + `runtime/**`), outside the L2 tool homes and the frozen §ARC-1..10 exceptions, is a Track A violation. **PHASE-42 adds no new provider and no new §ARC entry; §ARC stays frozen at 10.**

---

## 7. Closure gate

The deterministic PHASE-42 closure gate is defined in `DECISION-2026-06-22-phase-42-built-project-test-harness.md` **AMENDMENT A-1 §A-1.5** and is authoritative. Summary: SU `325 → 325+N / 0 fail / 5 skip` (no regression); forge-doctor `35 / 0 FAIL`; Track A grep clean on the live surface; this doc + the Blueprint addendum + AMENDMENT A-1 present; `status.json` updated; checkpoint written; mock-only `$0`.
