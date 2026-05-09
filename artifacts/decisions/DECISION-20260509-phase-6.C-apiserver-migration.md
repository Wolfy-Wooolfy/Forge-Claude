# DECISION-20260509-phase-6.C-apiserver-migration

| Field | Value |
|---|---|
| Status | OWNER_APPROVED — 2026-05-09 |
| Authored | 2026-05-09 |
| Type | Phase Migration |
| Phase | PHASE-6.C — apiServer Migration (final Track A phase) |
| Related | DECISION-20260509-vision-shift-track-b.md |
| Related | DECISION-20260509-phase-6.B.5-final-ai-os-migration.md |

## 1. Context

PHASE-6.C is the final phase of Track A (Foundation). All ai_os engines migrated to L2
in PHASE-6.B.x. This phase migrates `code/src/workspace/apiServer.js` itself — the last
file in the system with direct `fs.writeFileSync` calls outside the L2 Tool Runtime.

At audit time (Stage 1), apiServer.js was **3577 lines** with **85 endpoints** and
**24 direct fs write operations**.

## 2. Scope summary

| Metric | Pre-migration | Post-migration |
|---|---|---|
| File size | 3577 lines | ~1800 lines |
| Endpoints | 85 | 37 |
| Direct fs writes | 24 | 0 |
| Dead code functions | 6 | 0 |
| Orphan imports | 20 | 0 |

## 3. Stages

### Stage 1 — Audit (complete)
Artifact: `artifacts/audit/apiserver_endpoint_audit_20260509.md`
- 85 endpoints discovered (14 via req.url pattern, missed by initial grep)
- 37 KEEP / 48 DELETE
- 17 live writes + 1 mkdirSync to migrate in Stage 2C
- Dead code cluster identified: 6 functions, 0 writes (never execute)
- STOP resolved: fs.delete_dir tool to be added in Stage 2C (§F3 below)

### Stage 2A — Endpoint deletion (48 endpoints)

DELETE groups:
- Group D (21): Engine-internal duplicates — engines tested by S20-S24 scenarios
- Group E (3): Legacy workspace AI endpoints (`/api/ai/approve`, `/api/ai/apply-execute-plan`, `/api/ai/draft`)
- Group F (24): Governance validator HTTP wrappers

**Dead code cluster removed with Stage 2A:**
- `applyExecutionPlan()` (lines 1340-1441): only called from handleApplyExecutePlan which always returns 409
- `buildExecutionPlanFromDraft()` (lines 1279-1313): never called anywhere
- `materializeDraftFilesForApproval()` (lines 1315-1338): only called from handleApprove (deleted)
- `applyPatchOperations()` (lines 538-630): only called from the two functions above
- `buildFocusedFileContext()` (lines 409-427): orphan, never called
- `handleApprove()` (lines 2771-2871): only called from /api/ai/approve (deleted)
- `handleApplyExecutePlan()` (lines 2873-2879): always returns 409, called only from endpoint deleted

**Orphan imports removed:**
- `createDocumentationReviewEngine`, `ConversationalResponseProvider`,
  `createRefinementLoopOrchestrator`, `createDiscussionLoopGate`,
  `createLanguageDetectionCompliance`, `createUxValidator`,
  `runVisionAlignmentValidator`, `runCrossDocConsistencyEngine`,
  `runCodeToSpecTraceValidator`, `runDocsGapAnalyzerValidator`,
  `runCognitiveLayerContractEnforcer`, `runProviderAuthorityEnforcer`,
  `runFullLoopReport`, `runBoundaryAuditStageGate`, `auditAllStages`,
  `runDecisionArtifactValidator`, `runDocGapLoopContract`,
  `runToolIntegrationReadiness`, `runDecisionFileNameEnforcer`,
  `runCanonicalArtifactValidator`, `runDecisionFinalityEnforcer`, `sealDecision`,
  `declareFork`, `resolveFork`, `runForkDetectionReport`,
  `runRecommendationSeparationValidator`, `runCodexContractValidator`,
  `runNodeSmokeCheck`, `runProjectIsolationGuard`,
  `runResearchTransparencyReport`, `createResearchTransparencyLayer`

### Stage 2B — Write helpers

Added to apiServer.js (above requestHandler):
- `writeJson(absPath, payload)` — throws on failure (HARD paths)
- `tryWriteJson(absPath, payload)` — logs warn + continues (best-effort paths)
- `tryAppendArrayJson(absPath, entry)` — append to JSON array, best-effort

### Stage 2C — fs.write migration + fs.delete_dir addition

#### §F3 — fs.delete_dir tool specification (owner-mandated)

Three protection conditions (HARD requirements, non-negotiable):

**Condition 1 — required_mode:**
```js
required_mode: "WORKSPACE_WRITE"
```
Tool is blocked in READ_ONLY mode. Requires explicit WORKSPACE_WRITE permission.

**Condition 2 — artifacts/projects/ path enforcement (deny-by-default):**
```js
// Before rmSync, verify resolved absolute path starts with root/artifacts/projects/
const projectsBase = path.resolve(root, "artifacts", "projects") + path.sep;
if (!abs.startsWith(projectsBase)) {
  return failed("PATH_OUTSIDE_PROJECTS", "fs.delete_dir only operates within artifacts/projects/");
}
```
This check fires EVEN if permission mode would otherwise allow it.
Deny-by-default: any path not under `artifacts/projects/` is rejected unconditionally.

**Condition 3 — Preview support:**
```js
preview(input, ctx) {
  // count files before deletion
  const fileCount = countFilesRecursive(abs);
  return previewed({ would_delete: abs, file_count: fileCount });
}
```
Returns `{ would_delete: <absolute_path>, file_count: N }` without deleting anything.

#### 17 writes migrated in Stage 2C

All 17 direct `fs.writeFileSync` calls + 1 `fs.mkdirSync` in `createDecisionPacket`
replaced with `writeJson()` or `tryWriteJson()` per HARD/best-effort classification
from the audit artifact §fs Write Migration Map.

`deleteProject`'s `fs.rmSync` replaced with `fs.delete_dir` L2 tool call.

### Stage 2D — New test scenarios

- S25: `/api/ai/decision` end-to-end write via L2 — verify `tool_called: fs.write_file`
- S26: `/api/projects/activate` write path — verify `tool_called: fs.write_file` (x2)
- S27: `/api/projects/create` write path — verify `tool_called: fs.write_file`
- S28: `/api/ai/propose` write path — verify `tool_called: fs.write_file`
- S29: `/api/projects/delete` — verify `tool_called: fs.delete_dir`
- S30: `fs.delete_dir` path-rejection — path outside artifacts/projects/ → `status: DENIED`

### Stage 3 — Conditional split

If post-Stage-2 line count > 1500: extract helpers to separate module.
Target: apiServer.js ≤ 1500 lines after Stage 3.

### Stage 6 — Closure

- `progress/status.json`: `current_task: PHASE-6.C-CLOSED`, `next_phase: PHASE-7-A`
- `runtime_health` updated: scenarios 24→30, ZERO direct writes confirmed
- Exit Report written

## 4. Recreate policy

All 48 deleted endpoints are recoverable via:
1. `git show <stage-2A-commit> -- code/src/workspace/apiServer.js`
2. Copy the endpoint block
3. Paste inside `requestHandler` before the 404 fallback

Underlying engines and modules are NEVER deleted.

## 5. Risks

- **R1. Router regression:** Any KEEP endpoint accidentally deleted will break web UI.
  Mitigation: S25-S29 scenarios + full baseline S01-S24 regression before commit #3.
- **R2. createDecisionPacket multi-write:** 6 writes + 1 mkdir. Helper functions
  handle the mkdir inline; migration wraps each write individually.
- **R3. deleteProject path escape:** Mitigated by Condition 2 in §F3.
- **R4. Line count target:** ~1800 lines post-2A. Stage 3 conditional at >1500.

## 6. Owner approval

Approval: **OWNER_APPROVED — 2026-05-09**

Option A (fs.delete_dir addition) accepted with 3 mandatory protection conditions.
Dead code cluster removal confirmed with recreation policy.
All stages approved: 2A → 2B → 2C → 2D-G → 2H → 3(conditional) → 6.
