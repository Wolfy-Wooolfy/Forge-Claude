# Orchestrator Runner — Dry-Run Mode Specification

**Stage:** B (Specification)  
**Release:** 1.1.0  
**Status:** FINAL — EXECUTION-BOUND  

---

## 1. Purpose

Define a Dry-Run execution mode for the Orchestrator Runner.

Dry-Run allows full validation and transition checks
WITHOUT writing any state to disk.

---

## 2. Activation (Hard)

Dry-Run mode is activated ONLY when:
- Environment variable `HALO_DRY_RUN=true`

Any other value or absence = normal mode.

---

## 3. Behavior (Deterministic)

When Dry-Run is active, the Runner MUST:
- Read `progress/status.json`
- Extract target stage from `next_step`
- Validate the transition
- Log the intended transition to stdout
- EXIT WITHOUT calling `status_writer.writeStatus`

---

## 4. Forbidden

Dry-Run MUST NOT:
- Write to any file
- Modify artifacts
- Change progress or stage
- Bypass validation

---

END
