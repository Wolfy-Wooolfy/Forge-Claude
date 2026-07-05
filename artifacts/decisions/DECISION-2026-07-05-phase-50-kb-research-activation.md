# DECISION-2026-07-05-phase-50-kb-research-activation — PHASE-50: KB & Research Activation

Status: APPROVED (owner delegation in chat 2026-07-05: "فوضتك وموافق"; CTO ruling under delegation)
Opens: PHASE-50-KB-RESEARCH-ACTIVATION (capability #9, deferred from PHASE-49)

## 1. Ruling — offline-first, TAVILY deferred
Real web-search discovery (TAVILY) is DEFERRED to a future phase with its own decision
artifact. PHASE-50 activates the EXISTING KB stack end-to-end with owner-provided URLs only.
Rationale: (a) the project's primary failure mode is "scenario green / real path broken",
and the KB stack today is exactly that — 12 mock scenarios green, zero owner-reachable
real path; (b) the current research_role is KB-retrieval-based, not web-search-based, so
a search API has no verified foundation to serve; (c) Track B rule: one capability per
phase; (d) cost: embeddings-only ingestion fits far under the $3 kill bar.

## 2. CTO pre-audit gap map (to be independently verified in W-1)
- G-1: research_role exists + mock-tested (S134–S136) but NO live-surface caller invokes it.
- G-2: Contract §8 (documentation role must call kb.validate_citations on completion,
  BLOCKED on FAIL_UNCITED) is NOT implemented — no role except research_role touches kb.*.
- G-3: API surface is read-only: only GET /api/kb/sources exists. No ingest, no research.
- G-4: UI surface: zero KB presence in web/index.html.
- G-5: No confirmed real-provider E2E run has ever executed (real embeddings → retrieval
  → cited findings).

## 3. Scope
W-1 gap-map verification (no code) · W-2 API surface (POST /api/kb/ingest,
POST /api/kb/research) · W-3 documentation_role §8 wiring · W-4 minimal owner UI panel ·
W-5 real E2E live run + Gate #10 owner test · W-6 closure.
Non-goals: web-search/TAVILY, new dependencies, local-file ingestion (kb.ingest_file →
backlog), §ARC changes (frozen at 10), citation_validator heuristic changes.

## 4. Closure gate — see PROMPT-STAGE-50.md §5 (binding copy).
## 5. Cost — mock-default; single approved live run ceiling $0.15; kill bar $3.00.
