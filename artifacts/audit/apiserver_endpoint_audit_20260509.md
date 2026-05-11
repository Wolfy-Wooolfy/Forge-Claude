# apiServer.js Endpoint Audit — PHASE-6.C Stage 1

| Field | Value |
|---|---|
| Authored | 2026-05-09 |
| Authority | DECISION-20260509-phase-6.C-apiserver-migration.md (pending) |
| apiServer.js size at audit | 3577 lines |
| Total endpoints (pathname + req.url) | 85 |
| Web UI endpoints (all 20 now in apiServer) | 20 |
| Internal code references (non-web) | 4 additional |
| Pipeline lifecycle / MCP baseline | 13 additional |
| **Decision: KEEP** | **37** |
| **Decision: DELETE** | **48** |
| fs writes at audit (total) | 24 |
| fs writes in KEEP paths (to migrate) | 17 |
| fs writes that disappear with deletion | 5 (lines 2851, 2854, 3164 + dead code 1364/1423) |

> **Scope correction vs prompt estimate:**
> The prompt predicted 71 endpoints / 57 orphans. Actual count is 85 / 66 orphans.
> The 14-endpoint gap: `/api/ai/*` and `/api/auth/*` use `req.url` instead of `pathname`;
> the initial grep pattern missed them. All 15 web UI literal endpoints ARE in apiServer;
> 5 additional web calls use template strings (`${apiBase}/api/ai/...`). Total web = 20.

---

## Recreate-on-demand policy

For any deleted endpoint, restoration time is approximately 5 minutes:
1. Find the entry in this audit
2. Copy the "Recreate code" snippet
3. Paste into `apiServer.js` inside the `requestHandler` function before the governance block
4. Original code preserved in git history (`git show <commit> -- code/src/workspace/apiServer.js`)

The underlying engines/modules are NEVER deleted. Only the HTTP wrapper.

---

## ENDPOINTS — KEEP (37)

### Group A — Web UI (20 endpoints, all mandatory)

| Endpoint | Method | Used via |
|---|---|---|
| `/api/ai-os/chat/stream` | POST | template: `${apiBase}/api/ai-os/chat/stream` |
| `/api/ai-os/clarification/answer` | POST | literal in web UI |
| `/api/ai-os/intake` | POST | literal in web UI |
| `/api/ai/analyze` | POST | literal + req.url match |
| `/api/ai/approval-policy` | GET | template: `${apiBase}/api/ai/approval-policy` |
| `/api/ai/clarify` | POST | literal + req.url match |
| `/api/ai/confirm-strategy` | POST | literal + req.url match |
| `/api/ai/decision` | POST | template: `${apiBase}/api/ai/decision` (approve button) |
| `/api/ai/history` | GET | template: `${apiBase}/api/ai/history` |
| `/api/ai/options` | POST | literal + req.url match |
| `/api/ai/preview` | POST | template: `${apiBase}/api/ai/preview` |
| `/api/ai/propose` | POST | literal + req.url match |
| `/api/ai/read-file` | POST | literal + req.url match |
| `/api/ai/select-strategy` | POST | literal + req.url match |
| `/api/auth/login` | POST | literal in web UI |
| `/api/auth/register` | POST | literal in web UI |
| `/api/projects` | GET | literal in web UI |
| `/api/projects/activate` | POST | literal in web UI |
| `/api/projects/create` | POST | literal in web UI |
| `/api/projects/delete` | POST | literal in web UI |

### Group B — Internal code references (4 endpoints)

| Endpoint | Method | Used by |
|---|---|---|
| `/api/ai-os/chat` | POST | Internal test infrastructure (code/src/) |
| `/api/ai-os/verify` | POST | Internal code/src/ references |
| `/api/governance/spec-completeness` | POST | Internal module call (code/src/) |
| `/api/governance/vision-compliance` | POST | Internal module call (code/src/) |

### Group C — Pipeline lifecycle / MCP baseline (13 endpoints)

Not currently called from web UI or internal code, but these map 1:1 to the Forge A→B→C→D pipeline.
Kept for: future MCP client compatibility, future web UI wiring, API clients (non-web).

| Endpoint | Method | Pipeline stage |
|---|---|---|
| `/api/ai-os/active-project` | GET | Project state read |
| `/api/ai-os/active-project/switch` | POST | Project state write |
| `/api/ai-os/business-analysis` | POST | Stage A — market analysis |
| `/api/ai-os/decision` | POST | Stage A — owner decision |
| `/api/ai-os/delivery/package` | POST | Stage C/D — delivery |
| `/api/ai-os/doc-build-loop` | POST | Stage B — documentation |
| `/api/ai-os/doc-build-loop/state` | GET | Stage B — doc loop state |
| `/api/ai-os/handoff` | POST | B→C handoff |
| `/api/ai-os/ideation/expand` | POST | Stage A — ideation |
| `/api/ai-os/options` | POST | Stage A — options |
| `/api/ai-os/project` | GET | Project info |
| `/api/ai-os/projects/list` | GET | Project list |
| `/api/ai-os/review` | POST | Stage B — review |

---

## ENDPOINTS — DELETED (48)

### Group D — Engine-internal duplicates (21)

These wrap ai_os engines that are: (a) already tested by S20-S24 scenarios, and
(b) callable directly from internal code without HTTP. The HTTP wrapper is redundant.

| # | Endpoint | Method | Engine covered by | Scenario |
|---|---|---|---|---|
| 1 | `/api/ai-os/checkpoint` | POST | runtimeStateManager.writeCheckpoint | — |
| 2 | `/api/ai-os/confirm-operation` | POST | (unused guard endpoint) | — |
| 3 | `/api/ai-os/confirm-transition` | POST | (unused guard endpoint) | — |
| 4 | `/api/ai-os/conversation/context` | GET | conversationEngine internal | — |
| 5 | `/api/ai-os/conversation/summary` | POST | conversationEngine internal | — |
| 6 | `/api/ai-os/decisions/history` | GET | (read-only admin; use CLI) | — |
| 7 | `/api/ai-os/discussion/gate` | POST | discussionLoopGate.assertDiscussionComplete | S20 |
| 8 | `/api/ai-os/discussion/record` | POST | discussionLoopGate.recordDiscussionIteration | S20 |
| 9 | `/api/ai-os/documentation/approve` | POST | documentationBuildLoop | — |
| 10 | `/api/ai-os/documentation/draft` | POST | documentationBuildLoop | — |
| 11 | `/api/ai-os/documentation/review` | POST | documentationReviewEngine | — |
| 12 | `/api/ai-os/language-compliance` | POST | languageDetectionCompliance.validateLanguageConsistency | S21 |
| 13 | `/api/ai-os/loop/documentation` | POST | refinementLoopOrchestrator.runDocumentationLoop | — |
| 14 | `/api/ai-os/loop/ideation` | POST | refinementLoopOrchestrator.runIdeationLoop | S23 |
| 15 | `/api/ai-os/override/force-progression` | POST | (admin-only; runtimeStateManager) | — |
| 16 | `/api/ai-os/project/context` | GET | projectRuntime.getProjectContext | — |
| 17 | `/api/ai-os/project/ensure-model` | POST | projectRuntime.ensureModel | — |
| 18 | `/api/ai-os/project/summary` | GET | projectRuntime.getSummary | — |
| 19 | `/api/ai-os/research` | POST | researchProvider direct | — |
| 20 | `/api/ai-os/research/wrap` | POST | researchProvider wrapped | — |
| 21 | `/api/ai-os/ux-validate` | POST | uxValidator.validateResponse | S24 |

### Group E — Legacy workspace AI endpoints (3)

These are from an older code-generation flow that was superseded by the current `/api/ai/*` flow.

| # | Endpoint | Method | Note |
|---|---|---|---|
| 22 | `/api/ai/approve` | POST | Old approval flow (superseded by `/api/ai/decision`). Deleting removes writes at lines 2851, 2854. |
| 23 | `/api/ai/apply-execute-plan` | POST | Always returns 409 BLOCKED — contains dead function `applyExecutionPlan()`. Deleting removes dead writes at lines 1364, 1423. |
| 24 | `/api/ai/draft` | POST | Returns hardcoded mock draft. No write operations. |

### Group F — Governance validators (24)

These wrap modules in `code/src/modules/`. The modules are protected and remain. Only the HTTP wrappers are deleted.

| # | Endpoint | Method | Module wrapped |
|---|---|---|---|
| 25 | `/api/governance/boundary-audit-all` | GET | boundaryAuditStageGate.auditAllStages |
| 26 | `/api/governance/boundary-audit-gate` | POST | boundaryAuditStageGate.runBoundaryAuditStageGate |
| 27 | `/api/governance/canonical-artifacts` | POST | canonicalArtifactValidator.runCanonicalArtifactValidator |
| 28 | `/api/governance/codex-contract` | POST | codexContractValidator.runCodexContractValidator |
| 29 | `/api/governance/cognitive-contract` | POST | cognitiveLayerContractEnforcer.runCognitiveLayerContractEnforcer |
| 30 | `/api/governance/cross-doc-consistency` | POST | crossDocConsistencyEngine.runCrossDocConsistencyEngine |
| 31 | `/api/governance/decision-finality` | POST | decisionFinalityEnforcer.runDecisionFinalityEnforcer |
| 32 | `/api/governance/decision-naming` | POST | decisionFileNameEnforcer.runDecisionFileNameEnforcer |
| 33 | `/api/governance/decision-seal` | POST | decisionFinalityEnforcer.sealDecision |
| 34 | `/api/governance/decision-validate` | POST | decisionArtifactValidator.runDecisionArtifactValidator |
| 35 | `/api/governance/doc-gap-contract` | POST | docGapLoopContract.runDocGapLoopContract |
| 36 | `/api/governance/docs-gap-analyze` | POST | docsGapAnalyzerValidator.runDocsGapAnalyzerValidator |
| 37 | `/api/governance/fork/declare` | POST | forkDetectionEngine.declareFork |
| 38 | `/api/governance/fork/report` | GET | forkDetectionEngine.runForkDetectionReport |
| 39 | `/api/governance/fork/resolve` | POST | forkDetectionEngine.resolveFork |
| 40 | `/api/governance/loop-report` | GET | loopEnforcementOrchestrator.runFullLoopReport |
| 41 | `/api/governance/project-isolation` | POST | projectIsolationGuard.runProjectIsolationGuard |
| 42 | `/api/governance/provider-authority` | POST | providerAuthorityEnforcer.runProviderAuthorityEnforcer |
| 43 | `/api/governance/recommendation-separation` | POST | recommendationSeparationValidator.runRecommendationSeparationValidator |
| 44 | `/api/governance/research-transparency` | POST | researchTransparencyLayer.runResearchTransparencyReport |
| 45 | `/api/governance/smoke-check` | POST | nodeSmokeCheck.runNodeSmokeCheck |
| 46 | `/api/governance/tool-readiness` | POST | toolIntegrationReadiness.runToolIntegrationReadiness |
| 47 | `/api/governance/trace-validate` | POST | codeToSpecTraceValidator.runCodeToSpecTraceValidator |
| 48 | `/api/governance/vision-alignment` | POST | visionAlignmentValidator.runVisionAlignmentValidator |

---

## fs Write Migration Map (Stage 2C)

After Stage 2A deletions, **17 fs write operations remain** in live code paths (+ 1 mkdirSync in createDecisionPacket).

| Location | Line | Function | Pattern | Reason |
|---|---|---|---|---|
| buildAiAnalysisArtifacts | 1262 | conversation.json write | best-effort | log artifact |
| buildAiAnalysisArtifacts | 1263 | context.json write | best-effort | log artifact |
| buildAiAnalysisArtifacts | 1264 | analysis.json write | best-effort | log artifact |
| buildAiProposalArtifacts | 1619 | proposal.json write | HARD | proposal state |
| buildAiProposalArtifacts | 1620 | draft.json write | HARD | draft state |
| writeActiveProject | 1693 | active_project.json | HARD | active project state |
| persistProjectState | 1880 | project_state.json | HARD | project state |
| persistProjectState | 1902 | project_registry.json | HARD | project registry |
| deleteProject | 1988 | rmSync (dir) | HARD | project deletion — **see STOP below** |
| writeDecisionLinkArtifact | 2031 | decision_link.json | best-effort | audit trail |
| appendDecisionLog | 2041 | decision_log.json | best-effort | append log |
| createDecisionPacket | 2311 | request.json | HARD | decision packet |
| createDecisionPacket | 2324 | response.json | HARD | decision packet |
| createDecisionPacket | 2332 | decision_packet.json | HARD | decision packet |
| createDecisionPacket | 2333 | decision_packet.md | HARD | decision packet |
| createDecisionPacket | 2338 | mkdirSync (inline) | HARD | dir creation |
| createDecisionPacket | 2339 | execution_package.json | HARD | execution package |
| createDecisionPacket | 2365 | metadata.json | HARD | packet metadata |

**STOP — fs.delete_dir required:**
`deleteProject` uses `fs.rmSync(dir, {recursive: true})`. The existing `fs.delete_file` tool only does `unlinkSync` (single file). No `fs.delete_dir` tool exists in `code/src/runtime/tools/fs_tools.js`.

**Two options (owner decision required):**
- **Option A (preferred):** Add `fs.delete_dir` tool to `fs_tools.js`. This is a new L2 tool addition — requires owner approval per §8 hard rules.
- **Option B (defer):** Leave `deleteProject`'s `rmSync` unmigrated in Stage 2C. Record as FINDINGS-INFO for PHASE-7-B.

---

## Protected layers (NEVER deleted by this phase)

| Layer | Count | Directory |
|---|---|---|
| ai_os engines | 17 | `code/src/ai_os/*.js` |
| governance modules | 33 | `code/src/modules/*.js` |
| runtime tools | 8 | `code/src/runtime/tools/*.js` |
| LLM providers | 13 | `code/src/providers/*.js` |
| web UI | — | `web/index.html` |
| CLI binaries | — | `bin/` |

---

## Recreate code — Group D (21 engine-internal endpoints)

For each deleted engine-internal endpoint, the recreate code is a direct copy from apiServer.js at the commit hash recorded in Stage 2A.

**Example format** (same pattern for all 21):

### /api/ai-os/discussion/gate (DELETE #7)
```js
if (req.method === "POST" && pathname === "/api/ai-os/discussion/gate") {
  const body = await readBody(req);
  sendJson(res, 200, await discussionLoopGate.assertDiscussionComplete(body));
  return;
}
```
**Original commit:** `<commit-hash-stage-2A>` (filled in after Stage 2A commit)
**Engine:** `code/src/ai_os/discussionLoopGate.js` → `assertDiscussionComplete()`

*(Full recreate code for all 48 endpoints is in git history at the Stage 2A commit.)*

---

## DEAD CODE REMOVAL (Stage 2A)

The following functions are removed entirely in Stage 2A as a cluster. None of them execute in any live code path.

| Function | Lines (pre-migration) | Why dead |
|---|---|---|
| `buildFocusedFileContext()` | 409-427 | Defined, never called anywhere |
| `applyPatchOperations()` | 538-630 | Only called by materializeDraftFilesForApproval + applyExecutionPlan (both dead) |
| `buildExecutionPlanFromDraft()` | 1279-1313 | Never called from any code path |
| `materializeDraftFilesForApproval()` | 1315-1338 | Only called from handleApprove (endpoint deleted in Group E #22) |
| `applyExecutionPlan()` | 1340-1441 | Only called from handleApplyExecutePlan which always returns 409 |
| `handleApprove()` | 2771-2871 | Handler for /api/ai/approve (Group E #22, deleted) |
| `handleApplyExecutePlan()` | 2873-2879 | Handler for /api/ai/apply-execute-plan (Group E #23, deleted) |

**Recreate code (restore from git history):**
```bash
git show <stage-2A-commit> -- code/src/workspace/apiServer.js | grep -A 200 "function applyExecutionPlan"
```
All 7 functions recoverable from the Stage 2A commit hash.

---

## Findings

**FINDINGS-INFO-6a:** Endpoint count correction.
The prompt estimated 71 endpoints; actual is 85. The difference is 14 `/api/ai/*` + `/api/auth/*` endpoints
that use `req.url` instead of `pathname` for URL matching. All of them are captured in this audit.

**FINDINGS-INFO-6b:** Web UI endpoint count correction.
The prompt estimated 24 web UI endpoints in apiServer; actual is 20. The 5 additional ones found
via template strings: chat/stream, approval-policy, decision, history, preview.

**FINDINGS-INFO-6c:** fs.delete_dir missing from L2 Tool Runtime.
`deleteProject` requires recursive directory delete (`fs.rmSync({recursive: true})`).
`fs.delete_file` only supports file unlinking. A new tool must be added or the migration deferred.
Owner decision required before Stage 2C begins.

**FINDINGS-INFO-6d:** Dead code discovered.
`applyExecutionPlan()` (lines 1340-1442) is never called anywhere.
`handleApplyExecutePlan()` always returns 409 BLOCKED.
Deleting `/api/ai/apply-execute-plan` removes this dead code cleanly, including the
"user project file writes" at lines 1364, 1423 that the prompt marked as FINDINGS-INFO-5.
Those writes are already dead — they never execute.

**FINDINGS-INFO-6e:** createDecisionPacket writes not in prompt's F2 map.
`createDecisionPacket()` has 6 writeFileSync + 1 mkdirSync (lines 2311-2365).
These are active — called from `handleDecision` (`/api/ai/decision`, web UI KEEP endpoint).
They must be migrated in Stage 2C. The prompt's F2 map listed ~12 writes; actual is 17+1.

---

## Summary

After Stage 2A execution:
- apiServer.js reduces from **3577 → ~1800 lines** (~49% reduction)
- Endpoint count: **85 → 37** (48 deleted)
- fs writes to migrate in Stage 2C: **17 live writes + 1 mkdirSync** (5 disappear with deletions)
- All engines / modules / runtime / web untouched
- Restoration policy documented for all 48 deletions (git history + recreate pattern)

**STOP REQUIRED before Stage 2C:** Owner decision on `fs.delete_dir` (FINDINGS-INFO-6c).
Stages 2A and 2B can proceed without it. Stage 2C requires it for `deleteProject`.
