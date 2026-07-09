# DECISION-2026-07-09-phase-53-relevance-floor

**Date:** 2026-07-09
**Status:** APPROVED (owner delegation in chat: "موافق على توصياتك بشرط تكون باعلى درجات الاحترافية")
**Author:** CTO (Claude), ratified under owner delegation
**Phase:** PHASE-53 — Relevance floor: per-claim targeted discovery for cited-but-LOW claims

## 1. Problem (data-driven)
PHASE-52 Gate #10 rerun: 7/7 claims cited, relevance distribution
[0.5928, 0.2252, 0.6348, 0.2752, 0.4287, 0.2112, 0.2614] = 1 MEDIUM / 6 LOW.
Emergent behavior: one ingested source (api7.ai) seeded the KB and all remaining
claims cited it with weak semantic relevance. Citations are mechanically present
but semantically weak for 6/7 claims.

## 2. Decision
Introduce a relevance floor in the documentation citation pass:
- A claim whose BEST citation relevance < FLOOR is treated as would-be-uncited
  for discovery purposes → triggers ONE targeted web discovery for that claim.
- FLOOR = the EXISTING MEDIUM confidence threshold already defined in the
  citation layer. Single source of truth — no new magic number. If thresholds
  are currently inline literals, extract ONE named constant and reference it.
- Flow per below-floor claim: targeted research.search_web → kb.ingest_content
  (PHASE-52 A-1 path only) → re-retrieve → re-cite → KEEP-BEST of (old, new).
- Invariants: NEVER downgrade a claim's relevance. NEVER strip an existing
  citation. NEVER HALT because of below-floor quality — if no better source is
  found, keep best citation and mark the claim `below_floor: true` (flag).
  HALT semantics remain exactly as PHASE-52 defined them (zero-sources path);
  this phase does not add any new HALT.

## 3. Guardrails
- Max 1 targeted discovery attempt per claim per documentation pass.
- ONE shared search budget: targeted searches count against the SAME global
  cap introduced in PHASE-52 (one budget, one enforcement point).
- URL dedup shared with the PHASE-52 dedup set (no re-ingest of known URLs).
- No TAVILY_API_KEY present → floor still computed, discovery skipped,
  below_floor flags applied. Offline-safe, no behavior break.
- Track A: every side effect via reg.invoke (research.search_web,
  kb.ingest_content, kb.retrieve, kb.cite). NO new §ARC. §ARC frozen at 10.
- kb.ingest_url, http allow-list, SSRF guard: byte-identical. Zero touches.

## 4. Scope
- Touch surface: citation pass in conversationEngine.documentProject (+ the
  PHASE-52 discovery seam), plus at most one config/constants location.
- SU additions (provisional, locked at Step 0): +6 scenarios S367–S372:
  (a) below-floor claim triggers targeted discovery;
  (b) better source found → citation upgraded, old never removed until replaced;
  (c) no better source → keep-best + below_floor flag + NO HALT;
  (d) per-claim single-attempt + shared global cap respected;
  (e) URL dedup respected on targeted path;
  (f) zero_chunks discovery path regression-unchanged.
  All hermetic via the PHASE-52 seam pattern (no real Tavily/network in-suite).
- Provisional suite target: 365/0/5 (370 total) — exact number locked at Step 0.

## 5. Closure gate (deterministic)
1. Full SU suite exact green count on CC Windows run (number locked at Step 0).
2. Track A grep clean (no fetch()/fs.*Sync/child_process/new OpenAI() outside §ARC).
3. Gate #10 REAL run PASS, mechanism-based:
   ≥1 claim detected below floor → targeted search executed → re-retrieve
   compared → keep-best applied → flags correct → doc pass advances (no HALT).
   PLUS: per-claim relevance non-decrease vs pre-floor (guaranteed by keep-best,
   verified in evidence). Distribution reported vs PHASE-52 baseline
   (1 MEDIUM / 6 LOW) as observed data — web-content luck is NOT a pass/fail
   criterion; mechanism correctness is.
   Evidence persisted under artifacts/spikes/phase53_gate10/.
4. This artifact + PROMPT-STAGE-53 + mid-checkpoint + closure checkpoint +
   status.json phase_53 block + docs addendum (22_KNOWLEDGE_BASE_CONTRACT.md:
   floor semantics + below_floor flag).
5. Cost: mock-default; kill bar $3/phase; every real run needs separate explicit
   owner approval in chat with estimate shown first.

## 6. Alternatives considered (deferred, documented)
- Iterative MVP Loop — high owner value; larger scope; strong PHASE-54 candidate.
- Browser Automation (7-D) — needs new §ARC for subprocess → separate decision.
- SSRF-guard hardening — not needed under Approach B.
- Anthropic provider switch — blocked on ANTHROPIC_API_KEY.
