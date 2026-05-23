# DECISION — PHASE-15 Stage 15.1 Closure

**Artifact ID:** DECISION-2026-05-23T12-00-phase-15-stage-15-1-closure  
**Date:** 2026-05-23  
**Owner approval:** CTO verified 2026-05-23 — technical work confirmed, §ARC clean  
**Status:** CLOSED

---

## Decision

Stage 15.1 of PHASE-15 is formally CLOSED. The two backend read endpoints are live, tested, and Track A compliant. Stage 15.2 (React Vision + KB views) opens pending a fresh PROMPT from the owner.

---

## Deliverables

### §1.A — GET /api/vision
**File:** `code/src/workspace/apiServer.js` (lines 1984–1996)

Wraps `createVisionEngine({ root }).getCurrentVision(projectId)` via inline require. No direct `fs.*Sync`, no `fetch()`, no `new OpenAI()`, no `child_process` in the new block.

- Returns `{ ok: true, project_id, vision: { frontmatter, body } }` when vision.md exists
- Returns `{ ok: true, project_id, vision: null }` when no vision.md
- Returns `{ ok: false, error }` on 500

### §1.B — GET /api/kb/sources
**File:** `code/src/workspace/apiServer.js` (lines 1998–2013)

Wraps `reg.invoke("kb.list_sources", { project_id, scope }, { root })` via `getDefaultRegistry()`. No direct tool call, no registry bypass.

- Returns `{ ok: true, project_id, scope, sources: [...], count: N }` on SUCCESS
- Returns `{ ok: false, error }` on tool failure or exception

### Out of scope (confirmed by CTO at mid-checkpoint)
- GET /api/kb/citations — dropped. `kb.cite` is `WORKSPACE_WRITE`, not a read tool. No `kb.list_citations` L2 tool exists.

---

## SU Suite

```
ALL PASS — 210 passed, 0 failed, 5 skipped (215 total)
```

| Scenario | Result |
|---|---|
| S213 — api vision, no vision.md → null | PASS |
| S214 — api vision, valid vision.md → frontmatter+body | PASS |
| S215 — api kb/sources, empty project → count 0 | PASS |

Pre-Stage-15.1 baseline: 207/0/5 (212 total). Delta: +3 scenarios, 0 regressions.  
CTO Linux run: 202/8/5 — the known 8-scenario environment delta; zero regression confirmed.

---

## Track A

| Check | Result |
|---|---|
| `fetch(` in apiServer.js | No matches |
| `new OpenAI(` in apiServer.js | No matches |
| `child_process` in apiServer.js | No matches |
| `fs.*Sync` in PHASE-15 blocks (lines 1984+) | None — all pre-existing |

**§ARC count: 6 (unchanged)**

`kb_tools.js` md5 IDENTICAL — not modified. Wrap, not rewrite. ✓

---

## Files Created / Modified

| File | Action |
|---|---|
| `code/src/workspace/apiServer.js` | MODIFIED — Vision + KB sources endpoints |
| `code/src/testing/helpers/vision_kb_test_helper.js` | CREATED |
| `code/src/testing/scenarios/S213_*.json` | CREATED |
| `code/src/testing/scenarios/S214_*.json` | CREATED |
| `code/src/testing/scenarios/S215_*.json` | CREATED |
| `artifacts/decisions/DECISION-2026-05-23T10-00-phase-15-vision-kb-frontend-views.md` | CREATED (corrected — citations out of scope) |
| `artifacts/decisions/_phase_15_checkpoints/stage_15_1_mid.md` | CREATED |
| `artifacts/decisions/_phase_15_checkpoints/stage_15_1.md` | CREATED |

---

## Cost

$0.00 (mock-only, no LLM calls)

---

## Next

Stage 15.2 — React Vision + KB views replace the stubs in `VisionView.tsx` and `KBView.tsx`. Opens with a fresh PROMPT from the owner.
