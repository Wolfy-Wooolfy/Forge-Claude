# DECISION-2026-07-09-phase-52-closure

**Date:** 2026-07-09
**Phase:** PHASE-52 — Research-backed citations via auto web-discovery — CLOSURE
**Status:** CLOSED
**Relates to:** DECISION-2026-07-08-phase-52-research-backed-citations.md (+ §5 erratum #3); DECISION-2026-07-08-phase-52-amendment-a1-tavily-content-ingest.md; checkpoints _phase_52_checkpoints/{stage_wiring_mid, stage_gate10_real, stage_a1_content_mid, stage_gate10_rerun, stage_closure}.md

## 1. Outcome
PHASE-52 is CLOSED. Forge's documentation citation pass now performs auto web-discovery: a §7.1 claim that would otherwise stay UNCITED for lack of a KB source (zero_chunks) triggers a real web search, ingests the discovered source's content, re-retrieves, and cites — so a fresh project's documentation build no longer HALTS for want of manually-seeded sources (the L-1 fix).

## 2. Journey (honest record)
- D1–D3: wired research.search_web + ingest into runDocumentationCitationPass on the would-be-uncited branches; §5 **erratum #3** established that under the COMMUNITY retrieve floor the cite_blocked branch is unreachable (retrieve filters LOW before cite), so discovery's reachable trigger is zero_chunks; cite_blocked retained as documented defense-in-depth.
- First REAL Gate #10 (f8578a8): honest GATE_NOT_PASSED — the 8-host http allow-list blocked kb.ingest_url from fetching arbitrary Tavily-discovered URLs (HOST_NOT_ALLOWED); auto-discovery is architecturally incompatible with a fixed host allow-list.
- **Amendment A-1 (Approach B):** research.search_web requests Tavily raw_content; a new L2 tool kb.ingest_content ingests the returned content DIRECTLY — Forge never fetches the arbitrary host → ZERO new SSRF surface; the allow-list + SSRF guard are byte-identical; kb.ingest_url unchanged; L2 80→81.
- Hermeticity fix: A-1 un-masked a latent break (S357/S358 ran the production discovery path → a real Tavily call inside the SU suite once a key was in .env); fixed with a no-op _discovery seam in those scenarios + a harness that strips provider keys (TAVILY/BRAVE/OPENAI). Test-infra only.
- REAL Gate #10 re-run (f7a05dd): **PRIMARY_PASS_SECONDARY_PASS** — 7 §7.1 claims → 1 real Tavily search → 1 real kb.ingest_content ingest (api7.ai, REPUTABLE by URL, no fetch) seeded the KB → 7/7 cited → §8 PASS → advance QUALITY_JUDGE. Max relevance 0.6348 EXCEEDS the PHASE-51 manual-source baseline [0.475..0.478] (first MEDIUM-confidence real citation).

## 3. Honest result + known limitation
7/7 claims cited, but relevance was [0.59, 0.23, 0.63, 0.28, 0.43, 0.21, 0.26] — 1 MEDIUM, 6 LOW. The single discovery ingest seeded the KB and was reused for all claims (emergent: only the first claim hit zero_chunks; the rest retrieved the seeded source). Auto-discovery PROVED it can beat the manual baseline, but lifting EVERY claim above LOW requires per-claim targeted discovery, i.e. the RELEVANCE FLOOR — explicitly DEFERRED to PHASE-53. This Gate is the data point motivating that decision.

## 4. Invariants at closure
§ARC = 10 (frozen) · L2 tools = 81 (kb.ingest_content added) · agent roles = 13 · doctor checks = 35 · SU suite = 359 pass / 0 fail / 5 skip (364) · provider openai/gpt-4o. Track A clean; the http allow-list + SSRF guard UNTOUCHED.

## 5. Spend
Cumulative PHASE-52 real ≈ $0.026 (first Gate ≈$0.013 + re-run ≈$0.0126; ledger ≈$0.061 incl. the fixed free-search estimate). ≪ $3/phase kill bar.

## 6. Deferred / PHASE-53 candidates
Relevance floor (per-claim targeted discovery + lifting cited-but-LOW claims — the primary lever surfaced by this Gate); SSRF-guard hardening (169.254/DNS-rebind/IPv6) only IF a future arbitrary-fetch capability is ever chosen (not needed for Approach B); plus the standing backlog (Browser Automation, Iterative MVP Loop, providerTrace persistence, Playwright UI smoke, async provider refactor, Anthropic switch).

## 7. Closure gate — MET
SU 359/0/5 (364) ✓ · Track A clean ✓ · §ARC=10 ✓ · L2=81 ✓ · all decision artifacts + checkpoints written ✓ · REAL Gate #10 re-run PRIMARY+SECONDARY PASS with permanent evidence ✓.

## 8. Approval
Closure under owner standing delegation. Push GO + annotated tag phase-52-complete (on the specific closure commit hash, not HEAD) issued by the CTO after fresh-zip + GitHub-raw verification.
