# TASK-062 — Autonomous Pipeline Orchestrator Contract

## Task
- Task ID: TASK-062
- Stage Binding: A
- Contract Type: AUTONOMOUS ORCHESTRATION
- Authority Level: HARD
- Status: EXECUTION-BOUND

---

## 1. Purpose

This contract defines the authoritative behavior
for the Forge Autonomous Pipeline Orchestrator.

The orchestrator is the governing runtime layer
that executes the full module flow automatically
under fail-closed rules.

Its purpose is to transform Forge from a manual task runner
into a deterministic, autonomous execution system
that can:

- detect project state
- select operating mode
- execute the pipeline in the correct order
- stop only when governance requires BLOCKED
- update status deterministically
- emit execution evidence
- produce final closure artifacts

This contract is binding.

No orchestration implementation may exist
outside this contract.

---

## 2. Scope

This contract applies to:

- runtime orchestration behavior
- autonomous run sequencing
- interaction with status tracking
- interaction with module engines
- BLOCKED handling
- manual override mode
- deterministic stop/resume behavior

This contract does NOT redefine the internal behavior
of existing engines.

The engines remain authoritative for their own logic:

- Intake
- Audit
- Trace
- Gap
- Decision Gate
- Backfill
- Execute
- Verify
- Closure

The orchestrator only governs execution order,
state transitions,
blocking rules,
and run control.

---

## 3. Architectural Position

Forge runtime MUST be understood
as two distinct layers.

### 3.1 Execution Layer
This layer contains the module engines:

- Intake
- Audit
- Trace
- Gap
- Decision Gate
- Backfill
- Execute
- Verify
- Closure

### 3.2 Orchestration Layer
This layer controls:

- start conditions
- mode detection usage
- execution sequencing
- fail-closed stop behavior
- run continuation rules
- status progression
- final run completion

The Autonomous Pipeline Orchestrator
sits above the execution engines.

It does not replace them.

It governs them.

---

## 4. Official Operating Modes

Forge MUST support exactly two orchestration modes.

### 4.1 Autonomous Run Mode
This is the official primary operating mode.

In this mode,
Forge starts from runtime entry,
determines the correct execution path,
and runs the full pipeline automatically.

The user MUST NOT be required
to manually assign every task transition.

### 4.2 Manual Controlled Mode
This is a secondary fallback mode.

It exists only for:

- debugging
- recovery
- partial rerun
- deterministic inspection
- governance-controlled intervention

Manual Controlled Mode MUST NOT be treated
as the default final runtime model of Forge.

---

## 5. Default Runtime Authority

Forge MUST treat Autonomous Run Mode
as the authoritative normal execution mode.

Manual Controlled Mode is allowed,
but only as an override path.

If both modes exist,
Autonomous Run Mode has primary authority.

---

## 6. Pipeline Order (Hard)

The Autonomous Pipeline Orchestrator
MUST execute the module flow
in exactly the following order:

1. Intake
2. Audit
3. Trace
4. Gap
5. Decision Gate
6. Backfill
7. Execute
8. Verify
9. Closure

No reordering is permitted.

No skipping is permitted.

No implicit insertion of extra stages is permitted
unless explicitly defined by a future contract.

---

## 7. Start Behavior

On runtime start,
the orchestrator MUST:

1. read authoritative status
2. determine whether the run is autonomous or manual
3. validate that runtime start is allowed
4. determine the correct entry point
5. execute the next valid module in sequence

The orchestrator MUST NOT assume
that chat state,
operator memory,
or prior discussion
has any authority.

Only repository state
and authoritative artifacts
may be used.

---

## 8. Source of Truth

For orchestration,
the source of truth MUST be limited to:

- progress/status.json
- authoritative artifacts already generated
- repository state
- contracts/docs already inside the repository
- module output artifacts produced during the run

The orchestrator MUST NOT rely on:

- previous chat messages
- implied human intent
- guessed continuation state
- inferred hidden execution progress

---

## 9. Entry Resolution Rules

The orchestrator MUST determine
the correct execution entry point
using repository state and status.

### 9.1 Fresh Start
If no authoritative module-flow execution exists,
the orchestrator MUST start from Intake.

### 9.2 Partial Progress
If authoritative progress exists,
the orchestrator MUST resume
from the next valid module after the last completed step.

### 9.3 Invalid Resume State
If status claims a state
that is inconsistent with required artifacts,
the orchestrator MUST enter BLOCKED.

It MUST NOT guess a repair path silently.

---

## 10. Relationship with Intake

The orchestrator MUST treat Intake
as the authoritative mode detection entry.

Operating mode is determined by Intake.

The orchestrator MUST NOT independently invent
BUILD or IMPROVE mode.

It may only read and obey
the mode established by Intake artifacts.

---

## 11. BUILD / IMPROVE Handling

After Intake produces authoritative mode,
the orchestrator MUST carry that mode forward
through the remaining pipeline.

If any downstream module output
contradicts the authoritative Intake mode,
the orchestrator MUST enter BLOCKED.

It MUST NOT silently reconcile mode conflicts.

---

## 12. Status Governance

The orchestrator MUST update progress/status.json
deterministically through the existing status writing mechanism.

Status updates MUST reflect:

- current_stage
- stage_progress_percent
- last_completed_artifact
- current_task
- issues
- blocking_questions
- next_step

No direct uncontrolled mutation is permitted.

All status writes MUST pass through
the authoritative status bridge.

---

## 13. current_task Policy

In Autonomous Run Mode,
`current_task` MAY still exist,
but it becomes an internal execution trace field,
not the primary control mechanism.

This means:

- the orchestrator may set `current_task`
  to the task currently being executed
- but the human operator MUST NOT be required
  to manually populate it for normal execution
- the orchestrator itself becomes responsible
  for moving from one task to the next

---

## 14. next_step Policy

`next_step` MUST remain informative,
not authoritative.

The orchestrator may write `next_step`
to describe the upcoming action,
but execution authority belongs to the orchestrator logic itself,
not to a human manually reading and editing `next_step`.

---

## 15. BLOCKED Rules (Hard)

The orchestrator MUST enter BLOCKED immediately if:

- a required artifact is missing
- a required artifact is invalid
- a module returns blocked=true
- a governance rule is violated
- mode integrity is broken
- sequencing integrity is broken
- multiple valid paths exist
- an ambiguity requires a human decision
- a task resume state is inconsistent
- a contract requires explicit confirmation

When BLOCKED:

- execution MUST stop immediately
- only one blocking question may be surfaced
- no additional execution is allowed
- no silent fallback is allowed
- no auto-repair is allowed unless explicitly contracted

---

## 16. Single Blocking Question Rule

If the orchestrator enters BLOCKED due to ambiguity,
it MUST surface exactly one blocking question.

It MUST NOT present:

- multiple simultaneous questions
- alternative execution suggestions
- optional branches
- speculative fixes

Execution remains halted
until that one blocking condition is resolved.

---

## 17. Fail-Closed Rule

The orchestrator MUST be fail-closed.

If anything required for safe continuation is missing,
unclear,
or contradictory,
execution MUST stop.

Forge MUST prefer stopping
over continuing on assumption.

---

## 18. Manual Controlled Mode Rules

Manual Controlled Mode remains allowed,
but under the following restrictions:

- it may execute one task at a time
- it must still obey pipeline order
- it must still obey fail-closed rules
- it must not bypass Verify
- it must not bypass Closure
- it must not alter authoritative contracts
- it must not skip required artifacts

Manual mode is an override path,
not a governance bypass.

---

## 19. Resume Behavior

The orchestrator MUST support deterministic resume.

A resumed run MUST:

- read authoritative status
- verify artifact continuity
- verify that the next required module is unambiguous
- continue only from the correct next step

The orchestrator MUST NOT restart arbitrarily
unless status and artifacts require restart.

---

## 20. Verify Dependency Rule

Closure MUST NEVER execute
unless Verify has already completed successfully
within the authoritative run.

The orchestrator MUST enforce this rule.

If Verify artifacts are missing,
invalid,
or not PASS,
Closure MUST NOT run.

---

## 21. Closure Dependency Rule

Closure is the final deterministic gate.

The orchestrator MUST treat Closure
as the terminal execution step.

After successful Closure:

- current_task MUST be cleared
- final status MUST reflect completion
- final release artifacts MUST exist
- no further pipeline step may auto-execute
  unless defined by a future contract

---

## 22. Deterministic Run Report

Each autonomous orchestration run
MUST produce explicit orchestration evidence.

At minimum,
the orchestrator layer MUST emit artifacts covering:

- run identifier
- start time
- resolved mode
- execution path
- modules attempted
- modules completed
- blocked status if any
- final outcome
- authoritative status snapshot linkage

Artifact naming may be finalized in later stages,
but the requirement itself is HARD.

---

## 23. Orchestration State Artifact

The orchestrator MUST produce
a machine-readable state artifact
representing the current autonomous run state.

This artifact MUST support:

- deterministic resume
- deterministic audit
- deterministic verification of run path

The exact schema may be defined in Stage B / Stage C,
but the requirement is mandatory.

---

## 24. Human Interaction Policy

The orchestrator MUST minimize human intervention.

Human action is allowed only when:

- a contract explicitly requires a decision
- ambiguity creates multiple valid paths
- governance requires confirmation
- the system is BLOCKED

Outside these cases,
Forge MUST continue autonomously.

---

## 25. No Hidden State Rule

The orchestrator MUST NOT depend on hidden runtime memory
as the only continuation source.

All continuation-critical state
must be recoverable from authoritative repository artifacts
and status.

If a process dies,
resume must still be possible
without relying on invisible in-memory state.

---

## 26. Idempotency Rule

The orchestrator MUST preserve idempotency guarantees.

This includes:

- not recreating closed task artifacts silently
- not re-running completed steps without explicit authority
- not mutating prior closure artifacts
- not overwriting immutable release evidence improperly

If rerun is required,
the rerun path must be explicit and governed.

---

## 27. Compatibility with Existing Runtime

The orchestrator MUST be layered
on top of the existing runtime,
not introduced as an uncontrolled parallel system.

It must remain compatible with:

- status_writer
- runner
- task_executor
- task_registry
- existing closure artifact model
- existing fail-closed status governance

If new runtime entrypoints are introduced,
they must still obey existing authority rules.

---

## 28. Forbidden Behavior

The Autonomous Pipeline Orchestrator MUST NOT:

- skip modules
- reorder modules
- ignore BLOCKED
- bypass Verify
- bypass Closure
- invent operating mode
- invent completion state
- silently repair contradictions
- continue through ambiguity
- rely on chat-declared state
- mutate immutable evidence casually
- replace manual mode with unsafe shortcuts

---

## 29. Required End State

Forge reaches Autonomous Orchestration Compliance only when:

- Autonomous Run Mode exists
- Manual Controlled Mode still exists as fallback
- the orchestrator drives the full pipeline automatically
- pipeline order is enforced
- BLOCKED behavior is enforced
- deterministic status updates are enforced
- Verify is enforced before Closure
- Closure remains terminal
- orchestration evidence is emitted
- resume behavior is deterministic

Until then,
Forge remains partially complete
as an engine-capable system,
but not fully complete
as an autonomous pipeline system.

---

## 30. Stage A Deliverable Meaning

Completion of TASK-062 Stage A means only this:

- the orchestrator authority has been formally defined
- the required behavior has been locked
- future implementation must conform to this contract

It does NOT mean:

- the orchestrator is already implemented
- autonomous run already exists
- current manual runtime is deprecated
- the pipeline is already self-driving

---

## 31. Next Required Stage

After this contract,
the next required step MUST be:

- Stage B: orchestration gap analysis

That analysis MUST compare:

- this contract
- current runner/task/status architecture
- actual autonomous capabilities present today
- the missing pieces required for compliance

No direct implementation should begin
before that analysis is closed.

---

## 32. Final Rule

Forge MUST evolve into:

**Autonomous Deterministic Pipeline with Manual Override**

and MUST NOT remain permanently as:

**Manual Task Runner with Detached Engines**

This is the authoritative target model.

---