# Rollback Notice — Stage C to Stage B

**Type:** ROLLBACK (Deterministic)  
**From Stage:** C  
**To Stage:** B  
**Reason:** SPEC GAP  
**Status:** CLOSED — EXECUTION-BOUND  

---

## 1. Trigger

Stage C attempted to proceed beyond validated smoke tests.

Next required implementation step is an **Orchestrator Runner** that:
- reads `progress/status.json`
- validates stage transitions
- writes status updates deterministically

This behavior is NOT explicitly specified in any Stage B artifact.

---

## 2. Hard Rule Enforcement

Per `docs/03_pipeline`:
- Unmapped code is forbidden
- Spec gaps MUST stop code generation
- Execution MUST return to Stage B

Stage B is re-entered ONLY via explicit rollback + downstream invalidation.

---

## 3. Downstream Invalidation

Stage C remains OPEN and MUST NOT advance
until a Stage B specification artifact exists
defining the Orchestrator Runner behavior 1:1.

No new Stage C code may be generated
until the missing spec is produced and CLOSED.

---

END
