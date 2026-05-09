# DECISION-20260509-phase-6.B.5-final-ai-os-migration

| Field | Value |
|---|---|
| Status | OWNER_APPROVED — 2026-05-09 |
| Authored | 2026-05-09 |
| Related | DECISION-20260509-phase-6.B.4-docs-delivery-migration |

## 1. Context

PHASE-6.B.4 closed the documentation/delivery cluster. PHASE-6.B.5 is
the **final ai_os migration phase** — closes the remaining 6 engines
in one expanded session. After 6.B.5: every ai_os engine writes via
L2 Tool Runtime. Only `apiServer.js` direct writes remain (PHASE-6.C).

Why one session: the remaining engines are small (74-279 lines), share
identical migration patterns established in 6.A–6.B.4, and the per-phase
overhead (decision artifact, exit report, status updates) outweighs
the actual migration work for individual engines.

## 2. Decision (10 fronts)

### F1 — discussionLoopGate.js

- Move helpers (ensureDir, writeJson, readJsonSafe, nowIso) from module-level into `createDiscussionLoopGate` closure.
- `writeJson` → async via `reg.invoke("fs.write_file", ...)`. Remove ensureDir.
- `assertDiscussionComplete` → async (was sync). Internal `writeJson(gatePath, ...)` becomes `await tryWriteJson(...)`.
- `recordDiscussionIteration` → async (was sync). Internal `writeJson(logPath, ...)` becomes `await tryWriteJson(...)`.
- `getDiscussionIterations` stays sync (read-only).
- Best-effort pattern: gate persistence and log persistence are auxiliary. The gate decision itself (passed/failed checks) is what matters.

### F2 — languageDetectionCompliance.js

- Move module-level helpers into closure.
- `validateLanguageConsistency` → async (was sync). 1 write site (compliance log) — best-effort.
- `runComplianceReport` → async (was sync). 1 write site (compliance report) — best-effort.
- Module-level constants (SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, regex patterns) stay at module-level.
- `detectLanguage` is pure — stays sync.

### F3 — projectReviewEngine.js

- Helpers already in closure — no reorg.
- 2 writes (review log via appendArrayJson + review report via writeJson) → async with try-wrappers. Best-effort.
- `reviewProject` already async; only internal awaits added.

### F4 — refinementLoopOrchestrator.js

- Helpers already in closure — no reorg.
- 3 write sites:
  - W1 (generic writeJson helper): standard async pattern
  - W2 (refinement log appendArrayJson): best-effort
  - W3 (raw markdown via fs.writeFileSync): introduce `tryWriteFile` helper; best-effort
- `runIdeationLoop`, `runDocumentationLoop` already async; only internal awaits added.

### F5 — uxValidator.js

- Move module-level helpers (ensureDir, writeJson, nowIso) into `createUxValidator` closure.
- **Preserve module-level:** `UX_RULES`, `ARABIC_PATTERN`, `ENGLISH_PATTERN`, and all check functions — pure functions referenced by UX_RULES.
- `validateResponse` → async (was sync). 1 write site (ux validation log) — best-effort.
- `runUxReport` → async (was sync). 1 write site (ux validation report) — best-effort.
- `module.exports = { createUxValidator, UX_RULES };` preserved.

### F6 — verificationLoop.js

- Helpers already in closure — no reorg.
- 2 writes (verification log + report) → async with try-wrappers. Best-effort.
- `runVerification` already async; only internal awaits added.

### F7 — decisionClassifier.js (audit only)

- Pre-flight grep confirmed 0 fs writes.
- File contains pure logic: classifyDecision, generatePauseMessage, etc.
- **No code changes.** Documented as "audited; no migration needed".

### F8 — apiServer.js (mini async cascade — 4 lines)

The exception explicitly allowed for this phase. Each line gets `await` inserted:

```js
// line 3438
sendJson(res, 200, await discussionLoopGate.assertDiscussionComplete(body));
// line 3444
sendJson(res, 200, await discussionLoopGate.recordDiscussionIteration(body.project_id, body));
// line 3462
sendJson(res, 200, await languageDetectionCompliance.runComplianceReport(body.project_id));
// line 3468
sendJson(res, 200, await uxValidator.validateResponse(body.project_id, body.response));
```

Note: the request handler is already inside an `async` function — safe to add `await`.

### F9 — 5 new scenarios + scenario_runner extension

5 scenarios, one per engine with a meaningful entry point. verificationLoop migrated but not covered by a new scenario in this phase (rationale: verification flow requires multi-stage fixture orchestration; deferred). Migration safety established via structural verification + backwards compat.

| Scenario | Engine | Method | Asserts |
|---|---|---|---|
| S20 | discussionLoopGate | assertDiscussionComplete | gate JSON persists; ok=true on complete fixture |
| S21 | languageDetectionCompliance | validateLanguageConsistency | compliance log persists; ok=true |
| S22 | projectReviewEngine | reviewProject | review log + report persist (mock provider) |
| S23 | refinementLoopOrchestrator | runIdeationLoop | refinement log persists (mock ideation provider) |
| S24 | uxValidator | validateResponse | ux validation log persists; ok=true on valid response |

**F9.5 — scenario_runner positional-args extension:**
`validateLanguageConsistency(projectId, responseText, expectedLang)` and `validateResponse(projectId, response)` take positional args, not a body object. Extend `_runDirectEngine` to detect `_args` array in `scenario.input` and call `methodFn.apply(engine, args)` instead of `methodFn.call(engine, input)`. Back-compat for all existing scenarios preserved.

### F10 — Documentation

- This decision artifact.
- `progress/status.json`: `current_task → PHASE-6.B.5-CLOSED`, `next_phase → PHASE-6.C`.
- FINDINGS-INFO-4: `verificationLoop` migrated without dedicated scenario; backed by structural + smoke verification.
- Exit Report.

## 3. Acceptance criteria

1. ✓ `node bin/forge-test.js` → **24 PASS / 0 FAIL / 0 SKIP** (was 19/19).
2. ✓ S20-S24 each have ≥3 assertions, all PASS.
3. ✓ `grep -rE "fs\.(writeFileSync|unlinkSync|mkdirSync|rmSync)" code/src/ai_os/` returns **0 matches** across entire ai_os directory.
4. ✓ `decisionClassifier.js` audited; file unchanged.
5. ✓ apiServer 4 await sites added, no other changes to apiServer.
6. ✓ §3.11 Negative test: S20 artifact_exists fails when gate write disabled. Revert → 24/24.
7. ✓ §3.12 L3 reach: S22 READ_ONLY → artifact_exists fails (best-effort denied). Audit shows DENIED. Revert → 24/24.
8. ✓ All 5 smoke suites PASS — explicit exit code check on each (Bug-11 prevention).
9. ✓ Backwards compat: S01-S19 still PASS unchanged.
10. ✓ Cleanup: no `test_engine_*` directories leftover.
11. ✓ apiServer diff shows 4 deletions + 4 additions. Each added line = deleted line + "await" inserted before the engine call. No other changes to apiServer.

## 4. Rollback plan

```bash
git checkout HEAD~1 -- \
  code/src/ai_os/discussionLoopGate.js \
  code/src/ai_os/languageDetectionCompliance.js \
  code/src/ai_os/projectReviewEngine.js \
  code/src/ai_os/refinementLoopOrchestrator.js \
  code/src/ai_os/uxValidator.js \
  code/src/ai_os/verificationLoop.js \
  code/src/workspace/apiServer.js
rm code/src/testing/scenarios/S2{0,1,2,3,4}_*.json
```

## 5. Risks

- **R1. apiServer cascade incomplete.** If we miss one of the 4 sites, the endpoint silently returns `{}`. Mitigation: AC #5 diff verification.
- **R2. Language compliance regex.** ARABIC_PATTERN and ENGLISH_PATTERN must stay at module-level. Mitigation: F2 explicit.
- **R3. UX_RULES references module-level check functions.** Moving check functions inside closure would break UX_RULES export. Mitigation: F5 explicit — only ensureDir/writeJson/nowIso move.
- **R4. refinementLoopOrchestrator dual-mock.** S23 uses runIdeationLoop (single mock). runDocumentationLoop not tested in this phase.
- **R5. verificationLoop migrated without dedicated scenario.** Logged FINDINGS-INFO-4.
- **R6. async context confirmation in apiServer.** Every endpoint handler verified to be in async context before edit.
- **R7. No hidden sync callers.** Cross-codebase scan (§3.0) performed before edits.

## 6. Bug-tracking section

| Bug | File:Line | Surface | Resolution |
|---|---|---|---|
| (none yet) | | | |

## 7. decisionClassifier audit

File: `code/src/ai_os/decisionClassifier.js`  
Lines: 151  
fs writes: **0** (verified via `grep -nE "fs\." code/src/ai_os/decisionClassifier.js` → empty)  
Type: pure logic — exports `classifyDecision`, `generatePauseMessage`, etc.  
**Verdict: no migration needed. File unchanged in this phase.**

## 8. Owner approval

Approval: **OWNER_APPROVED — 2026-05-09**
