# Stage 15.1 Closure Artifact

**Date:** 2026-05-23  
**Phase:** PHASE-15 — Stage 15.1 (Vision + KB read endpoints)  
**Status:** COMPLETE — pending CTO snapshot verification

---

## §1 — Deliverables Completed

### §1.A — GET /api/vision
**File:** `code/src/workspace/apiServer.js` (lines 1984–1996)

Wraps `createVisionEngine({ root }).getCurrentVision(projectId)` — no bypass, no direct fs in the endpoint block.

- `project_id` from `requestUrl.searchParams.get("project_id")`, fallback `readActiveProjectId()`
- Returns `{ ok: true, project_id, vision: { frontmatter, body } }` when `vision.md` exists
- Returns `{ ok: true, project_id, vision: null }` when no `vision.md`
- Returns `{ ok: false, error }` on 500

### §1.B — GET /api/kb/sources
**File:** `code/src/workspace/apiServer.js` (lines 1998–2013)

Wraps `reg.invoke("kb.list_sources", { project_id, scope }, { root })` — no bypass, no direct fs.

- `project_id` from searchParams, fallback `readActiveProjectId()`
- `scope` from searchParams, default `"project"`
- Returns `{ ok: true, project_id, scope, sources: [...], count: N }` on SUCCESS
- Returns `{ ok: false, error }` on tool failure or exception
- `kb.list_sources` is `required_mode: "READ_ONLY"` — always authorized by policy Step 3

### §1.C — OUT OF SCOPE (confirmed by CTO mid-checkpoint)
- GET /api/kb/citations — NO. kb.cite is WORKSPACE_WRITE, not a read tool. No kb.list_citations L2 tool exists. Scope creep — rejected.

---

## §2 — SU Suite Result

**Literal output line:**
```
ALL PASS — 210 passed, 0 failed, 5 skipped (215 total)
duration: 50653ms
```

| Scenario | Name | Result |
|---|---|---|
| S213 | api vision — GET /api/vision with no vision.md returns null | PASS ✓ |
| S214 | api vision — GET /api/vision with valid vision.md returns frontmatter + body | PASS ✓ |
| S215 | api kb/sources — GET /api/kb/sources with no sources returns empty array | PASS ✓ |

**Pre-Stage-15.1 baseline:** 207/0/5 (212 total)  
**Stage 15.1 baseline:** 210/0/5 (215 total)  
**Delta:** +3 scenarios, 0 regressions

---

## §3 — Track A Greps (scoped to `code/src/workspace/apiServer.js`)

These greps confirm the PHASE-15 blocks introduce no §ARC violations:

**`fetch(` in apiServer.js:**
```
No matches found
```

**`fs.*Sync` in apiServer.js (pre-existing — none in PHASE-15 blocks at lines 1984+):**
```
72:    fs.mkdirSync(dirPath, { recursive: true });
112:    if (!fs.existsSync(approvalPolicyPath)) {
117:      const parsed = JSON.parse(fs.readFileSync(approvalPolicyPath, "utf-8"));
271:        exists: fs.existsSync(absPath),
595:    const ids = fs.readdirSync(projectsRoot, { withFileTypes: true })
620:    const proposalCount = fs.existsSync(proposalRoot)
621:      ? fs.readdirSync(proposalRoot).filter((name) => name.endsWith(".proposal.json")).length
624:    const draftCount = fs.existsSync(draftRoot)
625:      ? fs.readdirSync(draftRoot).filter((name) => name.endsWith(".draft.json")).length
827:    if (!fs.existsSync(activeProjectPath)) {
846:    while (fs.existsSync(getProjectArtifactsRoot(projectId))) {
872:    if (!fs.existsSync(projectRoot)) {
923:    if (!fs.existsSync(metadataDir)) {
927:    return fs.readdirSync(metadataDir)
931:        const stat = fs.statSync(fullPath);
935:          parsed = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
993:      if (fs.existsSync(file.absolutePath)) {
994:        oldContent = fs.readFileSync(file.absolutePath, "utf-8");
1165:      const oldContent = fs.existsSync(file.absolutePath)
1166:        ? fs.readFileSync(file.absolutePath, "utf-8")
1471:    const fileExists = fs.existsSync(targetAbsolutePath);
1545:      if (fs.existsSync(absPath)) {
1546:        const raw = JSON.parse(fs.readFileSync(absPath, "utf8"));
1871:        if (!fs.existsSync(absolutePath)) {
1876:        const content = fs.readFileSync(absolutePath, "utf-8")
```
(All pre-existing, all before line 1984. The PHASE-15 blocks at lines 1984–2013 contain zero fs.*Sync.)

**`new OpenAI(` in apiServer.js:**
```
No matches found
```

**`child_process` in apiServer.js:**
```
No matches found
```

**§ARC count: 6 (unchanged)**

---

## §4 — Files Modified / Created

| File | Action |
|---|---|
| `code/src/workspace/apiServer.js` | MODIFIED — added Vision + KB sources endpoints (lines 1984–2013) |
| `code/src/testing/helpers/vision_kb_test_helper.js` | CREATED — test helper with runS213VisionNull, runS214VisionData, runS215KbSourcesEmpty |
| `code/src/testing/scenarios/S213_api_vision_returns_null_no_vision_file.json` | CREATED |
| `code/src/testing/scenarios/S214_api_vision_returns_data_with_vision_file.json` | CREATED |
| `code/src/testing/scenarios/S215_api_kb_sources_returns_empty_for_new_project.json` | CREATED |
| `artifacts/decisions/DECISION-2026-05-23T10-00-phase-15-vision-kb-frontend-views.md` | CREATED (corrected — citations dropped from scope) |
| `artifacts/decisions/_phase_15_checkpoints/stage_15_1_mid.md` | CREATED |
| `artifacts/decisions/_phase_15_checkpoints/stage_15_1.md` | CREATED (this file) |
| `progress/status.json` | MODIFIED — PHASE-15 activation + Stage 15.1 data |

**Files NOT modified (per Track A discipline):**
- `code/src/runtime/tools/kb_tools.js` — untouched
- `code/src/ai_os/visionEngine.js` — untouched

---

## §5 — No New §ARC Entries

The PHASE-15 endpoints reach KB and Vision data exclusively through:
1. `createVisionEngine({ root }).getCurrentVision(projectId)` — pre-existing engine
2. `reg.invoke("kb.list_sources", ...)` — pre-existing L2 tool via pre-existing registry

§ARC stays at 6. No new direct fs.*Sync, no fetch(), no new OpenAI(), no child_process in the new code.

---

## §6 — Cost

Stage 15.1 is mock-only. API cost: **$0.00** (per §6 budget).

---

## §7 — Risks / Notes

- None blocking.
- The `readActiveProjectId()` fallback in both endpoints reads `artifacts/active_project.json` — pre-existing behavior, not new.
- `vision_kb_test_helper.js` uses `fs.*Sync` directly — this is test infrastructure, explicitly permitted by §ARC convention.
- S215 tests the empty-project case only. A non-empty case is covered by S130 (`kb.list_sources returns seeded source from manifest`) which was a pre-existing scenario.
