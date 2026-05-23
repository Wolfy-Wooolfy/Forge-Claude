# Stage 15.1 Mid-Checkpoint

**Date:** 2026-05-23  
**Phase:** PHASE-15 — Stage 15.1 (Vision + KB read endpoints)  
**Checkpoint trigger:** §3 of PROMPT-STAGE-15.1 — after §1.A (Vision endpoint) and BEFORE §1.B (KB sources endpoint)

---

## §A — Vision Endpoint Design

### Endpoint
`GET /api/vision?project_id=<id>`

If `project_id` is omitted, falls back to `readActiveProjectId()` (pre-existing helper in apiServer.js).

### Response shape
```json
{ "ok": true, "project_id": "<id>", "vision": { "frontmatter": {...}, "body": "..." } }
```
When no `vision.md` exists:
```json
{ "ok": true, "project_id": "<id>", "vision": null }
```
On error (500):
```json
{ "ok": false, "error": "<message>" }
```

### Implementation location
`code/src/workspace/apiServer.js` — inline block before the final `sendJson(res, 404, ...)` fallthrough, at the end of the authenticated section (lines ~1984–1996).

### How it wraps visionEngine
```javascript
const { createVisionEngine } = require("../ai_os/visionEngine");
const vision = await createVisionEngine({ root }).getCurrentVision(projectId);
sendJson(res, 200, { ok: true, project_id: projectId, vision });
```
- `createVisionEngine({ root })` — factory, `root` comes from `options.root` (set at server startup)
- `getCurrentVision(projectId)` — reads `artifacts/projects/<projectId>/vision.md`, parses YAML frontmatter, returns `{ frontmatter, body } | null`
- No new direct `fs.*Sync`, no `fetch()`, no `new OpenAI()`, no `child_process` introduced

Pattern follows the pre-existing `/api/system/doctor` inline-require pattern already in apiServer.js.

---

## §B — Test Results (SU suite)

**Suite run:** `node bin/forge-test.js` — after S213 + S214 added  
**Result:** `209 passed, 0 failed, 5 skipped (214 total)` ✓

| Scenario | Name | Result |
|---|---|---|
| S213 | api vision — GET /api/vision with no vision.md returns null | PASS ✓ |
| S214 | api vision — GET /api/vision with valid vision.md returns frontmatter + body | PASS ✓ |
| S10  | doctor health check passes | PASS ✓ (restored after status.json fix) |
| S119 | overall harness doctor gate | PASS ✓ (restored after status.json fix) |

**Pre-existing baseline before PHASE-15:** 207 passed, 0 failed, 5 skipped (212 total)  
**New baseline after §1.A:** 209 passed, 0 failed, 5 skipped (214 total)  
**Delta:** +2 scenarios (S213, S214), 0 regressions

### Note on status.json fix
During Stage 15.1 work, S10 and S119 were found failing because `next_phase: null` in `progress/status.json` caused the `statusJsonValid` doctor check to treat it as a missing required field. This was a legitimate PHASE-15 activation update (authorized by the saved decision artifact). `status.json` was updated: `next_phase → "PHASE-15"`, `current_task → "PHASE-15-STAGE-15.1"`. Doctor restored to healthy.

---

## §C — Track A Grep State

All greps scoped to `code/src/**/*.js`.

### 1. `fetch(` — new usage in PHASE-15 code
**Result: NONE**  
All real `fetch()` occurrences are in pre-existing providers (businessAnalysisProvider.js, documentationReviewProvider.js, openai_driver.js, openAiRequirementDiscoveryProvider.js, researchProvider.js, openAiOptionsProvider.js, openAiExecutionFilesProvider.js, projectReviewProvider.js, openAiDocumentationProvider.js, intentClassificationProvider.js, ideationExpansionProvider.js). All pre-date PHASE-15. All remaining matches are Track A comment declarations.

### 2. `fs.*Sync` — new direct usage in PHASE-15 production code
**Result: NONE in production code**  
- `vision_kb_test_helper.js` — test helper; §ARC convention explicitly permits `fs.*Sync` in test infrastructure
- `apiServer.js` — was already in the match list before PHASE-15; the new Vision endpoint code uses only `createVisionEngine`, no direct `fs.*Sync`

### 3. `new OpenAI(` — new usage in PHASE-15 code
**Result: NONE**  
Only occurrences:
- `providers/_contract/openAiAdapter.js:24` — the authorized §L1 location
- `providers/conversationalResponseProvider.js:183,222` — pre-existing violation, predates PHASE-15

### 4. `child_process` — new usage in PHASE-15 code
**Result: NONE**  
18 files match, all pre-existing (harness_runner.js, shell_tools.js, env_tools.js, codexProvider.js, agent adapters, stress_test_runner.js, etc.)

### §ARC ledger count: 6 (unchanged)
| # | File | Exemption |
|---|---|---|
| §ARC-1 | _activity_emitter.js, cost_ledger/agents | cost_ledger/activity_emitter fs |
| §ARC-2 | live_smoke_runner.js | live smoke runner test fs |
| §ARC-3 | harness_runner.js + install scripts | harness runner + install child_process |
| §ARC-4 | kb/manifests.js + kb/cost_ledger.js | atomic JSONL writes |
| §ARC-5 | secrets providers | OS keychain via child_process |
| §ARC-6 | log_writer.js | direct fs for logging |

**No new §ARC entries introduced in Stage 15.1.** ✓

---

## §D — Anything Blocking

**Nothing blocking §1.B.**

- Vision endpoint: implemented, tested, passing
- §ARC: clean
- Test baseline: 209/0/5
- KB sources L2 tool confirmed: `kb.list_sources` in `code/src/runtime/tools/kb_tools.js`, signature `execute({ project_id, scope? }, ctx)` → `{ sources, count }`

**Confirmed out of scope (citations):** No citations endpoint. No `kb.list_citations` tool to be built. KB view = sources-only. This was ratified in the corrected decision artifact.

---

## §E — Next step (pending CTO confirmation)

§1.B — `GET /api/kb/sources` endpoint:
- Inline block in `apiServer.js`, before final 404
- Invokes `kb.list_sources` via `reg.invoke("kb.list_sources", { project_id, scope }, { root })`
- Response: `{ ok: true, project_id, scope, sources: [...], count: N }`
- New scenario: S215 (`runS215KbSourcesEmpty`) in `vision_kb_test_helper.js`
- New baseline target: 210/0/5

**STOP — awaiting CTO confirmation to proceed to §1.B.**
