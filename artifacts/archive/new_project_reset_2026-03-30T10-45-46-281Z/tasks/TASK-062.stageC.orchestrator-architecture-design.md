# TASK-062 — Stage C Architecture Design
Autonomous Pipeline Orchestrator

## Purpose

This document defines the implementation architecture
for the Forge Autonomous Pipeline Orchestrator.

It translates the Stage A contract
and the Stage B gap analysis
into a concrete runtime design
that can later be implemented safely.

This document is design-binding.

It does NOT yet implement code.

---

# 1. Design Objective

The design objective is to introduce
an orchestration layer above the existing module engines
so that Forge can execute the full module flow
autonomously and deterministically.

The orchestrator must:

- start from authoritative repository state
- determine the correct entry point
- execute the next valid module automatically
- stop immediately on BLOCKED
- preserve fail-closed behavior
- preserve deterministic status updates
- preserve manual override mode
- remain compatible with the existing runtime

---

# 2. Existing Runtime to Preserve

The following existing runtime components remain authoritative
and MUST be preserved:

- `code/src/orchestrator/status_writer.js`
- `code/src/orchestrator/runner.js`
- `code/src/execution/task_executor.js`
- `code/src/execution/task_registry.js`

The orchestrator layer MUST be added on top of these components.

It must not replace them with a parallel uncontrolled runtime.

---

# 3. High-Level Runtime Model

Forge runtime will consist of two execution modes.

## 3.1 Manual Controlled Mode
This mode remains available.

It continues to use:

- `progress/status.json`
- `current_task`
- `runner.js`

This mode is used for:

- debug
- partial rerun
- deterministic recovery
- controlled intervention

## 3.2 Autonomous Run Mode
This is the new primary mode.

This mode introduces an orchestration controller
that determines and runs the pipeline automatically.

This mode becomes the default intended execution model of Forge.

---

# 4. New Runtime Components Required

The design introduces the following new components.

## 4.1 Pipeline Definition Module

A dedicated runtime module must define the authoritative pipeline order.

Proposed file:

- `code/src/orchestrator/pipeline_definition.js`

Responsibilities:

- define ordered module sequence
- define task name for each module
- define terminal step
- define sequencing rules

Minimum data model:

- module_id
- task_name
- ordinal_position
- required_previous_module
- terminal_flag

---

## 4.2 Entry Resolution Module

A dedicated runtime module must determine
where the autonomous run should start or resume.

Proposed file:

- `code/src/orchestrator/entry_resolver.js`

Responsibilities:

- read `progress/status.json`
- inspect authoritative artifacts
- determine whether the run is:
  - fresh
  - resumed
  - complete
  - blocked
  - invalid
- determine the next correct module

Outputs:

- run_mode
- entry_type
- next_module
- next_task
- blocked_flag
- blocking_reason if any

---

## 4.3 Autonomous Orchestrator Controller

A dedicated runtime controller must execute the pipeline automatically.

Proposed file:

- `code/src/orchestrator/autonomous_runner.js`

Responsibilities:

- start autonomous run
- call entry resolver
- set current task internally
- invoke existing runner/task execution path
- evaluate result after each task
- continue to the next module if safe
- stop on BLOCKED
- stop on final Closure success

This controller MUST use the existing execution chain,
not bypass it.

Target execution path:

Autonomous Runner
→ entry_resolver
→ runner/task bridge
→ task_executor
→ task_registry
→ module engine

---

## 4.4 Orchestration State Artifact

A machine-readable artifact must represent
the orchestration state of the current autonomous run.

Proposed file:

- `artifacts/orchestration/orchestration_state.json`

Purpose:

- deterministic resume
- run audit
- run traceability
- failure recovery

Minimum fields:

- run_id
- run_mode
- started_at
- last_updated_at
- operating_mode if known
- entry_type
- current_module
- completed_modules
- pending_modules
- blocked
- blocking_reason
- final_outcome

---

## 4.5 Orchestration Run Report Artifact

A human-readable artifact must summarize the autonomous run.

Proposed file:

- `artifacts/orchestration/orchestration_run_report.md`

Purpose:

- explain what the orchestrator did
- show execution path
- record stop reason
- record final outcome

Minimum sections:

- run identity
- entry resolution result
- execution path
- module outcomes
- blocked state if any
- final result

---

# 5. Central Pipeline Definition

The pipeline definition MUST encode the official order exactly as follows:

1. Intake
2. Audit
3. Trace
4. Gap
5. Decision Gate
6. Backfill
7. Execute
8. Verify
9. Closure

Suggested mapping:

- Intake → `TASK-047: MODULE FLOW — Intake`
- Audit → `TASK-048: MODULE FLOW — Audit`
- Trace → `TASK-050: MODULE FLOW — Trace`
- Gap → `TASK-051: MODULE FLOW — Gap`
- Decision Gate → `TASK-052: MODULE FLOW — Decision Gate`
- Backfill → `TASK-053: MODULE FLOW — Backfill`
- Execute → `TASK-054: MODULE FLOW — Execute`
- Verify → `TASK-061: MODULE FLOW — Verify`
- Closure → `TASK-055: MODULE FLOW — Closure`

This mapping becomes authoritative for autonomous execution.

---

# 6. Entry Resolution Design

The resolver must support exactly these entry states.

## 6.1 FRESH
Used when no authoritative module-flow completion exists.

Next step:
- Intake

## 6.2 RESUME
Used when part of the module flow is already complete
and the next step is determinable unambiguously.

Next step:
- the first incomplete valid module

## 6.3 COMPLETE
Used when Closure is already complete
and no further pipeline action is required.

Next step:
- none

## 6.4 BLOCKED
Used when continuation is unsafe or ambiguous.

Examples:
- required artifact missing
- status contradicts artifacts
- more than one valid next path
- Verify missing before Closure
- invalid resume state

Next step:
- none

## 6.5 INVALID
Used when repository/runtime state is internally contradictory.

This must be treated as BLOCKED by execution.

---

# 7. Resume Logic

Resume logic must use authoritative evidence,
not assumptions.

The resolver must inspect at minimum:

- `progress/status.json`
- `artifacts/tasks/*.execution.closure.md`
- required module artifacts for each step
- final release artifacts where relevant

Recommended rule:

A module is considered complete only if:

1. its task execution closure exists
2. its required module artifact(s) exist
3. no downstream contradiction invalidates completion

Example:

Verify is not considered complete only because
`artifacts/verify/verification_report.md` exists.

It also requires:

- `artifacts/verify/verification_results.json`
- `artifacts/tasks/TASK-061.execution.closure.md`

---

# 8. Task Advancement Strategy

The orchestrator must not manually execute module functions directly.

Instead it must advance execution using the existing runtime bridge.

Recommended sequence for each autonomous step:

1. resolve next task
2. write `current_task` into status
3. write informative `next_step`
4. invoke the existing `runner.js` logic
5. reload authoritative status
6. inspect result
7. continue or stop

This preserves compatibility with existing runtime governance.

---

# 9. BLOCKED Handling Design

The autonomous runner must enforce centralized stop behavior.

If any executed step returns a blocked state,
the autonomous runner must:

1. stop immediately
2. persist orchestration state
3. persist run report
4. surface exactly one blocking question
5. avoid scheduling another task

The autonomous runner must never continue
after a blocked result.

---

# 10. Manual Mode Compatibility

Manual mode remains fully supported.

Design rule:

Autonomous mode must be additive,
not destructive.

This means:

- `runner.js` remains usable
- `task_registry.js` remains usable
- direct task execution remains possible
- debug reruns remain possible

But manual mode no longer represents the target end-state of Forge.

---

# 11. Status Update Design

Status remains authoritative,
but autonomous mode changes who drives it.

In manual mode:
- the operator sets `current_task`

In autonomous mode:
- the orchestrator sets `current_task`

Status continues to be written only through:

- `status_writer.js`

No uncontrolled direct writes are permitted.

Recommended autonomous status pattern:

Before step:
- set `current_task` = resolved task
- set `next_step` = informative statement

After step success:
- preserve task result updates
- clear `current_task` if runner clears it
- determine next step

After final completion:
- `current_task` = empty
- `next_step` = final READY statement

---

# 12. Orchestration State Schema Design

Proposed machine-readable structure:

```json
{
  "run_id": "AUTO_RUN_001",
  "run_mode": "AUTONOMOUS",
  "entry_type": "RESUME",
  "started_at": "ISO-8601",
  "last_updated_at": "ISO-8601",
  "operating_mode": "BUILD",
  "current_module": "Verify",
  "completed_modules": ["Intake", "Audit", "Trace", "Gap", "Decision Gate", "Backfill", "Execute"],
  "pending_modules": ["Verify", "Closure"],
  "blocked": false,
  "blocking_reason": "",
  "final_outcome": ""
}
```

This schema may evolve,
but these fields represent the minimum required state.

# 13. Run Report Design

The report should be markdown and include:

Header

run_id

mode

entry_type

started_at

ended_at if known

Entry Resolution

fresh / resume / complete / blocked

why

Execution Path

module-by-module list

task names

outcome

Final State

completed

blocked

already complete

Status Snapshot Linkage

reference to final progress/status.json

reference to task closures generated or reused

# 14. Completion Rules

An autonomous run is considered successful only if:

entry resolution is valid

all modules execute in order

Verify passes

Closure succeeds

final status is written

orchestration state artifact is written

orchestration report artifact is written

If any of the above is missing,
the autonomous run is not complete.

# 15. Idempotency Design

The autonomous orchestrator must respect existing idempotency rules.

Design requirement:

The orchestrator must detect already-completed modules
and avoid rerunning them unless an explicit governed rerun path exists.

This is especially important for:

task execution closures

Verify

Closure

release artifacts

The default autonomous behavior is:

resume safely

do not blindly rerun completed steps

# 16. Runtime Entrypoint Design

A dedicated entrypoint should be introduced for autonomous execution.

Proposed file:

bin/forge-autonomous-run.js

Responsibilities:

load environment

call autonomous runner

print final outcome

This entrypoint must not replace the existing manual entrypoint.
It complements it.

# 17. Final Architecture Decision

The preferred architecture is:

Autonomous Controller layered over existing task runtime

and NOT:

New direct pipeline executor bypassing existing runtime

Reason:

preserves current governance

preserves determinism

preserves artifact generation behavior

reduces implementation risk

keeps manual fallback intact

# 18. Implementation Sequence

The implementation should proceed in the following order:

pipeline_definition.js

entry_resolver.js

orchestration artifact writer helpers if needed

autonomous_runner.js

autonomous CLI entrypoint

runtime validation

deterministic resume validation

No alternative order is preferred at this stage.

# 19. Main Risks
Risk-01

Resume logic may misclassify partially completed module states.

Mitigation:

require both closure artifact and module outputs

Risk-02

Autonomous mode may accidentally bypass existing governance.

Mitigation:

force execution through current runner/task bridge

Risk-03

State/report artifacts may become non-authoritative noise.

Mitigation:

define minimal required schemas and strict write rules

Risk-04

Manual mode may drift from autonomous mode behavior.

Mitigation:

keep both modes on the same execution chain

# 20. Conclusion

Forge is now ready for orchestrator implementation.

The engines already exist.
The runtime bridge already exists.
The missing layer is now fully designed.

What remains is implementation of:

central pipeline definition

entry resolver

autonomous controller

orchestration artifacts

autonomous entrypoint

This design is sufficient to begin Stage D implementation.

# 21. Next Step

Next required step:

TASK-062 — Stage D Implementation

That stage should implement the orchestrator
according to this design
without bypassing existing runtime governance.