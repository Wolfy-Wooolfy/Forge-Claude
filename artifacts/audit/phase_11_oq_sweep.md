# PHASE-11 Open Questions Sweep

**Date:** 2026-05-15  
**Stage:** 11.0 — Plan + Contract Design  
**Author:** Claude (CTO advisor)  
**Format:** Same as `artifacts/audit/blueprint_contradiction_sweep.md` (PHASE-0.5)

---

## Summary

| Severity | Count |
|---|---|
| BLOCKER | 0 |
| WARN | 4 |
| INFO | 4 |
| **Total** | **8** |

No BLOCKERs. Proceed to mid-checkpoint.

---

## Findings

---

### OQ-1 — OWNER_INTENT Seeding for Intake Projects

| Field | Value |
|---|---|
| Doc | `docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md` §2.2 |
| Section | Transition table: OWNER_INTENT → ARCHITECT_DESIGN |
| Severity | **WARN** |

**Conflict / Gap:**  
Orchestration loop contract §2.2 states: `OWNER_INTENT → ARCHITECT_DESIGN` triggers when "Owner intent captured in graph." No schema exists for *what* this intent payload looks like. For natural-language projects the intent is open-ended text. For intake projects the intent is the locked `vision.md` — a structured document, not free-form text. The contract is silent on this distinction.

**Proposed resolution:**  
`docs/10_runtime/20_INTAKE_CONTRACT.md` (Deliverable F) §6 documents the convention: when a project has a locked `vision.md` at loop-start time, `OWNER_INTENT → ARCHITECT_DESIGN` is automatic on the first `orchestration.advance_state` call, with the vision.md content serialized into the architect's input payload. No orchestration contract amendment needed in Stage 11.0 — this is a new-project-class convention, additive. Stage 11.4 implements the actual seed mechanism.

Pre-authorized by owner on 2026-05-15 as WARN (not BLOCKER). If `advance_state` hard-checks for natural-language intent payload: STOP and report.

---

### OQ-2 — Owner Review Gate for Inferred Vision (Pre-Loop Human Interrupt)

| Field | Value |
|---|---|
| Doc | `docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md` §2 |
| Section | Autonomy scope, human interrupt conditions |
| Severity | **WARN** |

**Conflict / Gap:**  
The existing Gate 1/2/3 framework governs interrupts WITHIN the orchestration loop. Intake has a mandatory human interrupt BEFORE the loop starts: owner must review the inferred vision and explicitly approve before `vision.lock_vision` is called. This pre-loop interrupt is not governed by the existing gate framework.

Autonomy Policy §2 states: "Autonomy MUST immediately terminate" if execution cannot proceed without interpretation. Reverse-vision makes interpretive decisions about `goals.primary`, `project_name`, etc. These interpretations must be explicitly ratified by the owner before they become binding (via vision lock).

**Proposed resolution:**  
`docs/10_runtime/20_INTAKE_CONTRACT.md` §5 "Vision Lock Semantics" documents this as a required pre-loop owner review step. Auto-locking is explicitly PROHIBITED — `vision.lock_vision` is only callable after owner explicitly approves the inferred vision content. No new gate type or contract amendment needed; this is intake-specific workflow documented in the Intake Contract.

---

### OQ-3 — vision.lock_vision Compatibility with New-Project Flow

| Field | Value |
|---|---|
| Doc | `docs/12_ai_os/21_VISION_AUTHORITY_CONTRACT.md` §5 |
| Section | L2 Tools |
| Severity | **WARN** |

**Conflict / Gap:**  
Task prompt §0 check item: does `vision.lock_vision` only accept amendments (lock-after-amend), or does it work for new projects?

**Resolution (verified from source):**  
`code/src/runtime/tools/vision_tools.js` `lock_vision.execute` calls `ve.lockVision(project_id, lockedByRole)`. `visionEngine.lockVision` (line 64-68): checks if vision.md exists → if not, returns `{ ok: false, reason: "VISION_NOT_FOUND" }`. It does NOT require prior amendment. No prerequisite amendment flow exists.

**Intake flow is clean:**
1. Intake runner writes `artifacts/projects/<project_id>/vision.md` via `fs.write_file` (unlocked, `vision_locked: false`)
2. Owner reviews
3. Owner approves → `vision.lock_vision` called → `vision_locked: true`
4. Orchestration loop starts

No new `vision.create_and_lock` tool needed. Resolved WARN → no action required beyond documenting this in Intake Contract §5.

---

### OQ-4 — Activity Indicators for reverse_vision Role

| Field | Value |
|---|---|
| Doc | `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` |
| Section | Activity Indicator System (referenced) |
| Severity | **WARN** |

**Conflict / Gap:**  
Agent Roles Contract references an Activity Indicator System (`docs/10_runtime/19_ACTIVITY_INDICATORS.md`). All 12 existing roles have registered activity indicators. The new `reverse_vision` role needs its own indicators (`PARSING_OUTPUT`, `VALIDATING_SCHEMA`, etc.). These are not in the Stage 11.0 stub.

**Proposed resolution:**  
Add `reverse_vision` indicators to `_activity_catalog.js` and `19_ACTIVITY_INDICATORS.md` in Stage 11.1 when implementing the role body. The stub file (Stage 11.0) may leave indicator calls as best-effort `try/catch` no-ops (consistent with existing pattern in other roles: `try { emitActivity(...) } catch(_e) {}`). Not needed for contract compliance of the stub.

---

### OQ-5 — KB Integration for Reverse-Vision

| Field | Value |
|---|---|
| Doc | `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` |
| Section | L-KB-5 Research Agent |
| Severity | **INFO** |

**Conflict / Gap:**  
Task prompt §0 item: "does reverse-vision need KB lookups, e.g., to research what a 'Django REST API' typically contains? If so, does it use kb.retrieve?"

**Resolution:**  
No. The KB is for web-research via the `research_role` (L-KB-5). Reverse-vision analyzes source code directly — it does not need external research about what frameworks contain. The grammar (tree-sitter) + manifest files (package.json, go.mod, requirements.txt) provide all the structural information needed. KB is NOT in the intake pipeline. The KB Contract is not relevant to PHASE-11.

---

### OQ-6 — WASM Grammar Loading: Async vs Sync loadPrompt

| Field | Value |
|---|---|
| Doc | `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` (Prompt Loader section) |
| Section | `_prompt_loader.js` usage pattern |
| Severity | **INFO** |

**Conflict / Gap:**  
`loadPrompt("reverse_vision_v1")` is called synchronously at module load time (line 9 pattern in all role files). `Parser.Language.load(wasmPath)` is async (returns a Promise). reverse_vision_role.js cannot call WASM grammar loading at module level using the existing sync pattern.

**Proposed resolution:**  
Lazy init via module-level cached Promise:
```javascript
let _langPromise = null;
function _getLanguage() {
  if (!_langPromise) {
    const { Parser, Language } = require("web-tree-sitter");
    _langPromise = Parser.init().then(() => Language.load(WASM_PATH));
  }
  return _langPromise;
}
```
Called inside `run()` as `const lang = await _getLanguage()`. The `SYSTEM_PROMPT` constant (loadPrompt) stays sync at module level as normal. Only the WASM loading is deferred. Pattern similar to KB's LanceDB lazy init in `storage_lance.js`. Pre-authorized by owner.

---

### OQ-7 — web-tree-sitter Parser.init() Global vs Per-Call

| Field | Value |
|---|---|
| Doc | `web-tree-sitter` API docs (npm package) |
| Section | Initialization |
| Severity | **INFO** |

**Conflict / Gap:**  
`Parser.init()` must be called once before any language loading. Should this be called at Forge boot (adding a boot dependency) or per-role lazy init?

**Proposed resolution:**  
Per-role lazy init — include `Parser.init()` in the `_getLanguage()` cached Promise (OQ-6 above). Calling `Parser.init()` multiple times is a no-op once initialized. Verified: ABI load test in Stage 11.0 confirmed `Parser.init()` works in isolation without any Forge boot hook. Doctor check for parser readiness can be added in Stage 11.1. Pre-authorized by owner.

---

### OQ-8 — web-tree-sitter 0.26.8 vs tree-sitter-python v0.25.0 ABI

| Field | Value |
|---|---|
| Doc | N/A — runtime compatibility |
| Section | Stage 11.0 vendor setup |
| Severity | **INFO** |

**Status: RESOLVED in Stage 11.0.**  
ABI compatibility empirically verified: loaded `python.wasm` (v0.25.0) with web-tree-sitter 0.26.8, parsed `x = 1 + 2` → `rootNode.type = "module"`, `childCount = 1`. Correct result. No forward-compatibility concern for Stage 11.1. MANIFEST.json updated with verification status.

---

## Contracts Reviewed

| Contract | Finding |
|---|---|
| `21_VISION_AUTHORITY_CONTRACT.md` | OQ-2, OQ-3 |
| `22_KNOWLEDGE_BASE_CONTRACT.md` | OQ-5 |
| `19_ORCHESTRATION_LOOP_CONTRACT.md` | OQ-1 |
| `18_AGENT_ROLES_CONTRACT.md` | OQ-4, OQ-6 |
| `04_Autonomy_Policy_and_Human_Interrupt_Protocol.md` | OQ-2 |
| `vision_tools.js` (L2 tool source) | OQ-3 (resolved from source) |
| `visionEngine.js` (implementation) | OQ-3 (resolved from source) |

---

**END OF SWEEP**
