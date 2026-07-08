# PHASE-52 — Gate #10 (REAL) evidence: stage_gate10_real

- Date: 2026-07-08
- Mode: REAL openai/gpt-4o (documentation) + REAL Tavily (discovery). Owner-approved ONE real run.
- Verdict: **GATE_NOT_PASSED (PRIMARY)** — honest, fail-closed, NOT rigged. Root cause is a pre-existing
  http allow-list boundary that blocks the discovery-INGEST half, NOT a PHASE-52 wiring defect.
- Evidence: `artifacts/spikes/phase52_gate10/gate10_owner.json` (+ step files + `citations.jsonl` [empty]).
- Script: `scripts/spikes/phase52_gate10.js`; pre-flight `scripts/spikes/phase52_gate10_preflight.js`.
- loop_id: g52-c50293b8 · project: phase52_gate10 (fresh, EMPTY KB).

---

## 1. Pre-flight — CLEAN ($0, before any spend)
- (a) TAVILY_API_KEY: SET (len=58, prefix=tvly…). (b) OPENAI_API_KEY: SET (len=164, hydrated from OS keychain).
- (c) BRAVE_SEARCH_API_KEY: UNSET ✓ → Tavily path. (d) real `research.search_web` (throwaway) → SUCCESS,
  provider_used=**tavily**, 3 results. DRY plumbing run ($0): mock claim-free doc → §8 PASS → advance QUALITY_JUDGE.

## 2. Real run — what happened
| field | value |
|---|---|
| claims_detected (N) | **6** (≤ cap 8 ✓ — no cap interaction) |
| zero_chunks | **6** (empty KB → every claim hit zero_chunks — RULING 2 trigger, correct) |
| discovery_searches | **6** (one per claim) · providers_used = **["tavily"]** ✓ |
| discovery_ingests | **0** ← every `kb.ingest_url` FAILED |
| discovery_cited | **0** |
| citations.jsonl | 0 records · kb_sources_after = **[]** |
| §8 audit | **FAIL_UNCITED** (6 uncited) |
| advanced | **false** → state stays DOCUMENTATION (fail-closed, correct — no fabrication) |
| spend (ledger) | **$0.04340** = agent $0.01339 (gpt-4o doc) + kb $0.030006 (6× web_search @ $0.005 ESTIMATE) |
| spend (REAL money) | ≈ **$0.013** (gpt-4o only; Tavily free tier = $0; 0 embeds since 0 ingests). Well under $0.15 cap / $3 kill bar. |
| doc latency | 29s (HTTP round trip incl. 6 searches) |

## 3. Root cause — the http allow-list blocks discovery-INGEST (CONFIRMED, $0 probe)
`kb.ingest_url` → `source_acquisition.acquireSource` → `reg.invoke("http.get")` → `http_tools._validateUrl`.
`DEFAULT_ALLOW_HOSTS` = `[api.openai.com, api.anthropic.com, api.github.com, raw.githubusercontent.com,
registry.npmjs.org, pypi.org, api.search.brave.com, api.tavily.com]`. A discovered URL whose host is not on
that list → **HOST_NOT_ALLOWED** → fetch blocked → ingest REJECTED → 0 chunks → re-retrieve empty → claim
stays uncited.

$0 confirming probe (search a claim → ingest the top Tavily URL):
```
search provider: tavily | urls:
   - https://asoasis.tech/articles/...-rest-api-health-check-endpoint-design
   - https://github.com/meilisearch/meilisearch/issues/1282
   - https://testfully.io/blog/api-health-check-monitoring
ingest of https://asoasis.tech/...  →  status: FAILED | reason: HOST_NOT_ALLOWED
```
So `research.search_web` (Tavily) is allow-listed and works, but the URLs it returns (arbitrary public
domains: asoasis.tech, testfully.io, …) are NOT — so `kb.ingest_url` cannot fetch them.

## 4. What the REAL gate DID prove (the PHASE-52 wiring is correct on the real path)
Everything PHASE-52 built works end-to-end up to the allow-list boundary:
- Empty KB → every §7.1 claim correctly takes the **zero_chunks** branch (RULING 2).
- Discovery **fires** — 6 real `research.search_web` calls, **provider_used = tavily** (Tavily-only, as configured).
- The **per-run cap holds** (6 searches ≤ 8; no runaway).
- **No fabrication** — 0 ingests → 0 cited → §8 **fail-closed** → build correctly HALTS at DOCUMENTATION.
- Cost bounded (≈$0.013 real, ledger $0.0434 ≪ $0.15 cap).
The gate surfaced a REAL, pre-existing architectural gap BEFORE closure — exactly its purpose (cf. PHASE-51 A-2).

## 5. The gap PHASE-52's D1–D4 scope did not account for
The decision artifact §10 listed "allow-list changes (already present)" as out-of-scope — but that was true only
for the SEARCH hosts (tavily/brave). The **INGEST of arbitrary discovered URLs** needs hosts that are NOT on the
allow-list. Auto web-discovery is structurally incompatible with a fixed 8-host ingest allow-list.

The allow-list is an L3 security control (it also blocks localhost/private/link-local ranges — SSRF protection),
so relaxing it is security-sensitive and is a scope/owner decision — NOT something to work around here. Per §4
(STOP triggers: §8 unexpectedly FAILS; scope beyond D1–D4; security control), CC STOPPED without modifying it.

## 6. SECONDARY measurement
Not measurable this run (0 citations emitted → no relevance numbers to compare against the PHASE-51 baseline
[0.475..0.478]). The secondary comparison is unblocked only once the ingest gap is resolved.

## 7. Options for the CTO (do NOT self-decide — security-sensitive)
1. **Discovery-scoped fetch relaxation (recommended):** allow arbitrary PUBLIC hosts for the discovery-ingest
   path ONLY, while KEEPING the SSRF protections (still block localhost/private/link-local + cap body size +
   content-type filter). Likely an L3 permission-contract change + doc update + owner approval. Cleanest fix
   for the L-1 auto-discovery capability.
2. **Env override for a re-run proof:** `FORGE_HTTP_ALLOW_HOSTS` already overrides the list. A gate re-run with
   the discovered hosts added would prove the FULL E2E ($8 audit PASS → advance) — but does not solve production
   and is itself a security-config change (needs owner OK).
3. **Credibility/domain-gated allow:** only ingest discovered hosts that pass a credibility/domain policy.
4. **Curated allow-list expansion:** brittle and incomplete (discovery targets are arbitrary) — not recommended.

## 8. Status
Phase remains OPEN. No push, no tag, no status.json flip. Gate script + pre-flight + this evidence committed
LOCALLY. D4 PRIMARY not met (allow-list gap); awaiting a CTO ruling on the ingest-host policy before any
re-run. No further real spend without a fresh owner "yes".
