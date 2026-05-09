# Vision Authority Contract — Forge PHASE-7-A

**Document Type:** Runtime Contract — AUTHORITATIVE  
**Status:** ACTIVE — PHASE-7-A  
**Decision:** DECISION-20260509-phase-7-A-vision-authority.md

---

## 1. Purpose

The Vision Authority System enforces that project docs are only written after the project vision is locked. It is the first Track B phase and gates all subsequent capability expansion (7-B shell, 7-C env, 7-D browser, etc.).

---

## 2. Components

| Component | Location | Role |
|---|---|---|
| `visionSchema.js` | `code/src/ai_os/schemas/` | YAML frontmatter parser + validator + serializer |
| `visionEngine.js` | `code/src/ai_os/` | Vision state management — all reads/writes go here |
| `vision_tools.js` | `code/src/runtime/tools/` | 3 L2 tools: propose, approve, lock |
| `vision_lock_rule.js` | `code/src/runtime/permission/rules/` | L3 deny rule for docs writes |
| `visionComplianceGate.js` | `code/src/modules/` | Thin wrapper for pipeline integration |
| `visionAlignmentValidator.js` | `code/src/modules/` | Thin wrapper for pipeline integration |

---

## 3. Vision File Format

Stored at `artifacts/projects/<project_id>/vision.md`:

```
---
project_id: <id>
project_name: <name>
domain: <domain>
vision_version: 1
vision_locked: false
vision_locked_at: null
locked_by_role: null
amendments_history: []
goals:
  primary: <text>
  secondary: []
constraints: []
non_goals: []
---

# Project Vision: <project_name>
...
```

---

## 4. L3 Deny Rule

`vision_lock_rule.js` fires in `permissionPolicy.authorize()` at Step 1.5 (after hard_deny, before scope check) for every `fs.write_file` invocation.

```
if tool.name !== "fs.write_file" → pass
if path starts with "docs/" → use ctx.project_id
if path matches "artifacts/projects/<id>/docs/" → extract <id>
if no project_id resolvable → pass (generic docs, not project-scoped)
readVisionSync(projectId):
  null   → DENY: VISION_NOT_FOUND
  locked=false → DENY: VISION_NOT_LOCKED
  locked=true  → pass (continues to other rules)
```

---

## 5. L2 Tools

| Tool | Mode | Action |
|---|---|---|
| `vision.propose_amendment` | PROMPT | Adds PROPOSED entry to amendments_history; does NOT increment version |
| `vision.approve_amendment` | PROMPT | Approves PROPOSED entry; increments `vision_version` |
| `vision.lock_vision` | WORKSPACE_WRITE | Sets `vision_locked=true`; enables docs writes |

TEST control mode auto-allows PROMPT-mode tools (no interactive approval in CI).

---

## 6. Amendment Lifecycle

```
PROPOSED → APPROVED (via approve_amendment)
           ↑ AMENDMENT_NOT_PROPOSABLE if already APPROVED
```

- Append-only history: no entry is ever deleted or mutated
- `vision_version` increments only on `approveAmendment`
- A `proposeAmendment` alone does NOT change `vision_version`

---

## 7. Auto-Lock Hook

`conversationEngine.confirmTransition()` auto-locks the vision when `targetState === "OPTION_DECISION"`. The lock is fire-and-forget (`try/catch` + `console.warn` on failure). The conversation flow is never blocked by vision lock failures.

---

## 8. Pipeline Integration

`pipeline_definition.js` VISION_COMPLIANCE module (ordinal 11) now has a `run(ctx)` function that calls `visionComplianceGate.assertVisionLocked(ctx.project_id)`.

---

**END OF CONTRACT**
