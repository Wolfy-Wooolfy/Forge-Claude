# FINDING-2026-05-19-s137-live-openai-call

**Date:** 2026-05-19
**Severity:** LOW
**Discovered at:** Stage 12.4 closure — CTO independent verification
**Blocking:** NO — does not block any closure gate
**Status:** OPEN — deferred to PHASE-13 (or post-PHASE-12 maintenance pass)

---

## §1 — Summary

S137 (`kb.retrieve returns empty results for project with no vector data`) makes a
**real OpenAI embedding API call** on every test run, contradicting the "mock-only,
$0.00 cumulative cost" claim in PHASE-9 → PHASE-12 closure artifacts.

---

## §2 — Root Cause Analysis

### §2.1 — `_runDirectTool` never activates `MockOpenAiService`

`code/src/testing/scenario_runner.js` has two distinct dispatch paths:

**Engine-type dispatch (lines 362–387):** checks `scenario.mock` and, when present,
starts `MockOpenAiService`, overrides `OPENAI_BASE_URL`/`OPENAI_API_KEY`, and
patches `globalThis.fetch` to redirect `api.openai.com` calls to the mock server.

**`_runDirectTool` (lines 179–~280):** invokes the tool via the L2 registry directly.
It does NOT check `scenario.mock`. It never starts `MockOpenAiService` and never
patches `globalThis.fetch`. The `mock` field in S137's JSON is silently ignored.

### §2.2 — S137 scenario JSON

`code/src/testing/scenarios/S137_kb_retrieve_empty_kb.json`:
```json
{
  "type": "direct_tool",
  "tool":  "kb.retrieve",
  "mock":  { "content": {} },   ← ignored by _runDirectTool
  ...
}
```

The `mock` field was written as if it would suppress network calls, but
`_runDirectTool` never reads it.

### §2.3 — `kb.retrieve` embedding call path

`code/src/runtime/kb/retrieval.js` line 107–118:
```js
const client      = opts._client || getClient();       // ← OpenAI client from adapter
const embResponse = await withRetry(
  () => withTimeout(
    () => client.embeddings.create({
      model:      EMBEDDING_MODEL,        // text-embedding-3-small
      dimensions: EMBEDDING_DIMENSIONS,
      input:      queryText               // "What HTTP methods should..."
    }),
    timeoutMs
  ),
  2, 500
);
```

`getClient()` returns the live OpenAI client (via `openAiAdapter.js`). With
`OPENAI_API_KEY` set in the environment (from `.env`), the call succeeds and
returns real embeddings.

### §2.4 — Why S137 still passes

The embedding call succeeds (real API call, real key). The vector store has zero
indexed vectors (only a `sources.jsonl` fixture with no corresponding embeddings).
Nearest-neighbor search returns 0 results. The assertion `results.length === 0` passes.

---

## §3 — Stages Affected

All closures from PHASE-9 onward claimed "mock-only, $0.00 cumulative cost."
S137 has been live since PHASE-9 Stage 9.2 when `kb.retrieve` was first tested:

| Stage | Claim | Actual S137 behavior |
|---|---|---|
| PHASE-9 Stage 9.2 (S137 introduced) | "direct kb.retrieve + mock embeddings server" | Real `client.embeddings.create()` call |
| PHASE-9 closure | "$0.00 API cost" | Cost rounds to $0.00 (negligible) |
| PHASE-10 through PHASE-12.4 | "$0.00 cumulative" | Confirmed negligible |

Cost per run: ~$0.000001 (1 embedding request × 5 tokens × text-embedding-3-small pricing).
Rounds to $0.00 in all ledger tracking. **Monetary impact: zero.**

---

## §4 — Impact Assessment

| Dimension | Assessment |
|---|---|
| **Cost** | ~$0.000001 per run — rounds to $0.00. Zero monetary impact. |
| **CI risk** | A CI environment without `OPENAI_API_KEY` set will see S137 **fail** on `getClient()` or `embeddings.create()`, not cleanly skip. |
| **Claim accuracy** | PHASE-9 → PHASE-12 closures all stated "mock-only." S137 is a hidden exception. The claim is technically inaccurate. |
| **Data/PII** | Query text ("What HTTP methods should a REST API support?") is sent to OpenAI. No PII, no project-sensitive content. |
| **Regression risk** | If OpenAI embedding pricing increases significantly, this becomes a non-zero cost per full-suite run. |

---

## §5 — Remediation Options

### Option A — Document as known live-API scenario (low effort)

Add an explicit `"live_api": true` field to S137's JSON. Update scenarios SCHEMA.md
to define `live_api` as an optional boolean signaling the scenario makes real
external calls. Add a comment in `_runDirectTool` noting that `mock` fields are
not processed for `direct_tool` scenarios.

**Pros:** Zero code change. Turns a hidden behavior into documented behavior.  
**Cons:** Doesn't fix the CI failure risk. Doesn't actually mock the call.

### Option B — Extend `_runDirectTool` to activate `MockOpenAiService` when `scenario.mock` present

Mirror the mock activation block from the engine dispatch (lines 362–387) into
`_runDirectTool`. When `scenario.mock` is present, start `MockOpenAiService`,
patch `globalThis.fetch`, and restore on teardown — exactly as engine-type does.

**Pros:** Makes `scenario.mock` work uniformly across all scenario types. Fixes
CI risk. Makes cost claim accurate.  
**Cons:** Requires implementation + test. The `mock` field for `direct_tool` has
never been defined in SCHEMA.md — needs documentation. Risk of subtle
teardown ordering issues if `_runDirectTool` throws.

---

## §6 — Recommendation

**Defer to PHASE-13 (or post-PHASE-12 maintenance pass).**

Rationale:
- Monetary impact is zero — no urgency from a cost perspective
- S137 passes reliably in the current development environment (OPENAI_API_KEY set)
- The fix (Option B) requires careful implementation to not break existing
  `direct_tool` scenarios and deserves its own test coverage
- PHASE-12 remaining stages (12.5, 12.6, 12.7) are unaffected — S137 continues
  to pass and count toward SU baselines

**Immediate mitigation:** This finding artifact documents the behavior. CI
operators should ensure `OPENAI_API_KEY` is set, or add S137 to a
`known_live_api_scenarios` skip list for offline CI runs.

---

## §7 — References

| Item | Location |
|---|---|
| S137 scenario JSON | `code/src/testing/scenarios/S137_kb_retrieve_empty_kb.json` |
| `_runDirectTool` (no mock activation) | `code/src/testing/scenario_runner.js` lines 179–~280 |
| Engine mock activation (reference impl) | `code/src/testing/scenario_runner.js` lines 362–387 |
| `kb.retrieve` embedding call | `code/src/runtime/kb/retrieval.js` lines 107–118 |
| PHASE-9 Stage 9.2 closure (S137 introduced) | `artifacts/decisions/` (PHASE-9 closure artifacts) |

---

**END OF FINDING**
