# PHASE-10 STAGE 10.4 MID-CHECKPOINT

| Field | Value |
|---|---|
| Stage | 10.4 — L2 Tools + Doctor Check + PHASE-9 Item 1 |
| Status | IN_PROGRESS |
| Date | 2026-05-14 |
| Author | Claude (implementation arm) |

---

## §0 Corrections Applied

| # | Plan §2 stale claim | Actual (applied) |
|---|---|---|
| 1 | Doctor entering Stage 10.4: "22 PASS / 2 WARN" | Actual baseline: **21 PASS / 3 WARN** (confirmed per forge-doctor run; 3 WARNs are `providers_registered`, `disk_space`, `container_runtime`) |
| 2 | Post-Stage 10.4 doctor target: "23 PASS / 2 WARN" | Correct target: **22 PASS / 3 WARN** (+1 PASS from `orchestration_runtime`; WARNs unchanged) |

OQ1 (doctor _registry.js explicit require), OQ2 (fn(ctx) not run()), OQ3 (independent call wrapping) all resolved per CTO resolutions before §1 work began.

---

## §1 Implementation — Files Written / Modified

### §1.1 — orchestration_tools.js (NEW)

| Field | Value |
|---|---|
| Path | `code/src/runtime/tools/orchestration_tools.js` |
| Lines | 402 |
| Export | `{ tools: [start_loop, advance_state, respond, abort, get_status, read_log] }` |

6 L2 tools:

| Tool | required_mode | Key behaviour |
|---|---|---|
| `orchestration.start_loop` | WORKSPACE_WRITE | Calls `createLoop(project_id, loop_id, ctx)` → writes graph.json |
| `orchestration.advance_state` | WORKSPACE_WRITE | Calls `appendAuditRow` + `setCurrentState` |
| `orchestration.respond` | WORKSPACE_WRITE | Injects `gate_responder` stub → calls `fireGate` |
| `orchestration.abort` | WORKSPACE_WRITE | Guards terminal states; appends ABORT row; sets ABORTED_BY_OWNER |
| `orchestration.get_status` | READ_ONLY | Calls `loadLoop` → returns graph summary |
| `orchestration.read_log` | READ_ONLY | Reads `conversation_log.jsonl` via `reg.invoke("fs.read_file", …)` |

All 4 write tools have `preview()`. Module uses lazy `require()` inside `execute()` for all runtime dependencies. Track A: zero direct `fs.*Sync`, zero `new OpenAI()`.

### §1.2 — orchestration_runtime.js (NEW)

| Field | Value |
|---|---|
| Path | `code/src/runtime/doctor/checks/orchestration_runtime.js` |
| Lines | 73 |
| Export | `{ id, description, fn(ctx) }` (synchronous — matches all 24 existing checks) |

Checks:
1. 5 orchestration modules load and have key exports (`validateGraph`, `createLoop`, `checkCap`, `shouldSkipGate3`, `runDebate`)
2. Fresh isolated registry confirms 6 orchestration tool names in `summary.names`

### §1.2b — doctor/_registry.js (EDITED — 1 line added)

```
--- before (line 27)
  require("./checks/builtproject_runtime"),
  require("./checks/kb_budget_status"),

+++ after
  require("./checks/builtproject_runtime"),
  require("./checks/orchestration_runtime"),    ← NEW LINE
  require("./checks/kb_budget_status"),
```

Nothing else changed. Check count: 24 → **25**. File is now 37 lines.

### §1.3 — retrieval.js (MODIFIED)

| Field | Value |
|---|---|
| Path | `code/src/runtime/kb/retrieval.js` |
| Lines before | 131 |
| Lines after | 180 |
| Net addition | +49 lines |

Changes (scope tight — no schema, no new exports):

| Change | Detail |
|---|---|
| +`TimeoutError` class | Local — not exported |
| +`withTimeout(fn, timeoutMs)` | Local — not exported |
| +`withRetry(fn, maxAttempts, backoffMs)` | Local — not exported; does NOT retry on `TimeoutError` |
| +`timeoutMs` option | Added to `retrieve()` options (default 8000) — test seam for S151 |
| Embedding call wrapped | `withRetry(() => withTimeout(() => client.embeddings.create(…), timeoutMs), 2, 500)` |
| Vector search wrapped | `withRetry(() => withTimeout(() => searchVector(…), timeoutMs), 2, 500)` — independently |
| `openStore()` NOT wrapped | Deterministic local operation, no network call (per OQ3 resolution) |
| JSDoc updated | `timeoutMs?: number` added to options parameter doc |

Composition order: withRetry OUTSIDE, withTimeout INSIDE. Ledger write (`appendEntry`) occurs between the two wrapped calls — fires exactly once per `retrieve()` invocation (cost accounting preserved).

---

## §2 Preliminary Verification

### Registry tool count

```
node bin/forge-doctor.js → tools_registered: 72 tools registered
```

66 (baseline) + 6 (orchestration) = **72** ✓

### Doctor check count + new PASS

```
node bin/forge-doctor.js → ✓ HEALTHY — 0 critical, 3 warning
  ✓  orchestration_runtime    5 orchestration modules loaded; 6 orchestration tools registered
```

24 (baseline) + 1 = **25 checks** ✓ | 21 (baseline PASS) + 1 = **22 PASS** ✓ | 3 WARN unchanged ✓

### Track A (preliminary)

```
grep fs.*Sync orchestration_tools.js   → 0 ✓
grep new OpenAI orchestration_tools.js → 0 (comment mention only) ✓
grep fs.*Sync retrieval.js             → 0 ✓
grep new OpenAI retrieval.js           → 0 ✓
```

### Module syntax

```
node -e "require('./code/src/runtime/tools/orchestration_tools.js')"            → OK ✓
node -e "require('./code/src/runtime/doctor/checks/orchestration_runtime.js')"  → OK ✓
node -e "require('./code/src/runtime/kb/retrieval.js')"                         → OK ✓
```

---

## §3 Open Questions Before Scenario Authoring

None blocking. Design notes:

- **S149**: Helper will use `crypto.randomUUID()` for loop_id (fresh per run) to avoid file accumulation across test runs. Assertions: 6 tools registered, `start_loop` returns OWNER_INTENT, `get_status` round-trips.
- **S150**: Same fresh-UUID approach. Sequence: `start_loop` → `abort` → `get_status` (expect ABORTED_BY_OWNER) → `read_log` (expect 1 ABORT row). Since loop_id is fresh each run, log_count = 1 is deterministic.
- **S151**: Mock `_client.embeddings.create` increments a call counter then delays 200ms. `timeoutMs: 50` fires at 50ms → TimeoutError. Assertions: `timeout_fires = true` (error name is TimeoutError), `no_retry_on_timeout = true` (call_count === 1 — withRetry did not retry). No `openStore` call reached (timeout fires before it).

---

*Mid-checkpoint authored: 2026-05-14 — Stage 10.4*
