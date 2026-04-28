# Cognitive Engine Selection & Routing Policy

**Document ID:** DOC-10-CE-SEL  
**Status:** EXECUTION-BOUND  
**Scope:** How Forge selects which Cognitive Engine configuration to use per run/stage/task  
**Applies To:** Forge Runtime + Cognitive Layer  
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This document defines a deterministic policy for selecting
the external Cognitive Engine configuration used by Forge.

Forge is model-agnostic by architecture.
However, each execution MUST be able to select Cognitive Engine configuration
in a deterministic, auditable, and fail-closed manner.

---

## 2. Selection Modes (Hard)

Forge supports exactly TWO selection modes:

A) MANUAL  
B) AUTO

Mode MUST be declared explicitly at runtime.

---

### 2.1 Runtime Mode Declaration (Hard)

Cognitive selection mode MUST be declared via:

COGNITIVE_ENGINE_SELECTION_MODE=<MANUAL | AUTO>

Rules:

- Value MUST be exactly "MANUAL" or "AUTO" (uppercase).
- Any other value MUST FAIL runtime readiness.
- Variable MUST be present and non-empty.
- Mode MUST NOT change during active execution.
- Changing mode requires a clean restart.

If the variable is missing, malformed, or ambiguous:
- Runtime readiness MUST FAIL.

---

## 3. MANUAL Mode (Human-Controlled)

In MANUAL mode, the human selects the Cognitive Engine configuration.

MANUAL mode supports exactly THREE scopes:

### 3.1 Scope = SYSTEM

One provider/model_id is used for the entire run.

Example:
- Stage B docs writing uses the same model as Stage C code writing.

### 3.2 Scope = STAGE

Each stage may use a different provider/model_id.

Example:
- Stage B uses a documentation-strong model
- Stage C uses a code-strong model

### 3.3 Scope = TASK

Each task may declare its own provider/model_id.

Example:
- A gap analysis task uses one model
- A code patch task uses another model

Rules:
- Task-level configuration MUST be declared in the task definition artifact
  (not inferred, not implied).
- If a task requires Cognitive Engine generation and has no declared configuration:
  execution MUST enter BLOCKED.

---

## 3.4 MANUAL Configuration Declaration (Hard)

MANUAL mode MUST declare provider/model_id explicitly
according to the selected scope.

### Scope = SYSTEM

Required variables:

COGNITIVE_ENGINE_PROVIDER=<string>
COGNITIVE_ENGINE_MODEL_ID=<string>

Rules:
- Both MUST be present and non-empty.
- Missing values MUST FAIL runtime readiness.

### Scope = STAGE

Required variables:

COGNITIVE_ENGINE_STAGE_B_PROVIDER=<string>
COGNITIVE_ENGINE_STAGE_B_MODEL_ID=<string>

COGNITIVE_ENGINE_STAGE_C_PROVIDER=<string>
COGNITIVE_ENGINE_STAGE_C_MODEL_ID=<string>

Rules:
- Stage variables MUST be present and non-empty for any stage that requires Cognitive Engine generation.
- Missing required stage variables MUST enter BLOCKED at task start
  unless the stage is fully offline-capable without Cognitive Engine generation.

### Scope = TASK

Task configuration MUST be declared in the task definition artifact.

Required fields (task-level):
- cognitive_engine_provider
- cognitive_engine_model_id

Rules:
- If a task requires Cognitive Engine generation and missing task fields:
  execution MUST enter BLOCKED.
- Task-level selection MUST be recorded in `artifacts/llm/metadata/<task_id>.json`.

---

## 4. AUTO Mode (Deterministic Routing)

In AUTO mode, Forge selects the configuration automatically,
but selection MUST remain deterministic and auditable.

AUTO mode MUST route by task category (or equivalent deterministic classifier),
using a pre-declared routing table.

Minimum required routing categories:

- DOC_WRITER
- CODE_WRITER
- ANALYZER
- VERIFIER

Rules:
- Routing behavior MUST NOT depend on non-deterministic sampling.
- If routing cannot be resolved deterministically:
  execution MUST enter BLOCKED.

---

## 4.1 AUTO Routing Table Specification (Hard)

AUTO mode MUST rely on a deterministic routing table.

The routing table MUST be declared explicitly in runtime configuration
and MUST NOT be inferred dynamically.

Minimum required categories:

- DOC_WRITER
- CODE_WRITER
- ANALYZER
- VERIFIER

Required variables:

AUTO_ROUTE_DOC_WRITER_PROVIDER=<string>
AUTO_ROUTE_DOC_WRITER_MODEL_ID=<string>

AUTO_ROUTE_CODE_WRITER_PROVIDER=<string>
AUTO_ROUTE_CODE_WRITER_MODEL_ID=<string>

AUTO_ROUTE_ANALYZER_PROVIDER=<string>
AUTO_ROUTE_ANALYZER_MODEL_ID=<string>

AUTO_ROUTE_VERIFIER_PROVIDER=<string>
AUTO_ROUTE_VERIFIER_MODEL_ID=<string>

Rules:

- All required routing variables MUST be present and non-empty.
- Missing any required routing variable MUST FAIL runtime readiness.
- Routing decision MUST depend ONLY on task category.
- No dynamic benchmarking, scoring, or sampling is permitted in AUTO mode.
- Selected provider/model_id MUST be recorded in:
  `artifacts/llm/metadata/<task_id>.json`

If a task category is undefined in the routing table:
- Execution MUST enter BLOCKED.

---

## 5. Auditability (Hard)

Regardless of MANUAL or AUTO mode:

- The selected provider/model_id MUST be recorded in:
  `artifacts/llm/metadata/<task_id>.json`
- Prompt and response MUST be persisted per Doc-05.
- No cognitive output has authority until artifact-bound and stage-validated.

---

## 6. Cognitive Engine Failure Handling (Hard)

Failure of the Cognitive Engine MUST be handled deterministically.

Cognitive Engine failure includes:

- API call failure
- Provider unreachable
- Model response timeout
- Empty or malformed output
- Schema-invalid output
- Provider authentication failure

Handling rules:

1) If failure is transient AND retry budget not exhausted:
   - Retry MUST follow Doc-04 bounded retry policy.
   - No Decision MUST be logged.

2) If retry budget exhausted:
   - Execution MUST Abort.
   - Abort reason MUST reference Cognitive Engine failure.
   - No Decision MUST be logged.

3) If failure exposes multiple valid provider alternatives (MANUAL mode):
   - Execution MUST enter BLOCKED.
   - Human must select alternative provider.
   - Decision is REQUIRED only if multiple valid provider options exist.

4) AUTO mode MUST NOT auto-switch providers.
   - No fallback.
   - No dynamic rerouting.
   - No silent provider substitution.

Cognitive Engine failure is NOT:
- A Decision
- A Validation approval
- A Quality evaluation

It is an execution failure condition governed by Doc-04.

---

## 7. Fail-Closed Enforcement

If the selected mode or scope is missing, invalid, or ambiguous:

- Runtime readiness MUST FAIL if detected at PRE-START, OR
- Execution MUST enter BLOCKED if detected during an active task

No silent fallback is permitted.

---

**END OF DOCUMENT**