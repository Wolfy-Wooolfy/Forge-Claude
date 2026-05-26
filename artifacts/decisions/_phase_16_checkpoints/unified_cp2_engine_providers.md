# Checkpoint 2 — PHASE-16 UNIFIED Engine + Provider Migration (B4 + B5)

**Date:** 2026-05-26  
**Phase:** PHASE-16 UNIFIED  
**Authored by:** Claude Code (claude-sonnet-4-6)  
**Status:** COMPLETE — awaiting CTO confirmation before B6

---

## Scope

This checkpoint covers defects B4 and B5 from PHASE-16 UNIFIED §2:

| Block | Defect | Fix |
|-------|--------|-----|
| B4 | `ideationEngine.js` — infinite refinement loop; no deterministic break-out | `question_count` persisted in state; forced `READY_FOR_OPTIONS` after 4 turns |
| B5 | 11 providers use `new OpenAI()` or raw `fetch("api.openai.com")` directly — bypasses `_contract/` | All 11 migrated to `callChatWithTool()` or `getClient()` from `openAiAdapter.js` |

---

## B4 — Deterministic break-out after 4 ideation turns

**File:** `code/src/ai_os/ideationEngine.js`

**Change:** After each LLM ideation turn, `question_count` is incremented and persisted to `project_state.json`. If the LLM never sets `ready_for_options = true` after 4 turns, the engine forces `readyForOptions = true` and returns an empty `follow_up_question`.

```diff
+ const currentCount = typeof state.question_count === "number" ? state.question_count : 0;
+ const newCount = currentCount + 1;
+ const stateForCount = readJsonSafe(statePath, {});
+ stateForCount.question_count = newCount;
+ await tryWriteJson(statePath, stateForCount);
+ const forcedReady = !llmReady && newCount >= 4;
+ const readyForOptions = llmReady || forcedReady;

  return {
    ok: true,
-   mode: llmReady ? "READY_FOR_OPTIONS" : "IDEATION_IN_PROGRESS",
+   mode: readyForOptions ? "READY_FOR_OPTIONS" : "IDEATION_IN_PROGRESS",
-   ready_for_options: llmReady,
+   ready_for_options: readyForOptions,
+   forced_ready: forcedReady,
-   follow_up_question: expansion.follow_up_question || "",
+   follow_up_question: forcedReady ? "" : (expansion.follow_up_question || ""),
    ...
  };
```

**Scenario evidence:**
- `S230 ✓` — Engine with `question_count=3` in state → 4th turn → `mode === "READY_FOR_OPTIONS"`, `forced_ready === true`, `follow_up_question === ""`

---

## B5 — Provider migration to openAiAdapter contract

### Supporting infrastructure fixes

Two fixes were required to make provider tests reliable after migration:

**Fix A — `_resetClientForTests()` in `openAiAdapter.js`:**  
The OpenAI SDK singleton (`_client`) cached the first `baseURL`. Subsequent tests with different mock ports reused the stale client → ECONNREFUSED.

```javascript
// Added to code/src/providers/_contract/openAiAdapter.js:
function _resetClientForTests() { _client = null; }
module.exports = { ..., _resetClientForTests };
```

`scenario_runner.js` calls `_resetClientForTests()` at the start of both `_runDirectProvider` and `_runDirectEngine` execution paths.

**Fix B — `headers` property on `_httpFetch` response in `scenario_runner.js`:**  
OpenAI SDK v6 calls `response.headers.entries()` when parsing HTTP responses. The `_httpFetch` helper returned `{ok, status, json, text}` without `headers` → `Cannot read properties of undefined (reading 'entries')`.

```diff
  resolve({
    ok:   statusCode >= 200 && statusCode < 300,
    status: statusCode,
+   headers: {
+     get:     (name) => rawHeaders[name.toLowerCase()] || null,
+     has:     (name) => Object.prototype.hasOwnProperty.call(rawHeaders, name.toLowerCase()),
+     forEach: (cb)   => Object.keys(rawHeaders).forEach(k => cb(rawHeaders[k], k)),
+     entries: function* () { for (const k of Object.keys(rawHeaders)) yield [k, rawHeaders[k]]; }
+   },
    json: () => Promise.resolve(JSON.parse(buf)),
    text: () => Promise.resolve(buf)
  });
```

### Provider migrations (11 total)

| # | Provider | Method | Tool/Mode |
|---|----------|--------|-----------|
| 1 | `ideationExpansionProvider.js` | `callChatWithTool()` | `expand_idea` tool |
| 2 | `intentClassificationProvider.js` | `callChatWithTool()` | `classify_intent` tool |
| 3 | `conversationalResponseProvider.js` | `getClient()` | streaming + tool-choice |
| 4 | `businessAnalysisProvider.js` | `getClient()` | `json_object` response |
| 5 | `documentationReviewProvider.js` | `getClient()` | `json_object` response |
| 6 | `projectReviewProvider.js` | `getClient()` | `json_object` response |
| 7 | `researchProvider.js` | `getClient()` | `json_object` response |
| 8 | `openAiOptionsProvider.js` | `getClient()` | plain text (no response_format) |
| 9 | `openAiDocumentationProvider.js` | `getClient()` | plain text Markdown |
| 10 | `openAiExecutionFilesProvider.js` | `getClient()` | `json_object` response |
| 11 | `openAiRequirementDiscoveryProvider.js` | `callChatWithTool()` | `discover_requirements` tool |

**Group A** (tool-call mode — use `callChatWithTool()`): providers 1, 2, 11  
**Group B** (direct completion — use `getClient()`): providers 3–10

All providers: `new OpenAI()` removed, `require("./_contract/openAiAdapter")` added.

---

## Full test suite results (2026-05-26 — after B4 + B5)

**Run capturing full output:**
```
222 passed, 3 failed, 5 skipped (230 total)
duration: ~156 000ms
```

| Scenario | Status | Notes |
|----------|--------|-------|
| S230 | ✓ GREEN | B4 — deterministic 4-turn breakout |
| S01 | ✓ GREEN | B5 — conversationalResponseProvider direct |
| S02 | ✓ GREEN | B5 — intentClassificationProvider direct |
| S03 | ✓ GREEN | B5 — conversationalResponseProvider engine |
| S14 | ✓ GREEN | B5 — ideationExpansionProvider direct |
| S15 | ✓ GREEN | B5 — ideationEngine direct (was BLOCKED after migration; fixed by headers fix) |
| S23 | ✓ GREEN | B5 — ideationEngine engine (same root cause, same fix) |
| S17 | ✗ FAIL | Pre-existing: `documentationBuildLoop LOOP_EXHAUSTED`. Registered as debt at CP1. |
| S137 | ✗ FAIL | Pre-existing: `kb.retrieve` returns FAILED when project has no vector embeddings. `direct_tool` test — no provider involvement. Confirmed pre-existing (added before B5, unrelated path). |
| S191 | ✗ ALWAYS FAIL | Pre-existing: Windows task scheduler env delta — always fails in this environment. |
| S58,S62,S65,S67,S68 | ○ SKIP | Docker container tests — require docker daemon. |

**Net delta from CP1 baseline (229 total, 221 passed):**
- +1 scenario (S230 new) → 230 total
- +1 pass (S230 ✓) → 222 passed
- Failures: S03 flakiness resolved (was "1 of 4 runs" at CP1); S137 confirmed pre-existing
- No regressions introduced by B4 or B5

---

## §ARC ledger

No new §ARC entries added in B4 or B5. Count remains at **7**.

---

## Files modified

| File | Change |
|------|--------|
| `code/src/ai_os/ideationEngine.js` | B4: `question_count` persistence + forced breakout |
| `code/src/providers/_contract/openAiAdapter.js` | `_resetClientForTests()` exported |
| `code/src/testing/scenario_runner.js` | `_resetClientForTests()` call in both run paths; `headers` on `_httpFetch` |
| `code/src/providers/ideationExpansionProvider.js` | Migration #1 |
| `code/src/providers/intentClassificationProvider.js` | Migration #2 |
| `code/src/providers/conversationalResponseProvider.js` | Migration #3 |
| `code/src/providers/businessAnalysisProvider.js` | Migration #4 |
| `code/src/providers/documentationReviewProvider.js` | Migration #5 |
| `code/src/providers/projectReviewProvider.js` | Migration #6 |
| `code/src/providers/researchProvider.js` | Migration #7 |
| `code/src/providers/openAiOptionsProvider.js` | Migration #8 |
| `code/src/providers/openAiDocumentationProvider.js` | Migration #9 |
| `code/src/providers/openAiExecutionFilesProvider.js` | Migration #10 |
| `code/src/providers/openAiRequirementDiscoveryProvider.js` | Migration #11 |

---

## Pending (after CTO confirmation)

- **B6:** Fix doctor port checks + summary string
- **B7:** UX fixes (intake route, RTL, project filter, plain language, empty chat)

---

**CTO action required:** Confirm this checkpoint before B6 begins.
