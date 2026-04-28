# Tech Assumptions & Local Runtime Setup

**Document ID:** DOC-10  
**Status:** FINAL — EXECUTION-BOUND  
**Scope:** Engineering Foundations & Local Execution  
**Applies To:** Forge
**Enforcement Level:** Hard (Fail-Closed)

---

## 1. Purpose

This document defines the **non-negotiable technical assumptions** and the **local runtime setup** required to execute Forge.

Its purpose is to:
- Eliminate ambiguity in environment setup
- Prevent environment-related execution failures
- Ensure deterministic, repeatable pipeline behavior
- Allow long-running autonomous execution without human intervention

No pipeline stage may execute unless this document is satisfied.

---

## 1.1 Runtime Readiness Gate (Hard Stop)

Runtime readiness is an absolute,
non-negotiable execution prerequisite.

If ANY requirement in this document is:
- Missing
- Invalid
- Unverified
- Ambiguous

Then:

- Execution MUST NOT start
- No pipeline stage may initialize
- No execution-stage artifact may be generated
- No partial execution is allowed

The ONLY permitted artifact emission under readiness failure is:
- the single Runtime Readiness Failure Artifact defined in Section 1.1.0

This condition constitutes an Execution Abort,
NOT a Decision,
unless multiple valid remediation paths exist.

In a Runtime Readiness Execution Abort:

- The pipeline MUST halt immediately
- The failure reason MUST be logged via Section 1.1.0
- No retries are permitted
- No defaults may be inferred
- No auto-repair is allowed
- Human escalation is REQUIRED

Proceeding with execution
under degraded or assumed readiness
is a critical system violation.

---

### 1.1.0 Runtime Readiness Failure Artifact (Hard)

Any Runtime Readiness failure MUST produce exactly ONE structured failure artifact at:

`verify/audit/READINESS-FAIL-<YYYYMMDD>-<HHMMSSZ>.json`

Rules:
- JSON format ONLY
- No narrative explanation
- Immutable once written
- Filename MUST be unique per failure event
- No overwrite is permitted

Minimum required fields:
- readiness_id
- timestamp_utc
- failed_check (single string)
- failure_code
- short_reason (factual, non-narrative)
- required_human_action ("MISSING_INPUT" | "FIX_ENVIRONMENT" | "NONE")
- stage ("PRE-START")

This artifact has ZERO execution authority.
It exists only to justify Execution Abort and human escalation.

---

### 1.1.1 Runtime Readiness Supremacy Rule (Hard)

Runtime readiness is an absolute prerequisite
for ANY execution.

If readiness validation fails:
- No pipeline stage may start
- No artifact may be generated
- No partial initialization is allowed
- No background recovery is permitted

Any attempt to proceed
despite failed readiness
is a critical system violation.

---

## 2. Core Technical Assumptions

### 2.1 Execution Model

- The system operates as a **local-first autonomous pipeline**
- Execution is **long-running** (hours or days)
- The pipeline must survive:
  - Process restarts
  - Partial failures
  - Temporary resource exhaustion

The system may resume runtime ONLY when ALL are true:

- `artifacts/forge/forge_state.json` exists and is schema-valid for Forge self-build continuity, AND
- `artifacts/orchestration/orchestration_state.json` exists and is schema-valid for current-run continuity when a governed run is already in progress, AND
- Startup validation confirms repository structure and required governance docs, AND
- Execution state derived deterministically from governed runtime artifacts is exactly ONE of:
  - RUNNING, OR
  - BLOCKED

`progress/status.json` MAY exist and MAY be validated as a reflection artifact,
but it MUST NOT be used as the source of resume authority.

If state is BLOCKED:
- The runtime MAY start in a non-executing mode
- The pipeline MUST NOT advance any stage
- No artifact generation is permitted
- The only permitted action is to expose status (Doc-06)
  until the block is resolved via the authorized control path

The system MUST NOT resume when execution state is:
- ABORTED, OR
- COMPLETED

If the authoritative state cannot be loaded, validated,
or is classified as ABORTED or COMPLETED:

- Execution MUST NOT resume
- No reconstruction is allowed
- Runtime readiness MUST FAIL

---

### 2.2 Human Role Assumption

- Human (Owner) is:
  - NOT continuously available
  - NOT required for routine decisions
- Human intervention is allowed **only** via:
  - Explicit Interrupt Protocol (see Doc 4)
  - Status / Progress queries
  - Missing data or hard ambiguity cases

---

## 2.3 Offline & Network Assumptions

The pipeline MUST be capable of execution
without continuous network availability.

Offline-capable execution includes ONLY:
- Document generation
- Specification drafting
- Code generation
- Structural repository validation

External dependencies:
- MUST NOT be assumed available
- MUST fail deterministically
- MUST NOT be required for offline-capable artifact generation

If an external dependency is REQUIRED
for ANY mandatory stage gate
(e.g., verification, audit, fetch, signing, publishing):

- The dependency MUST be explicitly declared
  in an authoritative contract or stage specification
- Runtime readiness MUST FAIL if the dependency is unavailable
- Execution MUST NOT start under assumed availability

Implicit reliance on network availability
or external services
is strictly forbidden.

---

## 3. Supported Operating Environment

### 3.1 Operating System

Supported:
- Windows 10 / 11 (Primary)
- macOS (Secondary)
- Linux Ubuntu 20.04+ (Optional)

Assumption:
- System runs on a **developer-controlled machine**
- No cloud-only dependency is allowed

---

### 3.2 Runtime Stack

Mandatory runtimes:

- Node.js: **v20.x**
- npm: **v10+**
- Python: **v3.10+** (optional, but supported)
- Git: Latest stable

All runtimes must be installed locally and available via CLI.

---

## 4. Project Directory Structure (Mandatory)

All projects MUST follow the repository layout defined EXCLUSIVELY in:

Artifact Schema & Repository Layout Standard (Doc-05)

This document does NOT redefine layout rules.
It enforces them as a runtime readiness prerequisite.

Startup validation MUST verify that:
- All required directories exist
- No required directory is missing
- No critical path is renamed
- `progress/status.json` exists and is writable (unless execution is ABORTED or COMPLETED)

Any deviation from Doc-05 layout is a hard failure
and MUST trigger Runtime Readiness failure.

---

### 4.1 Progress History Non-Authority Clarification (Hard)

Files under:
`progress/history/`

- Have ZERO execution authority
- MUST NOT be read, parsed, or interpreted by runtime
- MUST NOT influence execution, recovery, or decision logic
- Exist solely for human audit and post-mortem analysis

Any runtime behavior that reads or depends on
`progress/history/*`
constitutes a critical authority violation.

---

## 5. Environment Configuration

### 5.0.1 Environment Authority Lock (Hard)

All environment configuration MUST be:
- Explicit
- Declared
- Verifiable

The runtime MUST NOT:
- Infer missing configuration
- Generate defaults silently
- Repair configuration automatically

If required configuration is missing
or invalid:
- Execution MUST halt
- Runtime readiness MUST FAIL
- Human escalation is REQUIRED

---

### 5.1 Environment Variables

All secrets and configuration values MUST be provided via environment variables.

Minimum required variables:

PIPELINE_MODE=autonomous
PIPELINE_MAX_RETRIES=3
PIPELINE_FAIL_STRATEGY=fail-closed
PIPELINE_OWNER_ID=<stable_owner_id>

Rules:
- No secrets in code
- No secrets in documents
- No secrets in logs
- `PIPELINE_OWNER_ID` MUST be:
  - present, AND
  - non-empty, AND
  - stable across runs, AND
  - treated as an opaque identifier (no inference)

If any required variable is missing, empty, or malformed:
- Runtime readiness MUST FAIL
- Execution MUST NOT start
- No defaults may be inferred

---

### Cognitive Engine Selection Variables (Hard)

The following variables define how Cognitive Engine configuration is selected.

COGNITIVE_ENGINE_MODE=MANUAL|AUTO
COGNITIVE_ENGINE_SCOPE=SYSTEM|STAGE|TASK   (REQUIRED if MODE=MANUAL)

Rules:

- `COGNITIVE_ENGINE_MODE` MUST be present.
- MUST equal exactly: MANUAL or AUTO.
- No default may be inferred.

If `COGNITIVE_ENGINE_MODE=MANUAL`:
- `COGNITIVE_ENGINE_SCOPE` MUST be present.
- MUST equal exactly: SYSTEM or STAGE or TASK.
- Missing scope MUST FAIL runtime readiness.

If `COGNITIVE_ENGINE_MODE=AUTO`:
- `COGNITIVE_ENGINE_SCOPE` MUST NOT be used.
- Routing MUST follow DOC-10-CE-SEL.
- Ambiguous routing MUST enter BLOCKED state.

Any ambiguity in selection configuration:
- MUST FAIL readiness at PRE-START
  OR
- MUST enter BLOCKED during execution

Silent fallback behavior is forbidden.

---

### 5.1.1 Environment Variable Validation Rules (Hard)

Startup validation MUST perform deterministic checks on required environment variables.

Validation rules:

- `PIPELINE_MODE` MUST equal exactly: `autonomous`
- `PIPELINE_MAX_RETRIES` MUST be an integer string and MUST equal exactly: `3`
- `PIPELINE_FAIL_STRATEGY` MUST equal exactly: `fail-closed`
- `PIPELINE_OWNER_ID` MUST:
  - be present
  - be non-empty
  - match the regex: `^[a-z0-9_\\-]{8,128}$`
  - be treated as opaque (no decoding, no inference)

If any validation rule fails:
- Runtime readiness MUST FAIL
- Execution MUST NOT start
- A readiness failure artifact MUST be written per Section 1.1.0

---

#### Cognitive Engine Selection Validation (Hard)

Startup validation MUST enforce:

- `COGNITIVE_ENGINE_MODE` MUST be present AND MUST equal exactly: `MANUAL` or `AUTO`.

If `COGNITIVE_ENGINE_MODE=MANUAL`:
- `COGNITIVE_ENGINE_SCOPE` MUST be present AND MUST equal exactly: `SYSTEM` or `STAGE` or `TASK`.

If `COGNITIVE_ENGINE_MODE=AUTO`:
- `COGNITIVE_ENGINE_SCOPE` MUST be absent OR empty (treated as not provided).
- AUTO routing rules MUST follow: DOC-10-CE-SEL.

Any violation MUST:
- FAIL runtime readiness
- Write a readiness failure artifact per Section 1.1.0

---

## 5.1.2 Cognitive Engine Runtime Configuration (Optional, Contract-Bound)

Forge does not embed a reasoning engine internally.

An external Cognitive Engine MAY be enabled through explicit environment configuration.

If Cognitive Engine usage is NOT enabled:
- Runtime readiness MUST NOT fail for missing Cognitive Engine configuration.

If Cognitive Engine usage IS enabled:
- Runtime readiness MUST treat Cognitive Engine configuration as mandatory.
- Missing, invalid, or ambiguous configuration MUST FAIL readiness.

### Enabling Flag (Hard)

COGNITIVE_ENGINE_ENABLED=true|false

Rules:
- MUST be present
- MUST equal exactly: true OR false
- No defaults may be inferred

### Required Variables When Enabled (Hard)

If `COGNITIVE_ENGINE_ENABLED=true`, the following MUST be present and non-empty:

COGNITIVE_ENGINE_PROVIDER=<string>
COGNITIVE_ENGINE_MODEL_ID=<string>

The runtime MUST:
- Persist interaction artifacts under `artifacts/llm/` per Doc-05
- Fail-Closed if interaction logging cannot be persisted deterministically

The Cognitive Engine has ZERO authority.
All outputs are candidates until artifact-bound and stage-validated.

---

## 5.2 Local State & Persistence

Persistent execution state is authoritative
and non-reconstructible.

The system MUST persist state exclusively
through schema-bound artifacts,
not narrative files.

Authoritative persisted state is role-separated.

Forge self-build authority:
`artifacts/forge/forge_state.json`

Runtime execution authority:
`artifacts/orchestration/orchestration_state.json`

Human-visible status reflection:
`progress/status.json`

All other persisted state representations
are forbidden unless explicitly defined
by a versioned governance document.

Rules:
- State MUST be file-based
- State MUST be schema-bound (JSON)
- State MUST be validated on startup
- State MUST survive restarts intact
- No narrative or human-written state is permitted

If persistent state is missing,
corrupted,
or inconsistent:
- Execution MUST NOT resume
- No state inference is allowed
- No partial recovery is permitted

Execution state may ONLY be loaded,
never rebuilt.

---

## 5.2.1 Mandatory Persistent State

Persistent execution state is authoritative
and MUST be schema-bound.

There is no single authoritative live execution file.

Authoritative persistent state is split as follows:
- Forge self-build authority: `artifacts/forge/forge_state.json`
- Runtime execution authority: `artifacts/orchestration/orchestration_state.json`

`progress/status.json` remains mandatory only as a status reflection/output artifact
and MUST NOT be treated as execution authority.

Therefore, mandatory execution state elements
MUST be representable within the governed Forge/orchestration state schemas,
while status-reporting elements remain representable in `progress/status.json`.

Mandatory elements include (if supported by the approved schema):
- Current pipeline stage
- Last completed artifact
- Blocking questions (if any)
- Current task and next_step (if RUNNING)

Any additional state needs (e.g., retry counters, active decision IDs,
last verification result, halt reason) MUST NOT be stored
unless a versioned governance document explicitly extends
the authoritative status schema.

If the pipeline requires any state element
that is NOT representable in the approved schema:

- Runtime readiness MUST FAIL
- Execution MUST NOT start
- No state workaround or auxiliary state file is allowed
unless explicitly defined by a versioned authoritative contract

---

## 5.2.2 Prohibition of State Reconstruction

This section is intentionally NON-DUPLICATIVE.

All rules prohibiting state inference, rebuilding, partial recovery,
or any form of reconstruction are defined EXCLUSIVELY in Section 5.2.

Any parallel or repeated reconstruction rule definition is forbidden.

If multiple reconstruction rule definitions exist:
- Runtime readiness MUST FAIL
- Execution MUST NOT start

---

## 6. Execution & Startup

### 6.0.1 Local Build/Verify Authority Reference (Hard)

All local build, verification, retry, rollback,
loop detection, and abort handling behavior
is governed exclusively by:

- Build & Verify Playbook (Local) (Doc 09)
- Autonomy Policy & Human Interrupt Protocol (Doc 04)
- Pipeline Stages Specification (Doc 03)

No local runtime component
may invent recovery behavior
outside those documents.

---

### 6.1 Startup Rules

- Pipeline starts via a **single command**
- Must be restart-safe
- Must validate environment before execution

Example responsibilities (not commands):
- Validate directory structure
- Validate required docs existence
- Validate runtime availability
- Validate write permissions

If validation fails → STOP execution.

Startup validation is a hard execution gate.

If any validation step fails:
- No pipeline stage may start
- No partial execution is allowed
- The system MUST halt immediately

Startup warnings are treated as errors.

No warning whitelist exists in v1.
Any introduction of a warning whitelist
requires a versioned authoritative contract
defining:
- whitelist location
- whitelist schema
- allowed warning codes

---

## 6.1.1 Partial Startup Prohibition

Partial startup is forbidden.

Partial startup includes:
- Initializing runtime without validation
- Loading code without loading state
- Starting services without readiness confirmation

If startup cannot complete fully and correctly:
- Execution MUST halt
- No background recovery is allowed
- No deferred validation is permitted

---

## 6.1.2 Abort Restart Prohibition (Hard Rule)

After any Execution Abort:

- The pipeline MUST remain halted
- Automatic restart is forbidden
- No background retry is allowed
- No scheduled re-attempt may occur

Execution may resume ONLY if:
- The human explicitly resolves the abort cause
- Startup validation passes in full
- Execution re-enters from a clean start

Any automatic recovery attempt
after an Execution Abort
is a system violation.

---

## 6.1.3 Mandatory Writable Proof Paths (Hard)

Startup validation MUST verify that all mandatory proof and audit paths
exist and are writable before any execution begins.

Mandatory writable paths:

- `artifacts/forge/forge_state.json`
- `artifacts/orchestration/orchestration_state.json`
- `progress/status.json` (reflection/output layer)
- `verify/audit/` (directory must exist and be writable)
- `verify/unit/` (directory must exist and be writable)
- `verify/unit/verification_report.json` (must be creatable/overwritable by the verifier layer)
- `verify/smoke/` (directory must exist and be writable)
- `verify/smoke/local_command_log.jsonl` (must be creatable and appendable)
- `artifacts/llm/` (REQUIRED only if `COGNITIVE_ENGINE_ENABLED=true`)
- `artifacts/llm/prompts/` (REQUIRED only if enabled)
- `artifacts/llm/responses/` (REQUIRED only if enabled)
- `artifacts/llm/metadata/` (REQUIRED only if enabled)

Rules:
- No implicit directory creation is allowed
- No fallback paths are permitted
- No silent permission downgrade is permitted

If any mandatory path is missing or not writable:
- Runtime readiness MUST FAIL
- Execution MUST NOT start
- A readiness failure artifact MUST be written per Section 1.1.0

---

### 6.2 Long-Running Execution Rules

- No blocking waits for human input
- No infinite loops
- Retry logic is bounded (see Doc 04)
- Stage checkpointing is permitted ONLY as:
  - a historical snapshot under `progress/history/`
  - triggered by deterministic events
  - and MUST NEVER be used for live execution state
  - live execution authority remains exclusively in governed Forge/orchestration state artifacts, while `progress/status.json` remains a reflection layer only

---

## 7. Verification Environment

### 7.1 Verification Scope

Verification is:
- Local
- Lightweight
- Deterministic

Types:
- Smoke verification
- Structural checks
- Artifact completeness checks

No heavy CI/CD required.

---

### 7.2 Failure Handling

If verification fails:

- The current attempt is marked FAILED
- Rollback and retry handling MUST follow:
  - Autonomy Policy & Human Interrupt Protocol (Doc 04)
  - Build & Verify Playbook (Local) (Doc 09)
  - Pipeline Stages Specification (Doc 03)

A Decision MUST be logged ONLY if:
- More than one valid recovery or continuation path exists
  and a selectable execution fork must be resolved

If no selectable fork exists and execution cannot continue:
- Execution MUST Abort

Human notification occurs ONLY if:
- A Human Interrupt is required, OR
- An Execution Abort is triggered

---

## 8. Tooling Assumptions

Allowed:
- Local CLI tools
- Git
- Markdown
- JSON (schema-bound)

YAML is permitted ONLY if explicitly required
by a versioned governance document
that defines:
- file locations
- schema
- authority rules

Otherwise, YAML artifacts have ZERO authority
and MUST NOT be generated.

Disallowed:
- GUI-only dependencies
- Tools requiring manual clicking
- Proprietary locked systems

---

## 9. Security Assumptions

- Default operation is **Personal Local Mode** (single active user, local-first).
- This is a **runtime mode**, not an architectural limitation.
- Forge Core MUST remain compatible with future productization:
  - Workspace-addressable execution
  - Project state isolation
  - Clear authorization boundaries (when introduced by new scope)
- Security focus in Mode A is on:
  - Data loss prevention
  - Accidental overwrite prevention
  - Traceability
- No external exposure by default.
- Any multi-tenant / SaaS operation is OUT-OF-SCOPE unless introduced as a new task with a new scope contract.

---

## 10. Non-Goals

This system does NOT aim to:
- Be a SaaS (Mode C operation) in v1
- Support multiple concurrent users in v1 runtime
- Provide real-time collaboration in v1
- Replace formal CI/CD systems

---

## 11. Acceptance Criteria

This document is considered satisfied when:

- Environment can be set up once and reused
- Pipeline runs end-to-end locally
- Execution may resume ONLY after a non-terminal BLOCKED state (Doc-06) where:
  - `blocking_questions` is non-empty, AND
  - the unblock action is captured by the orchestrator as an authoritative control artifact

Execution MUST NEVER resume after Execution Abort.
Execution MUST NEVER resume after COMPLETED state.

All execution resumes occur only through ONE of:
- A valid Decision artifact (when a selectable fork exists), OR
- An explicit task termination control path, OR
- A clean pipeline restart after resolved runtime readiness failure (PRE-START)

No hidden assumptions remain undocumented.

---

## 11.1 Runtime vs Documentation Authority

If runtime behavior conflicts with any approved document:

- Documentation is authoritative
- Runtime behavior is considered defective
- The system MUST halt and log a violation

The pipeline MUST NEVER adapt documents
to justify runtime behavior.

---

## 11.1.1 Runtime Non-Authoring Rule (Hard)

The runtime environment MUST NOT:

- Modify documentation
- Patch contracts
- Rewrite specs
- Adjust scope or assumptions

Runtime exists to EXECUTE documentation,
not to heal, adapt, or reinterpret it.

Any attempt by runtime logic
to alter documentation
in order to justify execution
is a critical system violation.

---

### 11.1.2 Runtime Non-Adaptation Rule (Hard)

The runtime MUST NOT adapt,
reinterpret,
or compensate
for documentation defects.

If runtime behavior
conflicts with documentation:
- Execution MUST halt
- The behavior MUST be logged as a defect
- Documentation MUST NOT be altered
to justify execution

Runtime exists to EXECUTE documentation,
not to correct or reinterpret it.

---

## 11.2 Documentation Supremacy Enforcement

This section is intentionally NON-DUPLICATIVE.

Documentation supremacy and runtime non-adaptation/non-authoring rules
are defined EXCLUSIVELY in:

- Section 11.1
- Section 11.1.1
- Section 11.1.2

Any restatement, paraphrase, or parallel enforcement clause here is forbidden.

If multiple enforcement definitions exist:
- Runtime readiness MUST FAIL
- Execution MUST halt

---

## 12. Authority

This document is **binding**.

If any implementation conflicts with this document:
- The implementation MUST change
- The document does NOT change silently

---

**END OF DOCUMENT**