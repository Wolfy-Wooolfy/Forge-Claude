# PIPELINE CONTRACT VIOLATION – GOVERNANCE SPEC

---

## 1) Purpose

Define a strict, deterministic governance rule that enforces the integrity of the execution pipeline by preventing any task outside the official pipeline definition from being accepted, processed, or ignored.

This rule ensures:

- Full alignment between execution and contract  
- Elimination of silent inconsistencies  
- Deterministic system behavior  
- Fail-Closed enforcement  

---

## 2) Definition

### Pipeline Definition Authority

The file:

```

code/src/orchestrator/pipeline_definition.js

```

is the **only authoritative source** that defines:

- Allowed tasks  
- Execution order  
- Pipeline structure  

---

### Violation Definition

A `PIPELINE_CONTRACT_VIOLATION` occurs when:

> Any task exists in the system artifacts that is NOT defined in `pipeline_definition.js`

This includes:

- tasks in `artifacts/tasks/*`  
- tasks referenced in forge_state  
- any derived execution state  

---

## 3) Trigger Condition (STRICT)

### Rule:

> Existence-Based Detection

The violation is triggered immediately when:

- A task is detected that does NOT exist in the pipeline definition  
- Regardless of:
  - execution status  
  - usage  
  - whether it affects current state  

---

## 4) Enforcement Model

### Enforcement Type:

**Fail-Closed + Hard Stop**

---

### Enforcement Layers:

#### Layer 1 — Forge State Resolver

File:
```

code/src/forge/forge_state_resolver.js

```

Responsibilities:

- Detect any task outside pipeline  
- Immediately:
  - mark state as `INCONSISTENT`  
  - set system as `BLOCKED`  
- prevent valid state resolution  

---

#### Layer 2 — Orchestrator

Files:
```

code/src/orchestrator/*

```

Responsibilities:

- Detect violation in resolved state  
- Immediately:
  - stop execution  
  - prevent pipeline continuation  
  - prevent reaching COMPLETE  

---

## 5) System Behavior

Upon violation detection:

1. System MUST record violation  
2. System MUST stop execution immediately  
3. System MUST NOT:
   - continue pipeline  
   - process further tasks  
   - produce new artifacts  
4. System MUST NOT reach:
   - COMPLETE  
   - CONSISTENT  

---

## 6) Violation Representation (STRICT SCHEMA)

### Location:

#### A) forge_state.json (Source of Truth)  
#### B) orchestration_state.json (Runtime State)  

---

### Structure (STRICT – NO DEVIATION)

```json
{
  "pipeline_contract_violation": {
    "violation_type": "PIPELINE_CONTRACT_VIOLATION",

    "detected_at": "<ISO_TIMESTAMP>",

    "context": {
      "pipeline_source": "code/src/orchestrator/pipeline_definition.js",
      "detected_in": [
        "artifacts/tasks",
        "forge_state",
        "execution_registry"
      ]
    },

    "invalid_tasks": [
      "<TASK_ID>",
      "<TASK_ID>"
    ],

    "impact": {
      "execution_integrity": "INCONSISTENT",
      "system_status": "BLOCKED",
      "completion_allowed": false
    },

    "enforcement": {
      "mode": "FAIL_CLOSED",
      "action": "HARD_STOP",
      "layers": [
        "forge_state_resolver",
        "orchestrator"
      ]
    }
  }
}
```

---

### Validation Rules

* All fields are REQUIRED
* No additional fields allowed
* Any schema deviation = system error
* Any missing field = system error

---

## 7) Execution Integrity Rules Update

### If violation exists:

```
execution_integrity = "INCONSISTENT"
```

```
next_allowed_step = null
```

```
system_status = "BLOCKED"
```

---

## 8) Prohibited Behavior

The system MUST NOT:

* Ignore invalid tasks
* Auto-clean or auto-remove them
* Continue execution after detection
* Mark system as COMPLETE
* Produce partial results

---

## 9) Allowed Recovery (OUT OF SCOPE)

Recovery is NOT handled automatically.

The system requires:

* manual correction
* new valid state generation

---

## Final Status

* Mandatory enforcement
* No exceptions allowed
* Governing rule for all pipeline execution

---