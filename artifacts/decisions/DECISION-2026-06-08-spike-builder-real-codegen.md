# DECISION — Spike: BUILDER Real Code Generation (generate → materialize → run)

- **Decision ID:** DECISION-2026-06-08-spike-builder-real-codegen
- **Type:** Spike (de-risking; throwaway; NOT a phase)
- **Status:** APPROVED (owner) / PENDING EXECUTION
- **Date:** 2026-06-08
- **Author:** CTO advisor (chat)
- **Owner approval:** Khaled — "موافق على توصياتك طالما باعلى درجات الاحترافية"
- **Precedes:** PHASE-24 (COST_ESTIMATE bridge) — intentionally sequenced before further bridges
- **Runs on:** Owner's Windows machine with OPENAI_API_KEY set (NOT the sandbox)

## 1. Why this spike, before PHASE-24
The single most valuable and least-proven capability in the pipeline is "turn a spec into a real, runnable application." Eight further bridges sit on top of it. If real code generation is not viable, those bridges wire a pipeline around a hollow center. We de-risk the center first, for ≤ $1, before investing weeks in bridges.

## 2. Finding that motivates the spike (verified from code at HEAD c13c564, 2026-06-08)
- `builder_role.js` calls `reg.invoke("agent.invoke", …)`, parses the returned JSON text, and validates it against an OUTPUT_SCHEMA requiring `files_written[]` with `{path, action, line_count, sha256}` — **no `content` field**.
- `builder_v1` is explicit: *"You are a PLANNER, not an executor. You describe files — you do not write their code content. The actual file writing is performed by the orchestration layer after your output is approved."* `sha256` is always the literal string `"pending"`.
- API adapters (`openai_adapter.js`, `anthropic_adapter.js`) return `output.text` only — **they write no files**. CLI adapters (`claude_code_adapter.js`, `aider_adapter.js`) shell out to external coding binaries that DO write files, but need those binaries installed + an Anthropic key (absent).
- **No "orchestration layer" component exists that turns the builder's plan into real files on disk.** S152 (full-loop) is mock-only; the builder has never run end-to-end against a real provider.
- The vision-lock gate for non-mock `agent.invoke` is `agent_budget_rule.js` **Section A** ("Vision lock, non-mock only, §2-D10"), which calls `readVisionSync(project_id)`. It has never fired on a real call — all prior runs were mock-skipped. (`vision_lock_rule.js` is a separate rule guarding only `docs/` writes.)
- **Conclusion:** end-to-end, Forge today produces a *description* of an application, not a working one. The "executor that writes real files" is not yet built for the API-provider path. This is the gap the spike measures.

## 3. Goal
Prove, on the owner's machine, with openai/gpt-4o, that:
(a) the BUILDER role runs end-to-end against a real provider and returns a schema-valid plan (first real-provider builder invocation), and
(b) a minimal generate → materialize → run loop produces REAL files on disk that actually execute and emit correct output.

## 4. Scope
### In scope
- **Part 1 (diagnostic, real):** one real `role.invoke` of `builder` (provider=openai, gpt-4o, project_id="spike_builder") on a trivial spec. Confirm SUCCESS + schema-valid plan; confirm `sha256:"pending"`; confirm NO source files written to disk.
- **Part 2 (vertical slice, real):** a standalone throwaway harness that (1) asks gpt-4o (via the existing `openai` adapter through `reg.invoke("agent.invoke")`) for a trivial program as JSON `{ files: [ { path, content } ] }` WITH real code content — a spike-local prompt that does NOT use or modify `builder_v1`, and that constrains run.js to print ONLY the bare integer result; (2) materializes each file via `reg.invoke("fs.write_file")`; (3) executes via `reg.invoke("shell.run_in_workspace",{argv:["node","run.js"]})`; (4) asserts it ran and produced the expected output.
### Out of scope (explicitly NOT done)
- No change to `builder_role.js`, `builder_v1`, the output schema, the pipeline graph, any role, any closed-phase code, or `status.json` phase fields.
- No new endpoint, no UI change.
- No decision on the final architecture (content-materializer vs CLI-agent) — SEPARATE post-spike decision + phase.
- No CLI-agent path (claude_code/aider) — Anthropic key absent; deferred.

## 5. Success criteria (deterministic)
- **Part 1:** `role.invoke(builder, openai/gpt-4o)` → `status:"SUCCESS"`, validates OUTPUT_SCHEMA, every entry `sha256:"pending"`, AND `fs.exists`/`fs.glob` confirms none of the planned source files exist on disk.
- **Part 2:** `fs.exists` confirms BOTH `add.js` and `run.js` exist under `artifacts/projects/spike_builder/`; `shell.run_in_workspace(["node","run.js"])` → `exit_code === 0` and `stdout.trim() === "5"`. Spike PASS only if all hold; else INCONCLUSIVE/FAIL with captured reason.
- Pre-flight: `readVisionSync("spike_builder").vision_locked === true` confirmed before any real call (§0.4).
- Evidence to `artifacts/spikes/builder_real_codegen/run_<ts>/`: raw gpt-4o responses (both parts), materialized file contents, shell stdout/stderr/exit_code, assertion results, actual_usd (from `agent.read_ledger`).

## 6. Track A compliance
- All side effects via `reg.invoke` (agent.invoke, role.invoke, fs.write_file, fs.read_file, fs.exists/fs.glob, shell.run_in_workspace, agent.read_ledger).
- No direct `fs.*Sync`, `child_process`, `fetch()`, or `new OpenAI()` in the harness.
- **No new §ARC exception. Ledger stays at 8.**
- Harness lives under `scripts/spikes/` (throwaway, outside production runtime).

## 7. Cost
- **Cap ≤ $1.00** total (two small gpt-4o calls on a trivial spec). Per-call `budget_usd` ≤ 0.50.
- Kill bar $3.00. Approaching cap → STOP-AND-REPORT.
- Mock not applicable: the spike's purpose is a real-provider run. Real calls on Windows with `OPENAI_API_KEY`, never the sandbox.

## 8. Prerequisites (satisfied in Step 0, surfaced before GO)
- Throwaway project `spike_builder` (**canonical id — NO leading underscore**) with a LOCKED vision (`vision_locked: true`). Canonical id is required because `normalizeProjectId` strips a leading underscore (workspaceHelpers.js:753), so a literal `_spike_builder` dir would split from Forge's normalized reads; the non-mock `agent.invoke` gate (`agent_budget_rule.js` Section A) reads `readVisionSync(project_id)` and a mismatch → `VISION_NOT_FOUND` → DENIED. Empirically: `readVisionSync("spike_builder")` finds a locked vision; `readVisionSync("_spike_builder")` returns NOT_FOUND. Template frontmatter from `_reference_todo_api/vision.md`. **Do NOT touch `_reference_todo_api` or `_s150_abort_test`.**
- §0.4 pre-flight: confirm `readVisionSync("spike_builder").vision_locked === true` before the first real call.
- Permission mode `WORKSPACE_WRITE` (fs.write_file + shell.run_in_workspace both require it; spike writes are under `artifacts/projects/spike_builder/`, not `docs/`).
- Project budget permits ≤ $1. `OPENAI_API_KEY` set in the Windows env.

## 9. What the spike decides — and does NOT
- **Decides:** whether real, runnable code generation + materialization + execution is viable today with a real provider. PASS → green light to design the materialization architecture. FAIL/INCONCLUSIVE → stop and rethink BUILDER before any further bridge.
- **Does NOT decide:** the final BUILDER architecture. The follow-on decision chooses between (A) evolving BUILDER to return content + a Forge-native materializer step (provider-agnostic, Track-A, deterministic, mock-testable) and (B) adopting a CLI coding-agent (claude_code/aider) as executor (needs binary + Anthropic key). The spike's evidence informs that choice.

## 10. Rollback / cleanup
Throwaway by construction. Revert = delete `scripts/spikes/builder_real_codegen*`, `artifacts/projects/spike_builder/`, `artifacts/spikes/builder_real_codegen/`. No production code or closed-phase artifact touched. Decision artifact retained for audit.

## 11. Owner gate
The spike result is reported with captured evidence. The owner reviews Part 2's real on-disk files + execution output (the Gate #10 analogue). Not "done" on green assertions alone — consistent with the "scenario green / real path broken" guard.
