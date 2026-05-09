# DECISION-20260509-phase-7-A-vision-authority

| Field | Value |
|---|---|
| Status | OWNER_APPROVED — 2026-05-09 |
| Authored | 2026-05-09 |
| Type | Track B Activation Phase (first) |
| Related | PHASE-6.C-exit-report.md (Track A closure) |
| Related | DECISION-20260509-vision-shift-track-b.md (Track B vision) |

---

## 1. Context

PHASE-6.C closed Track A: every Forge-internal write routes through L2 → L3 → audit.
The infrastructure is clean and verified (30/30 scenarios PASS, 21 tools registered).

PHASE-7-A is the **first Track B phase** and **gates all subsequent Track B phases**
(7-B shell.run, 7-C env, 7-D browser, etc). Without vision authority, capability
expansion is ungoverned.

The blueprint frames Vision Authority as:
- **L3 deny rule**: writes to `docs/**` require `vision_locked=true`
- **L2 tools**: vision.propose_amendment + approve_amendment + lock_vision
- **Engine**: visionEngine.js manages schema + history + amendments
- **Existing modules**: visionComplianceGate.js + visionAlignmentValidator.js activated as engine consumers

Pre-flight (2026-05-09) surfaced 3 findings incorporated into this decision (see §5 Risks):
- F5a/F5b require **full rewrite** of both modules (not activation) — they contain direct
  `fs.writeFileSync` calls and regex-scan logic that must be replaced with engine wrappers
- F5c requires **adding** a `run` function to `pipeline_definition.js` (not enabling existing)
- F5d hook confirmed at conversationEngine.js line ~196, in confirmation handler,
  after `active_runtime_state = targetState`, on `targetState === "OPTION_DECISION"`

---

## 2. Decision (6 fronts)

### F1 — Vision schema + storage format

**Format:** Markdown file with YAML frontmatter (Q3: human-readable).

**Location:** `artifacts/projects/<project_id>/vision.md`

**Module:** `code/src/ai_os/schemas/visionSchema.js` (new directory + file)

**Schema template:**
```yaml
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

## Background
<owner-written prose>

## What we're building
<owner-written prose>

## What we're NOT building
<explicit non-goals>
```

**Validation rules (visionSchema.js):**
- `vision_version`: positive integer, required
- `vision_locked`: boolean, required
- Lock consistency: `vision_locked=true` ↔ `vision_locked_at` set (both null OR both set)
- `amendments_history`: array (may be empty), required
- `project_id`: string, required
- `project_name`: string, required
- YAML parser: minimal hand-rolled (no external deps); complex YAML deferred to future phase

---

### F2 — visionEngine.js

**Location:** `code/src/ai_os/visionEngine.js` (new file)

**API (all async):**
```
getCurrentVision(projectId)           → { frontmatter, body } | null
lockVision(projectId, lockedByRole)   → { ok, mode, vision_version }
proposeAmendment(projectId, proposal) → { ok, amendment_id, status }
approveAmendment(projectId, amendmentId, approvedByRole) → { ok, amendment_id, vision_version }
getAmendmentHistory(projectId)        → [amendments]
readVisionSync(projectId)             → frontmatter | null  ← exposed for L3 hot path
```

**Constraints:**
- Zero `fs.writeFileSync` — all writes via `getDefaultRegistry().invoke("fs.write_file", ...)`
- `readVisionSync` is a synchronous direct `fs.readFileSync` (allowed: permission hot path only)
- Append-only history: engine has no method that mutates an existing amendment entry
- `approveAmendment` checks `status === "PROPOSED"` before applying; returns `AMENDMENT_NOT_PROPOSABLE` otherwise

---

### F3 — L2 vision_tools.js

**Location:** `code/src/runtime/tools/vision_tools.js` (new file)

**3 tools registered:**

| Tool | required_mode | Action |
|---|---|---|
| `vision.propose_amendment` | PROMPT | Calls `visionEngine.proposeAmendment` |
| `vision.approve_amendment` | PROMPT | Calls `visionEngine.approveAmendment` |
| `vision.lock_vision` | WORKSPACE_WRITE | Calls `visionEngine.lockVision` |

**Registration:** wired in `code/src/runtime/tools/_registry.js` at startup
(the registry singleton already loads all tool files on require).

**Preview support:** `vision.propose_amendment` and `vision.approve_amendment` implement
preview returning `{ would_propose: true, ... }` / `{ would_approve: true, ... }`.

---

### F4 — L3 vision_lock_rule.js

**Location:** `code/src/runtime/permission/rules/vision_lock_rule.js` (new file + new dir)

**Rule logic (coarse granularity — Q1):**
```
if tool.name !== "fs.write_file" → pass
if input.path does not start with "docs/" → pass
resolve project_id from ctx.project_id (top-level docs/) or from path pattern
  artifacts/projects/<id>/docs/ (project-scoped docs)
if project_id not resolvable → pass (generic system docs, not project-scoped)
readVisionSync(projectId):
  null   → DENY: VISION_NOT_FOUND
  locked=false → DENY: VISION_NOT_LOCKED
  locked=true  → pass (falls through to other rules)
```

**Registration:** in `code/src/runtime/permission/permissionPolicy.js`
- New `_visionRules` array holding the rule function
- Called in `authorize()` after hard_deny, before scope check (Step 1.5)
- Returns `{ allow: false, reason: "VISION_NOT_LOCKED"|"VISION_NOT_FOUND" }` to `emit()`

---

### F5 — Activate existing modules + 5 scenarios

#### F5a — visionComplianceGate.js (FULL REWRITE — see R8)

Current: regex scanner + direct `fs.writeFileSync`.
New: thin async wrapper around visionEngine.

```js
function createVisionComplianceGate({ visionEngine }) {
  async function assertVisionLocked(projectId) {
    const vision = await visionEngine.getCurrentVision(projectId);
    if (!vision) return { ok: false, reason: "VISION_NOT_FOUND" };
    if (!vision.frontmatter.vision_locked) return { ok: false, reason: "VISION_NOT_LOCKED" };
    return { ok: true, vision_version: vision.frontmatter.vision_version };
  }
  return { assertVisionLocked };
}
module.exports = { createVisionComplianceGate };
```

Zero `fs.*` direct calls. Old `runVisionComplianceGate` export retained as no-op shim
to avoid breaking apiServer.js import (which calls it in governance routes).

#### F5b — visionAlignmentValidator.js (FULL REWRITE — see R8)

Current: 7-clause scanner + direct `fs.writeFileSync`.
New: thin async wrapper that reads vision goals and returns alignment summary.

```js
function createVisionAlignmentValidator({ visionEngine }) {
  async function validateAlignment(projectId, payload) {
    const vision = await visionEngine.getCurrentVision(projectId);
    if (!vision) return { ok: false, reason: "VISION_NOT_FOUND", aligned: false };
    return {
      ok: true,
      aligned: true,
      vision_version: vision.frontmatter.vision_version,
      vision_locked: vision.frontmatter.vision_locked,
      goals: vision.frontmatter.goals || {}
    };
  }
  return { validateAlignment };
}
module.exports = { createVisionAlignmentValidator };
```

Old `runVisionAlignmentValidation` export retained as no-op shim.

#### F5c — pipeline_definition.js: add `run` function (not enable existing)

Current: `VISION_COMPLIANCE` module is metadata-only (no `run` function).
New: add `run(ctx)` that calls `visionComplianceGate.assertVisionLocked(ctx.project_id)`.

The `pipeline_definition.js` module will need to instantiate (or receive) both
`visionEngine` and `visionComplianceGate`. Given pipeline_definition.js currently
exports a static array, the run function will be added directly to the module object
with lazy initialization of the visionEngine on first call.

#### F5d — conversationEngine.js: vision auto-lock hook (ONLY modification)

**Location:** confirmation handler, after `active_runtime_state = targetState` (line ~196).

```js
// After: const updatedState = { ...state, active_runtime_state: targetState };
if (targetState === "OPTION_DECISION") {
  try {
    const { createVisionEngine } = require("./visionEngine");
    const ve = createVisionEngine({ root });
    await ve.lockVision(projectId, "owner");
  } catch (err) {
    // Do NOT block conversation engine on vision failure — log only
    console.warn("[conversationEngine] vision lock failed:", err.message);
  }
}
```

**Only this change** to conversationEngine.js. No other modifications.

#### F5e — 5 scenarios (S31-S35)

| Scenario | Type | Tool/Endpoint | Key assertion |
|---|---|---|---|
| S31 | `direct_tool` | `fs.write_file` | DENIED with reason `VISION_NOT_LOCKED` when vision exists but locked=false |
| S32 | `direct_tool` | `vision.lock_vision` + `fs.write_file` | lock → write succeeds |
| S33 | `direct_tool` | `vision.propose_amendment` + `vision.approve_amendment` | vision_version increments on approval |
| S34 | `direct_tool` | `vision.propose_amendment` | proposal alone insufficient — status=PROPOSED, vision unchanged |
| S35 | `direct_tool` | `vision.approve_amendment` on already-approved | returns AMENDMENT_NOT_PROPOSABLE |

Each scenario: ≥4 assertions. Permission mode: WORKSPACE_WRITE throughout.

Note: vision tools in PROMPT mode — TEST permission mode in scenario runner auto-allows
PROMPT-mode tools (per L3 contract §3 TEST mode behavior). This allows deterministic
scenario testing without hanging on owner approval prompts.

---

### F6 — Documentation

- **This decision artifact** (updated to OWNER_APPROVED after approval)
- `docs/01_system/03_Project_Vision_Reference.md` — addendum section (1 paragraph)
- `docs/12_ai_os/21_VISION_AUTHORITY_CONTRACT.md` — new authoritative spec
- `progress/status.json` — `runtime_health.vision_authority: "ENABLED"`, tools 21→24
- Exit report: `artifacts/decisions/PHASE-7-A-exit-report.md`

---

## 3. Acceptance criteria

1. ✓ `node bin/forge-test.js` → **35 PASS / 0 FAIL / 0 SKIP** (was 30/30)
2. ✓ S31-S35 each have ≥4 assertions, all PASS
3. ✓ Zero direct `fs.*` in new code:
   ```
   grep -rE "fs\.(writeFileSync|appendFileSync|unlinkSync|mkdirSync|rmSync)" \
     code/src/ai_os/visionEngine.js \
     code/src/runtime/tools/vision_tools.js \
     code/src/runtime/permission/rules/vision_lock_rule.js
   ```
   → 0 matches
4. ✓ 3 new vision_tools registered (total: 24)
5. ✓ vision_lock_rule registered in permissionPolicy
6. ✓ Negative test: disable vision_lock_rule → S31 FAIL. Revert → 35/35
7. ✓ L3 reach test: vision_locked=true → write succeeds; vision_locked=false → DENIED with VISION_NOT_LOCKED in audit
8. ✓ All 5 smoke suites PASS — explicit exit codes (Bug-11 prevention)
9. ✓ Backwards compat: S01-S30 all PASS
10. ✓ Cleanup: no `test_engine_*` or `test_s3*` directories leftover
11. ✓ Protected layers untouched:
    ```
    git diff --stat | grep -E "apiServer\.js|workspaceHelpers\.js|providers/"
    ```
    → empty (no matches)
12. ✓ apiServer.js line count unchanged
13. ✓ `runtime_health.vision_authority: "ENABLED"` in status.json

---

## 4. Rollback plan

```bash
git checkout HEAD~1 -- \
  code/src/ai_os/schemas/visionSchema.js \
  code/src/ai_os/visionEngine.js \
  code/src/runtime/tools/vision_tools.js \
  code/src/runtime/tools/_registry.js \
  code/src/runtime/permission/permissionPolicy.js \
  code/src/modules/visionComplianceGate.js \
  code/src/modules/visionAlignmentValidator.js \
  code/src/orchestrator/pipeline_definition.js \
  code/src/ai_os/conversationEngine.js \
  docs/01_system/03_Project_Vision_Reference.md \
  docs/12_ai_os/21_VISION_AUTHORITY_CONTRACT.md \
  progress/status.json

rm -f code/src/runtime/permission/rules/vision_lock_rule.js
rm -f code/src/testing/scenarios/S31_*.json
rm -f code/src/testing/scenarios/S32_*.json
rm -f code/src/testing/scenarios/S33_*.json
rm -f code/src/testing/scenarios/S34_*.json
rm -f code/src/testing/scenarios/S35_*.json
```

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| R1: Breaking existing flows that write to `docs/`. | vision_lock_rule only fires when project_id is resolvable. Generic system writes to `docs/` without `ctx.project_id` pass through. |
| R2: conversationEngine vision hook breaks state transitions. | F5d hook is fire-and-forget with `try/catch`. If `lockVision` fails, `console.warn` only — does NOT block conversation flow. |
| R3: visionComplianceGate activation breaks pipeline. | F5a/F5c done together; old `runVisionComplianceGate` shim retained for apiServer.js governance routes. |
| R4: Vision schema drift. | visionSchema.js validator runs on every `getCurrentVision` read — corrupted vision.md fails loudly with `VISION_PARSE_FAILED`. |
| R5: Amendment workflow in PROMPT mode hangs CI. | TEST mode auto-allows PROMPT tools per L3 contract. Scenarios use WORKSPACE_WRITE which escalates correctly in TEST. |
| R6: Q1 coarse granularity insufficient. | Acknowledged. Q1 explicitly says "expand later." This phase establishes the mechanism. |
| R7: Concurrent vision state. | Vision is read-mostly, write-serialized through visionEngine. No concurrent amendment risk in current single-server setup. |
| **R8 (new — Pre-flight finding):** visionComplianceGate.js and visionAlignmentValidator.js contain direct `fs.writeFileSync` + regex-scan logic that violates Track A discipline. | **Full rewrite** in F5a/F5b (not activation): remove all regex scan logic, remove all direct fs.* calls, replace with thin engine wrapper. Old export shims retained for backwards compat. This is surfaced technical debt resolved at the right time. |

---

## 6. Bug-tracking section

| Bug | File:Line | Surface | Resolution |
|---|---|---|---|
| Pre-flight stale counts | verify/smoke/test_tool_runtime.js:60, test_harness_meta.js:55,76,179 | tools==20 (should be 21), scenarios==24 (should be 30) | Fixed in pre-flight cleanup before §2 |

---

## 7. Owner approval

Approval: **OWNER_APPROVED — 2026-05-09**
