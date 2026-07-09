# DECISION-2026-07-09-phase-53-closure

**Date:** 2026-07-09
**Phase:** PHASE-53 — Relevance floor (per-claim targeted discovery for cited-but-LOW claims) — CLOSURE
**Status:** CLOSED
**Relates to:** DECISION-2026-07-09-phase-53-relevance-floor.md (+ §7 Step 0 rulings R-1..R-5); checkpoints _phase_53_checkpoints/{stage_floor_mid, stage_preclosure, stage_closure}.md; PHASE-52 closure (DECISION-2026-07-09-phase-52-closure.md §6 — the 1-MEDIUM/6-LOW data point that motivated this phase)

## 1. Outcome — verdict

PHASE-53 is **CLOSED — all deterministic gates green**. Forge's documentation citation pass
now enforces a relevance floor: a claim that WOULD be cited but whose best first-pass
relevance sits below the MEDIUM threshold gets its OWN targeted web discovery, and the
better of (original, discovered) evidence backs the single citation. The PHASE-52 gap —
citations mechanically present but semantically weak because one seeded source served every
claim — is closed at the mechanism level.

## 2. Delivered

- **Relevance floor:** FLOOR = `RELEVANCE_FLOOR_MEDIUM` (0.60) — the EXISTING MEDIUM
  confidence threshold, extracted as the ONE named constant in `citation_engine.js` and
  consumed by both `_scoreToConfidence` and the citation pass (R-4; single source of truth,
  no new magic number; the `0.6` in credibility_scorer.js is a blend weight, not a
  threshold — untouched).
- **Per-claim targeted discovery with pre-cite KEEP-BEST (R-1):** retrieve → if
  bestRel < FLOOR → ONE targeted `research.search_web(claim)` → `kb.ingest_content`
  (PHASE-52 A-1 content path; the arbitrary host is never fetched) → re-retrieve →
  KEEP-BEST by max relevance → exactly ONE `kb.cite` / ONE CitationRecord per claim
  (citations.jsonl is append-only; keep-best runs pre-cite precisely so no duplicate is
  ever appended and nothing is ever stripped).
- **Claim-granular summary forensics (R-2):** `floor_value / floor_checked / floor_below /
  floor_lifted / below_floor_claims / floor_claims[]` (per-claim
  `{line, text_prefix, trigger, best_relevance_before, best_relevance_after, attempted,
  lifted, below_floor}`) on the citation-pass summary — NOT a CitationRecord field;
  schema v1.0.0 untouched; rides both endpoint payloads as durable evidence.
- **Caps + dedup (R-3):** ONE discovery attempt per claim per pass, shared across the
  zero_chunks + floor (+ defense-in-depth cite_blocked) triggers; targeted searches count
  against the SAME per-run global cap; SAME in-run URL dedup set; a dedup-skip
  short-circuits the redundant re-retrieve.
- **Offline-safe, no new HALT:** every discovery failure mode (no TAVILY_API_KEY, search
  FAILED, nothing usable, dedup skip, ingest fail, re-retrieve fail/empty) falls back to
  citing the ORIGINAL set — byte-equivalent PHASE-52 outcome + `below_floor` flag. HALT
  semantics unchanged (zero-sources path only).
- **Surfaces:** live surface = `conversationEngine.js` + `citation_engine.js` ONLY.
  `kb.ingest_url` / http allow-list / SSRF guard **byte-identical**. §ARC **10 frozen** ·
  L2 **81** · roles **13** · doctor **35**.
- **Docs (D5):** `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` §15 addendum (floor
  semantics, R-1 mechanism + invariants, R-3 caps/dedup, R-2 forensic field table +
  lifted-vs-below_floor distinction) + §14 cross-ref row.

## 3. Gates — ALL MET

- **SU suite:** full-suite green on Windows at **365 pass / 0 fail / 5 skip (370 total)** —
  the Step-0-locked target EXACTLY; zero regressions.
- **Track A:** grep clean on every added line; live-surface forbidden-pattern COUNTS
  identical pre/post (fs.*Sync 2/2 pre-existing reads, new OpenAI 0/0, fetch 0/0,
  child_process 2/2 vm-blocklist strings) — CTO-verified independently.
- **Scenarios:** S367–S372 added (+6): floor trigger + ≥floor untouched / keep-best
  upgrade with the exactly-one-CitationRecord R-1 guard / no-lift keep-best + flag +
  NO HALT (incl. offline leg) / shared global cap across triggers (R-3) / shared URL
  dedup + re-retrieve skip / zero_chunks citation-output regression. All hermetic
  (PHASE-52 `_discovery` seam + vector-controlled cosine relevance).
- **Gate #10 REAL: GATE_PASS** (commit `49453ce`; evidence
  `artifacts/spikes/phase53_gate10/` — GATE_RESULT.md, gate10_owner.json, preflight.txt,
  searches_and_ingests.json, citations.jsonl). CTO recomputed all criteria from the raw
  evidence JSON:

  | Criterion | Actual | Result |
  |---|---|---|
  | (a) ≥1 claim below floor | floor_below=7 (floor_checked=7, N=8) | PASS |
  | (b) ≥1 REAL targeted search (production path, no seam) | 7 floor-trigger attempts; 8 web_search ledger rows; tavily-only | PASS |
  | (c) KEEP-BEST per-claim non-decrease | 8/8 records, 0 violations | PASS |
  | (d) No HALT | §8 PASS, advanced → QUALITY_JUDGE (graph confirms), uncited=0 | PASS |
  | (e) Flags correct | 8 records, 0 flag errors | PASS |

  Distribution (observed data, not a pass bar): **0 HIGH / 2 MEDIUM / 6 LOW** vs the
  PHASE-52 baseline 1 MEDIUM / 6 LOW. 8 unique citations.jsonl records (R-1 held on the
  real path). Spend **$0.05457 ledger** (real cash ≈ **$0.0146** — Tavily free tier; the
  ledger books a flat $0.005/search estimate × 8) ≤ $0.15 cap ≪ $3 kill bar.

## 4. Honest picture

**ALL 8 claims were lifted** — every targeted discovery found a strictly better source
(8 distinct claim-targeted REPUTABLE sources, vs ONE shared source serving all claims in
PHASE-52). 2 claims crossed into MEDIUM (0.6219, 0.6019); 6 improved but remain LOW —
public web content quality bounds ABSOLUTE relevance; the mechanism (detect → target →
keep-best → flag) is correct, and the shared cap prevented any overrun (8 searches =
the ceiling exactly, no runaway).

## 5. Step 0 rulings recap (R-1..R-5) + attribution

R-1 pre-cite KEEP-BEST (single kb.cite; duplicate-append impossible) · R-2 summary-level
claim-granular forensics (no CitationRecord field) · R-3 one attempt/claim shared across
triggers · R-4 RELEVANCE_FLOOR_MEDIUM extraction (exactly one 0.60 threshold literal
post-extraction) · R-5 status.json doctor-drift fold (realized via owner interim commit
`3f2b904` + the D4+D5 commit — recorded in stage_preclosure §4 c-bis).
**F-1 (kb.cite persists immediately → post-cite "upgrade" would duplicate records) and
F-2 (record-level flag would exceed the declared touch surface) were surfaced by CC at
Step 0; ratified by the CTO after independent line-level verification against
main@49097f1 — recorded per the bidirectional Trust+Verify norm.**

## 6. PHASE-54 seed candidates (owner-gated — NOT decided here)

Iterative MVP Loop (strong candidate — direct owner value) · Browser Automation 7-D
(needs a new §ARC decision for subprocess) · Anthropic provider switch (needs
ANTHROPIC_API_KEY) · providerTrace response persistence (standing backlog) ·
relevance-quality follow-ups (e.g. per-claim query refinement) if the floor data
motivates them. Each requires a fresh decision artifact + explicit owner approval;
do NOT auto-open.

## 7. Closure gate — MET

SU 365/0/5 (370) ✓ · Track A clean ✓ · §ARC=10 ✓ · L2=81 ✓ · decision artifact (+§7
rulings) + PROMPT-STAGE-53 + mid + preclosure + closure checkpoints written ✓ · REAL
Gate #10 GATE_PASS with permanent evidence ✓ · status.json phase_53 block + flip ✓ ·
D5 docs addendum ✓.

## 8. Approval

Closure under owner standing delegation (Gate #10 spend separately owner-approved in
chat). Push GO + annotated tag `phase-53-complete` (on the specific closure commit hash,
not HEAD) come only after the CTO's fresh-zip closure-diff verification.
