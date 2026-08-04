# PHASE-55 — Checkpoint C1: stage_spend_mid (after W-1, per PROMPT-STAGE-55 §3)

- Date: 2026-08-04
- Phase: PHASE-55 — HARDENING BATCH
- Decision: DECISION-2026-08-03-phase-55-hardening-batch.md (rulings R-1..R-24, errata E-1)
- GO scope honored: W-1 ONLY, test-first per R-2. W-2..W-5 untouched. **NO real
  provider call — cost this phase: $0.** The single ~$0.02 real proof is NOT run;
  proposed in §7 below for separate owner approval per R-4.
- §ARC: frozen at **10** (R-22 confirmed: the cost_ledger change reuses its own
  declared write path — no new exception) · L2 tools: **81** (no new tool) ·
  roles: **13** (untouched).
- Chain (all LOCAL on top of origin/main `b498565`): `eed8f30d` D0 · `<this
  commit>` rulings append + W-1 + S384 + this checkpoint. CC pushed nothing; the
  owner may push independently — control point: annotated tag.

---

## 1. What W-1 delivered (exactly the re-bound three live files)

| File | Δ | What |
|---|---|---|
| `code/src/providers/_contract/openAiAdapter.js` | +108/−1 | The R-12 seam: `_wrapLegacyMetering` wraps `chat.completions.create` on the client `getClient()` returns (chat ONLY per R-13 — embeddings untouched). Books one agent-ledger row per call under sentinel `_legacy_stage_a`: usage-based cost via a local metering price map (prefix-matched, conservative non-zero default so no real call can book $0), latency, outcome success/failed. Streams (R-14): tokens 0 + `tokens_unavailable: true`, request body NEVER mutated. Observer pattern — the ORIGINAL promise is returned unmodified; booking failures are swallowed (agent_tools precedent — metering must never break the call). Test seam `_setClientForTests` (O-3) routes through the SAME wrap. |
| `code/src/runtime/agents/budget_enforcer.js` | +38/−1 | R-11(ii): `checkBudget` totalSpent = `getTotalCost(P)` + `_legacySpendSince(P)`. R-21 lifetime bound implemented (predicate quoted in §5). |
| `code/src/runtime/agents/cost_ledger.js` | +4/−0 | R-22 additive marker: the record builder now carries `tokens_unavailable: true` through to disk when set (previously silently dropped — F-8). Nothing else changed; schema additive. |

Test infra (new): `code/src/testing/helpers/spend_seam_test_helper.js` +
`code/src/testing/scenarios/S384_legacy_spend_visibility.json`.

**Exact three-file diffstat (verbatim):**

```
 code/src/providers/_contract/openAiAdapter.js | 108 +++++++++++++++++++++++++-
 code/src/runtime/agents/budget_enforcer.js    |  38 ++++++++-
 code/src/runtime/agents/cost_ledger.js        |   4 +
 3 files changed, 148 insertions(+), 2 deletions(-)
```

## 2. Test-first evidence (R-2) — RED then GREEN, verbatim

**Sequence disclosure:** the O-3-approved test seam (`_setClientForTests`, injection
only — zero metering) was added to openAiAdapter BEFORE the RED run so the legacy
call could COMPLETE hermetically, per the GO's RED wording ("a legacy Stage-A call
completes and the cap's own number is UNCHANGED"). The metering wrapper, the budget
inclusion and the marker landed strictly AFTER the RED capture.

**RED (before the fix) — S384 failing on exactly the six defect assertions, while
`legacy_call_completed` passes (the call really completed, unmetered):**

```
  ✗  S384   legacy Stage-A spend visibility — the cap's own number moves, R-21 lifetime bound holds, R-22 stream marker read back from disk (PHASE-55 W-1)
         FAIL assertion [state_field_equals]: state.a_sentinel_total_increased: expected true, got false
         FAIL assertion [state_field_equals]: state.a_delta_equals_row_actual: expected true, got false
         FAIL assertion [state_field_equals]: state.b_cap_denied_after_call: expected true, got false
         FAIL assertion [state_field_equals]: state.b_cap_reason_is_95pct: expected true, got false
         FAIL assertion [state_field_equals]: state.d_stream_row_persisted: expected true, got false
         FAIL assertion [state_field_equals]: state.d_marker_read_back_from_disk: expected true, got false
```

Full-suite RED run: **376 passed, 1 failed, 5 skipped (382 total)** — the sole FAIL
is S384; zero regressions at the RED stage.

**GREEN (after the fix):**

```
  ✓  S384   legacy Stage-A spend visibility — the cap's own number moves, R-21 lifetime bound holds, R-22 stream marker read back from disk (PHASE-55 W-1)
ALL PASS — 377 passed, 0 failed, 5 skipped (382 total)
duration: 52488ms
```

## 3. S384 — the four GO assertions, how each is proven

| GO assertion | Proof mechanism |
|---|---|
| (a) `getTotalCost("_legacy_stage_a")` increases by the row's `cost_usd_actual` | fake usage 1000/1000 on gpt-4o ⇒ seam cost exactly 0.0125; delta asserted `=== 0.0125` |
| (b) the cap's own number moved | seeded vision cap `max_total_usd: 0.013`; pre-call `checkBudget(P)` = allow/no-warn; post-call = DENIED **`BUDGET_95_PCT_REQUIRES_APPROVAL`** (0.0125/0.013 = 96.2%) |
| (c) R-21 bound | a 0.05 sentinel row is seeded BEFORE P's first-activity row; if it leaked in, pre-call would be DENIED and post-call reason would be `BUDGET_EXCEEDED` (0.0625/0.013 ≥ 100%) — both asserted against, so the bound is proven twice, distinguishably |
| (d) R-22 marker read BACK from disk | a `stream: true` call books tokens 0; the helper re-reads `artifacts/agent/cost_ledger.jsonl` via L2 `fs.read_file` and asserts `tokens_unavailable === true` on the persisted last row — never from `appendEntry`'s return value |

The legacy call itself traverses the REAL provider chain
(`ideationExpansionProvider.executeTask` → `callChatWithTool` → wrapped client) —
only the transport is fake. The SU runs inside the PHASE-41 overlay root
(bin/forge-test.js:77-83, `process.chdir(overlay.root)`), so no SU row ever
touches the real ledger — verified in §4.

## 4. RAW gitignored evidence (R-9) — the real ledger, pasted

`artifacts/agent/cost_ledger.jsonl` (real working folder, post-GREEN full suite):

```
rows 573   lifetime cost_usd_actual $4.66463   lifetime cost_usd_estimated $14.03421
_legacy_stage_a rows: 0   total: $0
```

- Sentinel rows in the REAL ledger = **0** — confirms the overlay isolation: two
  full-suite runs + targeted runs added zero rows to the real file.
- The lifetime estimated/actual ratio (14.03/4.66 ≈ **3.0x**) independently
  corroborates the F-6 estimator finding recorded in the decision artifact.

## 5. R-21 bound — predicate as implemented (quoted from budget_enforcer.js)

```js
const LEGACY_SENTINEL_PROJECT_ID = "_legacy_stage_a";

function _legacySpendSince(project_id, root) {
  if (!project_id || project_id === LEGACY_SENTINEL_PROJECT_ID) return 0;
  const own = ledger.readEntries({ project_id }, { root });
  if (own.length === 0) return 0;
  let firstTs = own[0].ts;
  for (const r of own) {
    if (typeof r.ts === "string" && r.ts < firstTs) firstTs = r.ts;
  }
  const rows = ledger.readEntries(
    { project_id: LEGACY_SENTINEL_PROJECT_ID, since: firstTs }, { root });
  let total = 0;
  for (const r of rows) {
    total += (typeof r.cost_usd_actual === "number" ? r.cost_usd_actual : 0);
  }
  return Math.round(total * 100000) / 100000;
}
```

Consumed as: `totalSpent = ledger.getTotalCost(project_id, { root }) + _legacySpendSince(project_id, root);`
`readEntries` filter.since is pre-existing (`rec.ts < filter.since → skip`, i.e.
ts ≥ since inclusive); the helper advances the clock between seeds so ordering can
never tie on a shared millisecond. P with zero ledger rows ⇒ contribution 0 ⇒ a
brand-new project can never be born blocked (CTO-F-D closed by construction).

## 6. R-23(2) measurement — reverse_vision double-count, bounded by real data

From the REAL ledger (573 rows, full history):

```
reverse_vision rows: 2 — exactly ONE per intake project lifecycle:
  2026-06-30T13:42:21.603Z  phase48_intake_nextjs_mock  actual $0.00174   outcome success
  2026-06-30T14:01:42.223Z  phase48_intake_nextjs_real  actual $0.009665  outcome success
```

- **Calls per project lifecycle: 1** (matches PHASE-48's `single_reverse_vision_call`
  gate criterion; the mock row cost is estimate-booked).
- **Typical real cost:** $0.009665 (1438 in / 165 out, gpt-4o-2024-08-06).
- **Double-count inflation under W-1:** the seam books a second row for the same
  call at metering prices — for the PHASE-48 real shape: 1438/1M×$2.50 +
  165/1M×$10.00 = **$0.005245**. Worst-case counted total per intake ≈ $0.0149 vs
  true $0.0097.
- **As % of DEFAULT_MAX_TOTAL_USD ($50.00): 0.0105% per intake** (the extra row
  alone; even 100 intakes ≈ 1.05%). Against the smallest cap used in practice
  (the $1.00 gate cap): 0.52% per intake.
- **Conclusion: a single intake CANNOT plausibly push a real project past 80%** —
  three orders of magnitude of headroom. The R-23 accept-and-enumerate answer
  stands; no design change needed. Backlog item recorded (decision artifact §6.5).

## 7. Real-proof proposal (R-4 — NOT run; awaiting separate owner approval)

- **What:** ONE real legacy Stage-A call — `ideationExpansionProvider.executeTask`
  driven by a small spike script with an explicit cheap model (`gpt-4o-mini`), a
  short prompt, against a scratch demo project.
- **Proves live:** a sentinel `_legacy_stage_a` row lands in the REAL ledger with
  non-zero `cost_usd_actual`, and `checkBudget` of the active demo project moves —
  the exact R-40 hole, closed on the real path.
- **Estimate (shown first, per R-4):** gpt-4o-mini at this size ≈ **$0.0005–0.002
  real cash**; proposal envelope ≤ **$0.02** hard (script aborts if the ledger
  delta exceeds it). Both columns (estimated + actual) will be reported.
- **$0 preflight/DRY:** S384 itself is the hermetic DRY of the entire seam; the
  spike script additionally gets a `--dry` leg (injected fake client) run first.

## 8. Independent revertibility (R-1) — stated per file

- `cost_ledger.js`: revert = delete the 4 marker lines; nothing else references
  the field (seam still books, marker absent only — S384(d) pinpoints it RED).
- `budget_enforcer.js`: revert = delete `_legacySpendSince` + restore the one
  `totalSpent` line; the seam still books visibility rows, the cap goes blind
  again — S384(b)/(c) pinpoint it RED.
- `openAiAdapter.js`: revert = delete the wrapper/pricing/booking block + the
  `_wrapLegacyMetering` call sites; no sentinel rows are produced — S384(a)
  pinpoints it RED. (The `_setClientForTests` seam may stay or go independently;
  it meters nothing by itself.)

No cross-item coupling: W-2..W-5 files untouched this leg
(`git diff` shows only the three live files + test infra + artifact/checkpoint).

## 9. Gates run (this leg)

| Gate | Result |
|---|---|
| Full SU suite (overlay, prefixed PATH) | **ALL PASS — 377 passed / 0 failed / 5 skipped (382 total)**, exit 0 — baseline 376 + S384, zero regressions |
| Track A (diff-based, ALL added lines of the 3 live files + helper) | fs write-side: **0** · `fetch(`/`child_process`/`require('fs')` in helper: **0** · single pattern hit = `new OpenAI({ apiKey })` at the rewritten getClient line INSIDE openAiAdapter.js — the explicitly sanctioned location ("zero new OpenAI() outside openAiAdapter.js") — **CLEAN** |
| `node --check` | SYNTAX OK all three live files + helper |
| §ARC / L2 / roles | **10 / 81 / 13** — unchanged |
| Real ledger pollution check | **0 sentinel rows** in the real `cost_ledger.jsonl` after all runs (overlay isolation held) |

## STOP (HARD)

W-1 complete and gate-proven at **$0**. Awaiting: owner fresh LOCAL-folder zip →
CTO C1 verification → (separately) owner approval for the §7 real proof → then
W-2 GO. W-2..W-5 not started.
