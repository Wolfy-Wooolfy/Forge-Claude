# DECISION — PHASE-24: BUILDER Materializer (Path A)

- **Decision ID:** DECISION-2026-06-08-phase-24-builder-materializer
- **Type:** Phase plan (redefines the PHASE-24 slot from "COST_ESTIMATE bridge" to "BUILDER Materializer")
- **Status:** APPROVED (owner) / PENDING EXECUTION
- **Date:** 2026-06-08
- **Author:** CTO advisor (chat)
- **Owner approval:** Khaled — "موافق على توصيتك طالما باعلى درجات الاحترافية"
- **Depends on:** spike PASS (DECISION-2026-06-08-spike-builder-real-codegen) — generate→materialize→run proven with real gpt-4o ($0.01126, owner-verified).
- **Supersedes:** the tentative "PHASE-24 = COST_ESTIMATE bridge" intent. COST_ESTIMATE + the remaining bridges are deferred.

## 1. Goal
Make Forge's BUILDER state produce REAL, runnable files on disk (not a plan), through the actual orchestration loop — covered by deterministic mock tests and one real-provider owner build.

## 2. Architecture decision (Path A — Forge-native materializer)
- The **builder role stays a PLANNER** — its contract, `builder_v1` prompt, output schema, and scenarios S92–S95 are UNCHANGED. `files_written` with `sha256:"pending"` remains the planner's contract.
- A new **materializer** is the "orchestration layer" `builder_v1` already names. Built as `materializerEngine` (new) + L2 tool **`builder.materialize`** (new):
  - **Input:** `{ project_id, plan (builder files_written), spec, design, provider, model, scenario_id?, smoke? }`.
  - **Behavior:** ONE codegen call via `reg.invoke("agent.invoke", {provider, model, prompt})` requesting STRICT JSON `{files:[{path, content}]}` for exactly the planned files → validate → **path-safety** (each path within the project dir; reject `..`, leading `/` or `\`) → materialize via `reg.invoke("fs.write_file")` with **real sha256 + line_count** → optional smoke via `reg.invoke("shell.run_in_workspace")`.
  - **Output:** `{ files_written:[{path, action, line_count, sha256(real)}], smoke:{ran, exit_code, stdout_tail, passed}, summary }`. `{ok:true}` envelope; errors in named fields; never throws.
- **Wiring:** at the BUILDER state in `iteration_controller.js`, after `role.invoke(builder)` returns the plan, call `builder.materialize` with plan+spec+design. The materializer's real files become the BUILDER state output; `BUILDER → RUN_TESTS` triggers on materializer SUCCESS. Materializer failure (unparseable codegen after retries, write/path-safety failure, or smoke fail) → does NOT advance (bounded retry or the existing reject-loop back to BUILDER).
- Provider/model backend-owned; codegen default `openai/gpt-4o` (interim; Anthropic later). The codegen call is governed by the existing vision-lock + budget gates.

### Why Path A (not Path B — CLI agent)
The spike proved Path A works with the existing tools and current provider. Path B (claude_code/aider) is blocked on `ANTHROPIC_API_KEY` (absent) + binary install. Path A is unblocked, Track-A-clean, provider-agnostic, and deterministically mock-testable. Path B stays available later as an alternative executor adapter.

## 3. Frozen scope
**In scope:** materializerEngine + `builder.materialize` tool + wiring at the BUILDER state + ≥5 deterministic SU scenarios + one real-provider Gate #10 build.
**Out of scope (deferred):** iterative MVP→review→refine (roadmap PHASE-10); COST_ESTIMATE / ENV_REPORT / TEST_DESIGN bridges; multi-file/complex projects beyond a single codegen call; ANY change to the builder role contract; Path B; changing any orchestration state other than BUILDER.

## 4. Closure gate (deterministic)
- SU baseline 137 → 137 + N (N ≥ 5), 0 fail. New mock scenarios prove:
  1. materialize happy path: plan(≥2 files) → all written → **real sha256 (≠ "pending")** → output schema valid.
  2. path-safety: a codegen path with `..` (or absolute) → rejected, FAILED, nothing written outside the project dir.
  3. codegen parse failure: non-JSON codegen after retries → FAILED `INVALID_CODEGEN`, no partial writes.
  4. BUILDER-state wiring (full-loop or segment, mock): loop reaches BUILDER → builder plan → materializer writes real files → transitions to RUN_TESTS.
  5. smoke-fail: materializer smoke exits non-zero → BUILDER does NOT advance.
- Track A grep clean on new files. §ARC ledger stays 8.
- **Gate #10 (real provider, owner):** one small spec built through BUILDER+materializer with real `gpt-4o` → real files on disk that RUN; owner opens the files + runs them + confirms output. Cost ≤ $1.
- decision artifact closed + checkpoint written + `progress/status.json` `phase_24`=CLOSED, `next_phase` updated.
- Mid-checkpoint after engine + tool + their unit scenarios pass, BEFORE iteration_controller wiring + full-loop scenario.

## 5. Track A & §ARC
- All side effects via `reg.invoke` (`agent.invoke`, `fs.write_file`, `shell.run_in_workspace`). No direct `fs.*Sync`/`child_process`/`fetch()`/`new OpenAI()` in new files.
- No new §ARC. Ledger stays 8. (Need one → STOP-AND-REPORT, decision-artifact-first.)

## 6. Cost
- SU scenarios: mock-only, $0. Gate #10: real `gpt-4o`, ≤ $1 (per-call budget_usd ≤ 0.50 on the codegen call; Windows + OPENAI_API_KEY via loadDotEnv; never sandbox). Kill bar $3.

## 7. Sequencing note (roadmap)
This redefines the PHASE-24 slot (was "COST_ESTIMATE bridge") to "BUILDER Materializer." COST_ESTIMATE / ENV_REPORT / TEST_DESIGN bridges deferred to later phases — the spike showed the BUILDER materializer is the core value and is now de-risked; bridges around an empty center are lower priority. The roadmap forward-index should reflect PHASE-24 = BUILDER Materializer.

## 8. Owner gate
Gate #10 is the closure gate, consistent with the "scenario green / real path broken" guard: green SU scenarios do NOT close the phase; the owner must see real files produced through the actual BUILDER+materializer path with a real provider, and run them.

---
## AMENDMENT 1 — 2026-06-08 (post-Step-0 verification; supersedes the noted clauses)

Two clauses in the original body were inaccurate and are corrected here (the original text is retained above for audit trail):

1. **§2 Wiring (SUPERSEDED).** The materializer is NOT wired in `iteration_controller.js`. Verified: `iteration_controller.js` executes no states — it contains only `checkCap`, `triggerEscalation`, `tryAdvanceForLoopBack` (loop-back cap + escalation). State execution uses per-state **bridge functions in `code/src/ai_os/conversationEngine.js`** (`confirmIdea`→ARCHITECT_DESIGN, `formalizeSpec`→SPEC_WRITER_FORMALIZE, `reviewSpec`→REVIEWER_SPEC). The BUILDER state gains a **new `buildProject()` bridge** in `conversationEngine.js`, mirroring `formalizeSpec`/`reviewSpec`: state guard (currentState==="BUILDER") → read `orchestration/<loopId>/spec.json` + `architect_design.json` via `reg.invoke("fs.read_file")` → `reg.invoke("role.invoke",{role_id:"builder",...})` → on SUCCESS `reg.invoke("builder.materialize",{...})` → on materialize SUCCESS `reg.invoke("orchestration.advance_state",{to_state:"RUN_TESTS",transition_type:"NORMAL",role_invoked:"builder"})`; any failure → `{ok:true, build_error:<code>, advanced:false}` (stays BUILDER, no auto-retry). The graph edge `BUILDER→RUN_TESTS` trigger "role.invoke(builder)→SUCCESS" is satisfied because `buildProject` invokes the builder role.

2. **§4 Baseline (SUPERSEDED).** The SU baseline is **264 total (Windows 259 pass / 0 fail / 5 skip; sandbox 251/8/5 — the 8 are the documented env-delta scenarios)**, NOT 137. Closure target with the 6 new scenarios (S267–S272): **270 total (Windows 265/0/5)**, 0 fail. All else in §4 stands.
---
