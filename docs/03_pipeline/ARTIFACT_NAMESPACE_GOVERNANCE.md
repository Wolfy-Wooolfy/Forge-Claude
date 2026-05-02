# Artifact Namespace Governance

**Document ID:** FORGE-DOC-24  
**Status:** BINDING – ARTIFACT NAMESPACE GOVERNANCE  
**Scope:** Artifact Storage and Namespace Enforcement  
**Applies To:** Entire Forge Autonomous Pipeline  
**Enforcement:** HARD (Fail-Closed)

---

# 1. Purpose

This document defines the governance rules
for artifact storage inside the Forge autonomous system.

It ensures that:

- artifact locations remain deterministic
- namespace sprawl is prevented
- artifact discovery remains reliable
- runtime modules write only to authorized locations

Artifact namespaces are strictly controlled.

Any artifact written outside authorized namespaces
constitutes a governance violation.

---

# 2. Root Artifact Directory

All pipeline artifacts MUST reside under:

```

artifacts/

```

No module may write artifacts outside this root.

Forbidden examples:

```

tmp/
output/
generated/
misc/
logs/

```

outside the artifacts root.

---

# 3. Authorized Namespaces

The following namespaces are the ONLY permitted
write locations for runtime modules.

```

artifacts/intake/
artifacts/audit/
artifacts/trace/
artifacts/gap/
artifacts/ai/analysis/
artifacts/decisions/
artifacts/backfill/
artifacts/execute/
artifacts/closure/
artifacts/exploration/

```

Each module is restricted to its designated namespace.

---

# 4. Module Namespace Mapping

Each execution module may write artifacts only
to its assigned namespace.

| Module | Namespace |
|------|------|
Intake | artifacts/intake |
Audit | artifacts/audit |
Trace | artifacts/trace |
Gap | artifacts/gap |
Design Exploration | artifacts/exploration |
Option Evaluation | artifacts/ai/analysis |
Decision Gate | artifacts/decisions |
Backfill | artifacts/backfill |
Execute | artifacts/execute |
Closure | artifacts/closure |

Modules MUST NOT write outside their namespace.

---

# 5. Read Access Rules

Modules may read artifacts from:

- their own namespace
- upstream namespaces
- governance document locations

Modules MUST NOT modify artifacts
produced by other modules.

Artifacts are immutable once consumed.

---

# 6. Legacy Artifact Namespaces

The following namespaces may exist for historical purposes:

```

artifacts/stage_A/
artifacts/stage_B/
artifacts/stage_C/
artifacts/stage_D/
artifacts/reports/
artifacts/release/
artifacts/archive/

```


These namespaces are (including archived reset outputs):

- read-only
- immutable
- not permitted for new artifact generation.

Exception:

artifacts/archive/ is permitted ONLY for system-level reset operations
(e.g. forge-reset-new-project.js).

It is NOT considered a runtime module namespace
and MUST NOT be written to by pipeline modules.

---

# 6.1 System-Governed Namespaces

The following namespaces are SYSTEM-GOVERNED
and may be written to ONLY by their designated system component.

| Namespace | Owner | Governing Document |
|---|---|---|
| artifacts/forge/ | forge_state_resolver only | DOC-31, SCHEMA-07 |
| artifacts/orchestration/ | orchestrator only | docs/10_runtime/10_Tech_Assumptions_and_Local_Runtime_Setup.md |
| artifacts/tasks/ | task_registry / orchestrator only | MODULE_ORCHESTRATION_GOVERNANCE_v1 §11 |
| artifacts/cognitive/ | cognitive_adapter only | FORGE-DOC-16, DOC-05 §4.6 |
| artifacts/llm/ | cognitive_adapter only | DOC-10-CE-SEL §5 |
| artifacts/ai/ | AI Layer modules only | docs/11_ai_layer/04_AI_LAYER_ARTIFACTS.md |
| artifacts/coverage/ | Vision Compliance module only | DOC-15, DOC-16 |
| artifacts/verify/ | Boundary Audit layer only | FORGE-DOC-08 §2.2.1, §2.2.2 |
| artifacts/archive/ | forge-reset-new-project.js only | FORGE-DOC-24 §6 |
| artifacts/projects/ | intake module only | docs/03_pipeline/INTAKE_MODULE_CONTRACT_v1.md |
| artifacts/admission/ | Idea Structuring Layer only | DOC-01 §5 |

No other component may write to SYSTEM-GOVERNED namespaces.
Any violation is a CRITICAL fault and MUST halt execution.

---

# 7. Namespace Creation Rules

New artifact namespaces MUST NOT be created
during pipeline execution.

Namespace expansion requires:

- governance document update
- repository change approval
- new contract definition

Runtime modules cannot create namespaces.

---

# 8. Artifact Naming Rules

Artifacts MUST follow deterministic naming.

Allowed naming patterns:

```

<artifact_name>.json
<artifact_name>.md
<artifact_name>.log

```

Randomized names are forbidden.

Timestamp-based names are permitted only
when required for verification evidence.

---

# 9. Runtime Enforcement

Forge runtime MUST enforce namespace governance.

If a module attempts to:

- write outside allowed namespaces
- modify immutable artifacts
- create unauthorized directories

Then:

→ Execution MUST halt immediately.

A governance violation MUST be recorded.

---

# 10. Artifact Discovery Guarantee

All pipeline artifacts MUST be discoverable
through deterministic paths.

Artifact discovery MUST NOT rely on:

- directory scanning heuristics
- naming assumptions
- wildcard searches.

Explicit artifact paths MUST be used.

---

# 11. Deterministic Artifact Layout

Artifact layout is deterministic when:

- namespace paths are fixed
- artifact names are predictable
- module outputs are defined by contract.

If deterministic layout cannot be guaranteed:

→ Execution MUST FAIL CLOSED.

---

# 12. Interaction with Module Governance

This document enforces the storage layer
for artifacts produced by modules defined in:

```

MODULE_ORCHESTRATION_GOVERNANCE_v1

```

Module ordering remains governed by that document.

Namespace governance ensures artifact integrity.

---

# 13. Summary

Artifact Namespace Governance guarantees that:

- artifact storage remains controlled
- runtime modules cannot produce uncontrolled output
- artifact discovery remains deterministic
- pipeline integrity is preserved.

This document prevents namespace drift
and maintains predictable artifact structure.

---

**END OF SPECIFICATION**