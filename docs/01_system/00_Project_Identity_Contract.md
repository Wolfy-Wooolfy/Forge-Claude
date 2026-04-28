# Project Identity & Naming Contract

**Document ID:** DOC-00  
**Status:** FINAL — SYSTEM IDENTITY GOVERNANCE  
**Scope:** System Naming Authority  
**Applies To:** All Documents, Artifacts, Runtime Components  
**Enforcement Level:** Hard (Drift Prevention)

---

## 1. Official System Name

The official name of this system is:

# Forge

Forge is a deterministic, fail-closed, artifact-governed autonomous project engine.

---

## Core vs Interface Separation Rule (Hard)

Forge consists of:

- **Forge Core (Authoritative Engine)**
- **Execution Shells (Non-Authoritative Interfaces)**

### Core Definition (Binding)

Forge Core:

- Contains pipeline logic
- Enforces stage governance
- Validates runtime readiness
- Controls state machine transitions
- Owns execution authority

Forge Core MUST:

- Remain independent of any specific interface
- Contain ZERO UI logic
- Contain ZERO CLI formatting logic
- Contain ZERO HTTP routing logic
- Be executable without any presentation layer

### Execution Shells (Non-Authoritative)

Execution Shells MAY include:

- CLI wrapper
- Local dashboard
- Web interface
- Remote control API

Shells:

- Have ZERO execution authority
- Cannot mutate pipeline state directly
- Cannot bypass stage validation
- Must call Forge Core via explicit interface boundary

### Architectural Guarantee (Hard)

Replacing or removing any Shell MUST NOT:

- Break pipeline logic
- Affect stage governance
- Modify artifact generation rules
- Change execution determinism

If Core behavior depends on a specific Shell:

- Runtime readiness MUST FAIL
- Execution MUST NOT start

---

## 2. Historical Reference

The system was previously referred to as:

The system was previously referred to by a deprecated legacy name.

That legacy name is intentionally NOT written here to prevent documentation drift
and to ensure the NamingAuthority audit cannot be bypassed by “historical reference”.

The legacy name is now deprecated and must not be used in any document,
artifact, code reference, or runtime output.

---

## 3. Naming Authority Rule

If any document, artifact, or code reference contains
the deprecated name,

it constitutes Documentation Drift.

All future references must use:

Forge

---

## 4. Scope of Enforcement

This naming authority applies to:

- System documentation
- Stage definitions
- Runtime logs
- Artifact headers
- Closure reports
- Status outputs
- README files
- Future repositories

---

## 5. Drift Handling

If deprecated naming is detected:

- It must be corrected immediately.
- A documentation correction entry must be logged in Stage B.

---

END OF DOCUMENT
