# DECISION-2026-07-08-phase-52-research-backed-citations

**Date:** 2026-07-08
**Phase:** PHASE-52 — RESEARCH-BACKED CITATIONS (auto web-discovery in the documentation citation pass)
**Status:** APPROVED (scope owner-approved 2026-07-08; implementation pending Step 0 GO)
**Relates to:** DECISION-2026-07-07-phase-51-kb-cite.md (A-1, A-2); DECISION-2026-07-08-phase-51-closure.md; DECISION-20260512-phase-9-closure.md (search_web + kb.ingest_url origin)
**Supersedes:** none

## 1. Context
PHASE-51 (kb.cite) closed with documentation-time citations working end-to-end on the real path. Amendment A-2 fixed a latent squared-L2-vs-cosine bug; post-fix relevance landed at [0.475..0.478] — yet every real citation was still LOW confidence. Root cause is no longer scoring; it is source targeting: the project KB holds only manually-ingested sources, and general/tangential sources relate to a claim's topic without textually supporting the specific claim. Two structural limits: (L-1) sources must be manually ingested or the §8 audit blocks the build; (L-2) citations are LOW because available sources are not claim-targeted.

## 2. Scope correction (bidirectional Trust+Verify)
The inherited handoff framed PHASE-52 as "add a TAVILY search_web tool + add api.tavily.com to the allow-list." Independent CTO code-read (2026-07-08) found this premise stale:
| Handoff premise | Verified reality |
|---|---|
| research_tools gains search_web via Tavily | research.search_web ALREADY EXISTS (PHASE-9) — Brave primary + Tavily fallback; auto-registered (part of the 80) |
| add api.tavily.com to allow-list | ALREADY present in http_tools.DEFAULT_ALLOW_HOSTS (+ api.search.brave.com) |
| (unmentioned) | kb.ingest_url (fetch→chunk→embed→store) ALREADY EXISTS (PHASE-9) |
| (unmentioned) | Brave is the primary provider; only Tavily was named |
Ruling: the capability intent (web discovery to lift citations above LOW) is confirmed and unchanged. The scope is corrected — PHASE-52 is an orchestration/wiring phase, not a tool-addition phase. Recorded here as a documented erratum per the bidirectional Trust+Verify norm.

## 3. The gap PHASE-52 closes
research.search_web and kb.ingest_url exist but are NOT wired into the documentation citation pass (no caller of search_web in code/src/ai_os/). Wiring point: conversationEngine.documentProject, post-generation citation pass. Current per-claim behavior: kb.retrieve → if zero chunks, uncited; else kb.cite → cited, or uncited when cite skips (LOW-only). PHASE-52 inserts web discovery on the would-be-uncited branches.

## 4. Decision — deliverables
D1 — Auto-discovery loop in documentProject: when a §7.1 claim would otherwise stay uncited for ANY reason (zero KB chunks OR kb.cite skip due to LOW-only) → research.search_web(claim) → kb.ingest_url(top result[s]) into the active project KB → kb.retrieve(claim) again → kb.cite. Discovery fires ONLY on would-be-uncited claims; already-citable claims are untouched (strictly additive). Never fabricate; if discovery yields nothing citable, the claim stays uncited and §8 remains the gate.
D2 — Guardrails: per-claim search cap; per-documentProject total-search cap; URL dedup (never ingest the same URL twice per run); fail-closed + C-2 preserved.
D3 — SU scenarios (mock, $0): ≥4 hermetic scenarios (exact set locked at Step 0): discovery lifts a zero-chunk claim to CITED (and an already-citable claim in the same doc does NOT trigger search); discovery finding nothing leaves the claim UNCITED (fail-closed); search cap enforced; URL dedup.
D4 — Real Gate #10 (gated): real Tavily search → real ingest → real cite; before/after relevance vs [0.475..0.478]. Requires a separate explicit owner "yes" + estimate.

## 5. Scope sub-decisions (owner-approved 2026-07-08)
- Discovery trigger: would-be-uncited for ANY reason (zero chunks OR LOW-only cite-skip). Rationale: LOW-only is exactly what produced PHASE-51's weak citations.
- Relevance floor: DEFERRED. Ship discovery first; measure at Gate #10 whether it alone lifts citations above LOW; revisit a floor only if data shows it's needed.

### §5 Correction — CTO erratum #3 (2026-07-08, recorded per bidirectional Trust+Verify; original bullets preserved above)
The turn-1 scope, this §4/§5, and the Step 2 GO S361-Leg-B all framed the `cite_blocked` branch as "the PHASE-51-LOW-citation fix." That framing was WRONG — CC caught it with a $0 hermetic probe BEFORE building D3; the CTO independently re-verified it by reading the modules:
- `kb.retrieve` runs with `credibility_floor:"COMMUNITY"` and filters LOW-credibility chunks (`TIER_RANK`, retrieval.js:160) BEFORE `kb.cite`; `kb.cite` skips only on an all-LOW set (citation_engine.js:52-58). The two sets are **disjoint** → any chunk that passes retrieve passes cite. So on the real path `cite_blocked` (and thus the `discovery_blocked_low` counter) is **UNREACHABLE**; discovery effectively triggers **only on `zero_chunks`**.
- PHASE-51's weak citations were LOW-**confidence** but **SUCCESSFUL** cites (they were written; §8 PASSED; the build advanced) → they hit the `cited` branch → discovery does NOT touch them. Lifting them requires the **DEFERRED relevance floor** (§5/§10), not discovery.

**Corrected value statement.** Discovery's REACHABLE value is the **L-1 auto-discovery fix**: a §7.1 claim with NO KB source (`zero_chunks`) → auto search + ingest → the build no longer halts for manual KB seeding. For the fresh-KB workflow (empty KB → every claim `zero_chunks`), discovery may ALSO improve citation **CONFIDENCE** by finding claim-**targeted** sources (higher relevance than PHASE-51's manually-ingested general sources) — **TO BE MEASURED at Gate #10** (this measurement is the data-driven input to whether the deferred floor is even needed). The `cite_blocked` branch is RETAINED as documented, forward-compatible defense-in-depth (unreachable under the COMMUNITY floor; fires only if the floor is lowered) — see the in-code NOTE at that branch. Option B (ship the floor now) REJECTED as a mid-phase scope expansion needing a fresh decision; Option C (lower the retrieve floor) REJECTED (changes retrieval behavior, adds no value).

D3 consequence: **S361 proves the no-fabrication guarantee via the REACHABLE mechanism** — a LOW ingested source → real re-retrieve filters it → re-cite never succeeds → claim stays UNCITED (Leg B asserts the OUTCOME + `discovery_ingests≥1 ∧ discovery_cited===0`, not the unreachable `discovery_blocked_low`).

## 6. Track A / §ARC ruling
All discovery/ingest/retrieve/cite calls via reg.invoke (already the case). §ARC FROZEN AT 10 — cost_ledger + manifests writes are already covered by §ARC-4; no new write path, no new exception. No new fetch()/fs.*Sync/child_process/new OpenAI() outside §ARC-bounded modules.

## 7. Provider ruling (Tavily via existing fallback path)
search_web is Brave-primary / Tavily-fallback. To use Tavily (owner's delegated choice): set TAVILY_API_KEY, leave BRAVE_SEARCH_API_KEY unset — the tool skips Brave and uses Tavily. No provider-selection code change. TAVILY_API_KEY via the existing secret path; required ONLY for D4 (real Gate #10) — all dev and mock scenarios are $0 and need no key.

## 8. Cost & budget
$0 dev (mock search + mock/hermetic ingest). Real Gate #10 estimate ~$0.03–0.10 (Tavily free tier = $0; embedding ≈ fractions of a cent; one gpt-4o doc call ~$0.02–0.03). Kill bar $3/phase. No real spend without a separate owner "yes" + estimate shown first.

## 9. Closure gate (deterministic)
SU = 356 pass / 0 fail / 5 skip (361 total) [352 + 4, exact set locked at Step 0]; Track A greps clean; §ARC = 10; this artifact committed; status.json updated (current → PHASE-52 CLOSED, next → PHASE-53-PENDING-DECISION); mid-checkpoint written (_phase_52_checkpoints/stage_wiring_mid.md); Real Gate #10 PASS with permanent before/after evidence: post-discovery relevance for ≥1 real claim exceeds [0.475..0.478].

## 10. Out of scope / deferred
Relevance floor (deferred, §5); Brave-primary usage (Tavily path chosen); flipping provider order; TAVILY as a new dep/tool (already exists); allow-list changes (already present); browser automation; iterative MVP loop; providerTrace response persistence (backlog, unchanged).

## 11. Approval
Scope owner-approved by Khaled 2026-07-08 (standing decide-and-proceed). Implementation begins only after CC posts a Step 0 summary and the CTO returns an explicit GO. Real Gate #10 requires a further separate owner approval with estimate.
