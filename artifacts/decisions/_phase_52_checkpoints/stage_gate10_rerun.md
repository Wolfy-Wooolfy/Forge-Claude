# PHASE-52 — Gate #10 RE-RUN (REAL, A-1 verification): stage_gate10_rerun

- Date: 2026-07-09
- Mode: REAL openai/gpt-4o (documentation) + REAL Tavily content-ingest discovery (A-1). Owner-approved ONE re-run.
- Verdict: **PRIMARY_PASS_SECONDARY_PASS** — the A-1 gap-closed proof AND the full happy path, both met.
- Evidence: `artifacts/spikes/phase52_gate10_rerun/gate10_owner.json` (+ step files + `citations.jsonl`, 7 records).
- Script: `scripts/spikes/phase52_gate10.js` (re-run edits: distinct evidence dir + §6.1 PRIMARY/SECONDARY verdict split + before/after block); pre-flight `scripts/spikes/phase52_gate10_preflight.js` (+ non-empty-content check (d)).
- loop_id: g52-ca5d1178 · project: phase52_gate10 (fresh, EMPTY KB, 0 pre-seeded sources — verified in-run).
- HEAD at run: `fe548a1` (A-1 chain: 4d8a247 D0 · 83aeef7 mid · d69c1a1 owner-U · fe548a1 hermeticity fix); targeted SU S356–S366 11/11 green pre-run.

---

## 1. Pre-flight — CLEAN ($0, before any spend)
(a) TAVILY_API_KEY SET (len=58, tvly…) via the gate script's OWN .env loader (bin/forge-test.js now strips it — unaffected, as designed).
(b) OPENAI_API_KEY SET (len=164, OS-keychain hydration). (c) BRAVE_SEARCH_API_KEY UNSET ✓.
(d) real search_web (include_raw_content): SUCCESS, provider_used=tavily, 3/3 results with NON-EMPTY content (first = 20,477 chars) → the ingest path has real input. DRY plumbing re-run: GREEN, $0 delta.

## 2. Re-run — what happened (the numbers)
| field | FIRST gate (f8578a8) | RE-RUN (this) |
|---|---|---|
| claims_detected | 6 | **7** (≤ 8 cap ✓) |
| zero_chunks | 6 (all) | **1** (see §3 — the first claim only) |
| discovery_searches | 6 | **1** · providers_used = **["tavily"]** ✓ |
| **discovery_ingests** | **0** (HOST_NOT_ALLOWED ×6) | **1** — api7.ai content ingested via **kb.ingest_content** (NO fetch of the host) |
| discovery_cited | 0 | **1** |
| cited / uncited | 0 / 6 | **7 / 0** |
| citations.jsonl | 0 | **7 records** |
| §8 audit | FAIL_UNCITED | **PASS** |
| advanced | false (halt) | **true → QUALITY_JUDGE** (graph confirms) |
| spend (ledger delta) | $0.0434 | **$0.01763** (agent gpt-4o $0.01249 + kb $0.005135) |
| spend (REAL money) | ≈$0.013 | ≈**$0.0126** (gpt-4o + $0.000135 embeds; Tavily free — the $0.005 kb row is the fixed ledger ESTIMATE) |

**The gap is CLOSED**: before = searches succeeded but 0 ingests (allow-list blocked every arbitrary host); after = the discovered content is ingested WITHOUT contacting the host, and the build advances end-to-end.

## 3. Emergent behavior worth recording (correct + efficient, not a defect)
Only the FIRST claim hit `zero_chunks` and triggered discovery. Its single ingest (api7.ai health-check
best-practices, **REPUTABLE** by URL heuristic) seeded the project KB — claims 2–7 then retrieved that same
chunk on their FIRST `kb.retrieve` and cited via the BASE path (no further searches). One targeted discovery
served the whole same-topic document: 1 search / 1 ingest / 7 citations. The per-run cap (8) was never
stressed. This is the intended additive design (discovery fires only when the KB lacks a source) composing
with the shared project KB.

## 4. Gate criteria
- **PRIMARY (the A-1 pass bar) — MET:** `discovery_ingests=1 > 0` ∧ `discovery_cited=1 > 0` ∧ providers = tavily-only ∧ citations written. Discovered Tavily CONTENT entered the KB with zero contact with the arbitrary host, and lifted a previously-zero_chunks claim to a real citation.
- **SECONDARY (measured) — ALSO MET:** §8 PASS → advance DOCUMENTATION → QUALITY_JUDGE (full happy path; every claim got a cite-eligible source). Per-claim relevance `[0.5928, 0.2252, 0.6348, 0.2752, 0.4287, 0.2112, 0.2614]`; **max 0.6348 EXCEEDS the PHASE-51 manual-source baseline [0.475..0.478]** — and produced the project's **first MEDIUM-confidence real citation** (the `/health` endpoint claim, rel ≥ 0.60). The claim-TARGETED discovered source beats PHASE-51's general manual source on its on-topic claims; tangential claims (auth/persistence non-goals) sit lower — honest calibration, consistent with erratum #3's measurement framing. Relevance-floor data point for PHASE-53: discovery alone lifted the best claim above LOW without any floor.

## 5. Per-claim trace (all 7 cited from the single discovered source)
| claim (truncated) | confidence | relevance | source |
|---|---|---|---|
| "purpose": provides a simple health-check API… | LOW | 0.5928 | REPUTABLE api7.ai/blog/tips-for-health-check-best-practices |
| "inputs": no parameters required | LOW | 0.2252 | 〃 |
| "health_check": /health → HTTP 200 {status:ok} | **MEDIUM** | **0.6348** | 〃 |
| "cause": server not running / network issue | LOW | 0.2752 | 〃 |
| "fix": ensure Node.js server running… | LOW | 0.4287 | 〃 |
| authentication not supported | LOW | 0.2112 | 〃 |
| persistence not included | LOW | 0.2614 | 〃 |

## 6. Cost & guards
Ledger delta **$0.01763** ≤ ~$0.05 expectation, ≪ $0.15 cap, ≪ $3 kill bar. Real money ≈ $0.0126.
Doc round-trip 21s. No STOP trigger fired (7 ≤ 8 claims; tavily-only; no call errors; §ARC=10 untouched;
runtime path unchanged — the gate is a spike).

## 7. Cumulative PHASE-52 real spend
First gate $0.0434 (ledger) + re-run $0.01763 (ledger) ≈ **$0.061 ledger / ≈$0.026 real** — ≪ $3 kill bar.

## 8. Status
Phase remains OPEN pending closure. No push, no tag, no status.json flip. Evidence + script edits committed
LOCALLY. Closure (status.json flip → PHASE-52 CLOSED / next PHASE-53 + closure decision artifact + push GO +
annotated tag) is a SEPARATE step after CTO fresh-zip verification of this re-run.
