# PHASE-53 — Mid-Checkpoint: stage_floor_mid (after D1 + D2, per PROMPT-STAGE-53 §3)

- Date: 2026-07-09
- Phase: PHASE-53 (Relevance Floor — per-claim targeted discovery for cited-but-LOW claims)
- Decision: DECISION-2026-07-09-phase-53-relevance-floor.md (D0 `8d1d7d0`; §7 rulings R-1..R-5 `25980e5`)
- GO scope honored: Task A (rulings appended verbatim + §4 annotation, append-only) + D1 + D2 ONLY.
  NO scenarios (D4 post-mid), NO docs addendum (D5), NO real API calls.
- Cost so far: **$0** (hermetic only — fake reg + `_discovery` seam; SU harness strips provider keys).
- §ARC: frozen at **10** (no new exception, no new write path) · L2 tools: **81** (unchanged) · roles: 13.
- Inherited base: `49097f1` (== origin/main; tag phase-52-complete → `98bf224`). No push, no tag.

---

## 1. State — D1 + D2 DONE (two live files, +157/−6)

| File | Δ | What |
|---|---|---|
| `code/src/runtime/kb/citation_engine.js` | +9/−2 | **D1 (R-4)**: `RELEVANCE_FLOOR_MEDIUM = 0.60` extracted at module scope [21]; `_scoreToConfidence` consumes it [25]; exported alongside `synthesizeCitation` [106]. HIGH 0.80 stays inline (out of scope). Post-extraction: exactly ONE 0.60 relevance-threshold literal in the codebase (credibility_scorer.js:149 `* 0.6` is a heuristic/LLM blend WEIGHT, not a threshold — untouched, per CTO addendum). |
| `code/src/ai_os/conversationEngine.js` | +148/−4 | **D2 (R-1/R-2/R-3)**: value-only import [15] (precedent: validateCitations import above it); floor forensics on the summary [110-119]; `_bestRelevance` helper [241-249]; `_attemptFloorDiscovery` [261-315]; pre-cite floor check + KEEP-BEST in the hook window [338-370]; single `_cite(text, line, citeChunks)` [375]; R-3 forensic record at the `_attemptDiscovery` zero_chunks success point [218-231]; R-3 guard on the cite_blocked branch [390-392]. |

The 6 removed lines are exactly the intended replacements (verified from the diff):
summary discovery_* line (re-added + floor fields) · `_attemptDiscovery` success return
(expanded with the R-3 record) · `_cite(..., chunks)` → `_cite(..., citeChunks)` ·
cite_blocked discovery call (gains the `!floorAttempted` guard) · citation_engine `>= 0.60`
literal → named constant · citation_engine exports line. Nothing else touched.

---

## 2. Mechanism (R-1 pre-cite keep-best — as ratified)

Per claim WITH first-pass chunks: `bestBefore = _bestRelevance(chunks)`; if
`bestBefore < RELEVANCE_FLOOR_MEDIUM` → `_attemptFloorDiscovery(text)` = search → shared-dedup
→ `kb.ingest_content` → re-retrieve → returns the new set (or null on ANY failure mode) →
**KEEP-BEST**: the new set replaces the original ONLY on strict max-relevance improvement →
exactly **ONE** `kb.cite` with the winning set (one CitationRecord per claim; citations.jsonl
append-only). Every failure mode (cap reached / search FAILED e.g. no TAVILY key / nothing
usable / dedup skip / ingest fail / re-retrieve fail-or-empty) → cite with the ORIGINAL set =
byte-equivalent PHASE-52 outcome, claim still cited, `below_floor` flagged — NO new HALT.

**R-2 forensics (summary-level, claim-granular)** — additive fields, consumed by no
pre-existing scenario: `floor_value` (= the applied constant, self-describing evidence),
`floor_checked` / `floor_below` / `floor_lifted` (floor trigger only), `below_floor_claims`
(final-below-floor on EITHER trigger path), and `floor_claims[]` with one record per affected
claim: `{ line, text_prefix, trigger: "floor"|"zero_chunks", best_relevance_before,
best_relevance_after, attempted, lifted, below_floor }`. Durable by construction —
`citation_pass` rides both endpoint payloads (error :2765 / success :2786 post-edit).

**R-3 (one attempt per claim, shared across triggers)**: the floor path consumes the claim's
single attempt (`floorAttempted`); the cite_blocked branch (erratum-#3 unreachable,
defense-in-depth) is guarded with `!floorAttempted`; a zero_chunks-lifted claim that remains
< floor gets the forensic record + `below_floor` flag inside `_attemptDiscovery` — never a
second search.

Semantics note (documented for D5): `lifted` = keep-best selected the NEW set (strict
improvement), independent of crossing the floor; `below_floor` = final best relevance < floor.
Both facts are independently reconstructable per claim.

---

## 3. Invariants status

| Invariant | Status | How held |
|---|---|---|
| never-downgrade | **HOLDS by construction** | KEEP-BEST replaces only on `newBest > bestBefore`; probe L2 proves the worse-set case keeps 0.30 |
| never-strip | **HOLDS by construction** | exactly ONE kb.cite per claim (no post-cite re-cite, no duplicate records); probe L1/L2 prove single-cite |
| no-new-HALT | **HOLDS** | floor path NEVER turns a citable claim uncited — all failure modes fall back to the original set; probe L2/L4 prove cited=1; PHASE-52 HALT semantics (zero-sources) byte-untouched |
| shared budget | **HOLDS** | `_attemptFloorDiscovery` increments the SAME `totalSearches` against the SAME `maxTotalSearches`; one enforcement point |
| shared URL dedup | **HOLDS** | same `ingestedUrls` set; probe L5 proves one ingest across two claims |
| offline-safe | **HOLDS** | no key → search_web fails fast, $0, flags applied, outcome = PHASE-52; probe L4 |
| one attempt/claim across triggers (R-3) | **HOLDS** | `floorAttempted` guard + in-discovery record; probe L6 |
| kb.ingest_url / http allow-list / SSRF guard | **ZERO touches** | neither file in the diff (2-file diff surface only) |
| §ARC | **10, frozen** | no new write path; all side effects via reg.invoke / seam |

---

## 4. Gates run (this stage)

- **Full SU suite (gating):** `node bin/forge-test.js` → **ALL PASS — 359 passed / 0 failed /
  5 skipped (364 total)**, exit 0, duration 209914ms — REQUIRED baseline exactly; zero
  regressions. (Pre-code baseline re-run this session was also 359/0/5, 135811ms.)
- **Track A grep (gating):** all added lines across both files —
  `fs.*Sync | require('fs') | node-fetch | fetch( | new OpenAI | child_process` → **NONE, CLEAN**.
- `node --check` → SYNTAX_OK both files; constant export verified (`0.6`).
- **$0 hermetic probe (welcome, non-gating):** `scripts/spikes/phase53_floor_probe.js`
  (committed for CTO re-run; fake reg + `_discovery` seam, no network/fs/keys) —
  **19/19 assertions PASS across 6 legs**:
  - L1 below-floor + better source → ONE kb.cite with the 0.72 set; counters 1/1/1/0; record `{0.30→0.72, attempted, lifted, !below_floor}`.
  - L2 below-floor + worse source → ONE kb.cite with the ORIGINAL 0.30 set (never-downgrade); flagged; still CITED (no HALT).
  - L3 above-floor → floor evaluated, NO search, untouched.
  - L4 search FAILED (offline/no-key) → keep original, attempted=true, flagged, CITED.
  - L5 two below-floor claims, same URL → shared dedup: ONE ingest; redundant re-retrieve short-circuited (3 retrieves, not 4).
  - L6 zero_chunks lift landing at 0.30 → `below_floor` flagged, exactly ONE attempt (R-3), floor-trigger counter unpolluted.

---

## 5. Honest notes / open items for CTO

- (a) **Deliberate micro-divergence from `_attemptDiscovery`:** on dedup-skip/no-ingest
  (`ingested === 0`), `_attemptFloorDiscovery` SKIPS the redundant re-retrieve (the first-pass
  retrieve already saw everything the KB holds) and returns null → keep original.
  `_attemptDiscovery` (zero_chunks) still re-retrieves unconditionally — its body was NOT
  touched beyond the additive R-3 record. Deterministic + one embed call cheaper; probe L5
  asserts it. Flagged here per the "seam adjustments at mid-checkpoint" norm.
- (b) **`floor_checked` counts claims with ≥1 first-pass chunk** (floor evaluated); claims on
  zero_chunks/retrieve_failed/short-text paths are not "floor-checked" (they have no first-pass
  relevance). zero_chunks-lifted claims appear in `floor_claims`/`below_floor_claims` only.
- (c) `_attemptFloorDiscovery` counts a launched-but-FAILED search against the shared budget
  (totalSearches++ before the call) — consistent with `_attemptDiscovery`'s existing behavior.
- (d) status.json working-tree drift (doctor auto-refresh: `last_doctor_run` + one array
  re-serialization) left UNCOMMITTED per **R-5** — this commit does not legitimately update
  status.json; the drift folds into the next commit that does.
- (e) D3 note: caps + dedup wiring (decision §3) is already materially in place via the shared
  counter/set reuse above; D3 at Step 2 reduces to verification + any CTO-ruled adjustments.

## STOP

D1 + D2 complete and gate-proven (full suite 359/0/5 unchanged, Track A clean on all added
lines, §ARC=10, L2=81, $0, probe 19/19 green). Awaiting CTO mid-verification from the owner's
LOCAL folder zip. Do NOT proceed to D3/D4/D5 until the CTO returns Step 2 GO. D4's real Gate
#10 remains a HARD STOP pending a separate owner spend "أيوه" + estimate.
