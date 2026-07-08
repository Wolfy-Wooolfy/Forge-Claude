# DECISION-2026-07-08-phase-52-amendment-a1-tavily-content-ingest

**Date:** 2026-07-08
**Phase:** PHASE-52 — Amendment A-1 (Tavily-returned content ingest; closes the Gate #10 allow-list gap)
**Status:** APPROVED (owner delegated the decision to the CTO 2026-07-08; implementation pending Step 0 GO)
**Relates to:** DECISION-2026-07-08-phase-52-research-backed-citations.md (+ §5 erratum #3); _phase_52_checkpoints/stage_gate10_real.md (the GATE_NOT_PASSED evidence)

## 1. Context — the Gate #10 finding
The owner-approved REAL Gate #10 returned an honest GATE_NOT_PASSED: 6 §7.1 claims → all zero_chunks → 6 real Tavily searches (provider_used=tavily) → but discovery_ingests=0 → 0 cited → §8 FAIL_UNCITED → build correctly HALTED (fail-closed, no fabrication). Real spend $0.0434 (≈$0.013 gpt-4o; Tavily free $0). Root cause (confirmed $0 probe: asoasis.tech → HOST_NOT_ALLOWED): kb.ingest_url → acquireSource → http.get → the http_tools allow-list (8 hosts) rejects arbitrary discovered URLs. research.search_web (Tavily) is allow-listed and works; the URLs it returns are arbitrary public hosts that are not → discovery cannot populate the KB. Auto web-discovery is architecturally incompatible with a fixed host allow-list. The PHASE-52 wiring is PROVEN correct up to this fetch boundary (zero_chunks trigger, Tavily-only, per-run cap, fail-closed).

## 2. Verification (bidirectional Trust+Verify)
CTO independently re-verified: (a) 8-host DEFAULT_ALLOW_HOSTS blocks discovered hosts; (b) the SSRF/private-range block (http_tools.js:43-47) is a SEPARATE check that runs BEFORE the allow-list — it has gaps (no 169.254.* cloud-metadata, no DNS-rebind/resolved-IP check, no IPv6 ULA/LL) that would matter for any arbitrary-fetch approach; (c) credibility_scorer scores from the URL/domain ONLY (no body needed); (d) acquireSource's only network step is the fetch; (e) http_tools is a normal L2 tool (not §ARC).

## 3. Decision — Approach B (Tavily-returned content)
Have research.search_web request Tavily's page content (include_raw_content) and ingest that content DIRECTLY via a new kb.ingest_content tool. Forge NEVER fetches arbitrary hosts → ZERO new SSRF surface; the only external calls remain api.tavily.com (allow-listed) + the existing embeddings provider.
REJECTED — Approach A (relax the allow-list to arbitrary public hosts with a hardened SSRF guard): introduces a real, ongoing SSRF attack surface (must correctly block 169.254/metadata, DNS-rebind, IPv6 private, redirects) that is unnecessary for a personal local-first tool when Tavily returns RAG-ready content via an already-allow-listed endpoint. Hardening the SSRF guard for a future arbitrary-fetch capability is recorded as a SEPARATE deferred item, not needed here.

## 4. Deliverables
D-A1.1 research.search_web requests include_raw_content:true; _normalizeTavily captures a content field (raw_content → snippet fallback). Additive.
D-A1.2 NEW L2 tool kb.ingest_content({url, content, title?, project_id}) — acquireSource-minus-fetch: srcId(url) dedup → credibility score BY URL → content as extracted text → chunk → embed → store → manifests (§ARC-4). No http.get on the discovered host. Same return shape as kb.ingest_url. L2 80→81.
D-A1.3 discovery loop swaps _ingest to kb.ingest_content(url, content); all other discovery behavior (caps, dedup, LOW-filter/no-fabrication, RULING-2 scope) unchanged.
D-A1.4 mock scenarios (locked at Step 0; default S364–S366): ingest_content direct; NO-arbitrary-fetch proof; E2E content-path lift.
D-A1.5 REAL Gate #10 re-run (gated on a separate owner spend approval).

## 5. Track A / §ARC / security posture
All via reg.invoke. §ARC FROZEN AT 10 (ingest_content manifests/cost via the existing §ARC-4 path). The allow-list and SSRF guard are UNCHANGED — this amendment AVOIDS the arbitrary fetch, it does not relax any control. kb.ingest_url is UNCHANGED (still fetches, still allow-list-bound, for explicit manual ingestion). Net security posture is IMPROVED vs Approach A. L2 80→81.

## 6. Closure gate
SU 359/0/5 (364) [356 + S364–S366, exact set locked at Step 0]; Track A clean; §ARC=10; L2=81; this artifact committed; main PHASE-52 decision §5/§9 updated to reference A-1 as the ingest mechanism; mid-checkpoint written; REAL Gate #10 re-run PASS (empty KB → auto-discovered content → cited → §8 PASS → advance) with permanent evidence + relevance measurement vs [0.475..0.478]; status.json flip to PHASE-52 CLOSED / next PHASE-53 as part of closure after CTO verification.

## 7. Cost
$0 dev; real Gate #10 re-run ~$0.03 (separate owner "yes" + estimate). Kill bar $3/phase.

## 8. Approval
Owner (Khaled) delegated the decision to the CTO on 2026-07-08 ("انت CTO المشروع خد القرار بنفسك … بأعلى درجات الاحترافية"). Implementation begins only after CC posts a Step 0 summary and the CTO returns an explicit A-1 Step 1 GO. The real Gate #10 re-run requires a further separate owner spend approval with an estimate shown first.
