# DECISION-2026-07-08-phase-51-closure — PHASE-51: kb.cite (Documentation-Time Citation Generation) — CLOSURE

Status: CLOSED (pending CTO fresh-zip closure-diff → "push GO + tag" → annotated tag phase-51-complete on THIS closure commit)
Closes: PHASE-51-KB-CITE (DECISION-2026-07-07-phase-51-kb-cite.md + Amendments A-1 seam, A-2 cosine fix)
Closure date: 2026-07-08

## 1. Crux achieved
Documentation-time citation generation works end-to-end on the REAL path: real gpt-4o
documentation → §7.1 claim detection → per-claim `kb.retrieve` (real embeddings + real
LanceDB) → `kb.cite` → `citations.jsonl` → §8 citation audit PASS → advance DOCUMENTATION →
QUALITY_JUDGE. Before this phase the kb.cite tool and the §8 audit both existed but NOTHING
in the pipeline emitted citations, so every real documentation build halted at DOCUMENTATION.
Proven TWICE with real gpt-4o: W-3 (pre-fix) and W-A2-3 (post-fix). The pass is a
deterministic post-generation sidecar (NOT RAG): it reuses the SAME §7.1 detector the audit
uses (coverage parity), leaves `documentation.json` byte-identical, and NEVER fabricates
(§5 hard rule — unsupported claims stay uncited and §8 stays fail-closed).

## 2. The A-2 journey (the phase's defining event)
The first REAL Gate #10 (W-3) advanced the build (§8 PASS) but exposed a LATENT,
PRE-EXISTING scoring bug: `storage_lance.searchVector` queried LanceDB with NO metric
option (LanceDB's default is squared-L2, where `_distance = 2(1-cos)` for unit vectors),
while `_toResult` scored `relevance_score = max(0, 1 - _distance)` — a formula only correct
for a cosine distance in [0,1]. Consequence: any claim-chunk pair with cosine < 0.5 →
squared-L2 > 1 → `1 - _distance` < 0 → clamped to **0.000**. W-3's 8 real citations were all
relevance 0.000. `storage_lance.js` was byte-identical to PHASE-50; PHASE-51 was simply the
first phase whose OUTPUT VALUE (citation relevance/confidence) depended on that score.

Diagnosed TRIPLE-verified at $0 (CC probe + a 4-agent parallel workflow + an adversarial
verify-probe, all agreeing to the digit): metric = L2, `_distance` = SQUARED-L2 (orthogonal
unit pair → 2.0; moderate cos0.7071 → 0.5858; low cos0.3162 → 1.3675); embeddings are
unit-normalized (real text-embedding-3-small@512 norm 0.99978 — the property comes from
OpenAI, NOT from `embedding_engine.js`, which does not normalize). Blast radius = 0 in the
active suite; PHASE-50 unaffected (its "HIGH" was the research-finding `confidence_level`,
recomputed from certainty distribution — independent of citation `relevance_score`).

Fixed CTO-ratified Option B (explicit cosine metric — robust to a future embedder swap,
decoupled from the OpenAI unit-norm assumption): `searchVector` now queries with
`.distanceType("cosine")` (LanceDB 0.21.3 supported; a dead unused `let q = …` line was
removed), and `_toResult` scores `relevance_score = max(0, min(1, 1 - _distance))` = the true
cosine similarity. Re-proven on the REAL path (W-A2-3, strong source): relevance
`[0×8]` (pre-fix, Express, buggy) → `[0.475, 0.357, 0.357, 0.351, 0.376, 0.364, 0.381, 0.478]`
(post-fix, azure-guidelines, cosine). This is the project's core "scenario green / real path
broken" failure mode — CAUGHT by a real run and FIXED, with a hermetic regression scenario
(S359) that would have caught it originally (S356 could not: it uses identical vectors →
distance 0 → relevance 1.0 under any formula).

## 3. Honest calibration (NOT a defect)
The post-fix citations are all LOW confidence because a general external source (Microsoft
Azure REST API Guidelines) is topically RELATED to a bespoke task-management API but does not
specifically RESTATE its claims. ~0.3 is the baseline technical-text cosine; the most
REST-relevant claims score highest (`purpose` 0.475, `summary` 0.478, `400`-status 0.357),
tangential ones (logging, install) sit ~0.35. This is the CORRECT honest calibration — the
relevance SIGNAL is now meaningful; nothing reaches MEDIUM/HIGH because no source near-restates
a specific claim. A relevance FLOOR (min-relevance to cite) is deferred as OPTIONAL backlog:
it could over-block honest LOW citations, so it is not clearly desirable.

## 4. Errata log (bidirectional Trust + Verify)
- CTO erratum #1: PROMPT §0c guessed the `citations.jsonl` writer is §ARC-7; correct is
  §ARC-4 (`manifests.appendCitation`). §ARC-7 is `env_loader.js` (.env reader), unrelated.
  Caught by CC in Step 0.
- CTO erratum #2: W-A2-3 named `api-guidelines/vNext/Guidelines.md` as the strong source; it
  was a 1039-char dead DEPRECATION STUB (PHASE-50 closure note (g)). Caught by CC's $0
  `http.get` pre-flight BEFORE any spend; CTO confirmed the swap to `azure/Guidelines.md`.
- CTO catch: CC's W-3 report characterized the zero-relevance citations as "topically relevant,
  low cosine (no relevance floor)"; the independent CTO code-read found the true root cause —
  the squared-L2 vs cosine scoring bug. This drove Amendment A-2.

## 5. Closure gate (all TRUE)
- [x] SU suite **352 pass / 0 fail / 5 skip (357 total)** on Windows (prior 351 + S359 regression).
- [x] Track A grep CLEAN on every touched live-surface file (conversationEngine.js,
      storage_lance.js, citation_pass_test_helper.js, document_project_test_helper.js).
- [x] §ARC = 10 unchanged (citations.jsonl via existing §ARC-4 `manifests`; the cosine fix is
      metric + arithmetic only — no new exception, no new write path).
- [x] decision artifact (DECISION-2026-07-07-phase-51-kb-cite.md) + Amendment A-1 (W-2
      hermeticity seam) + Amendment A-2 (cosine fix) + THIS closure artifact.
- [x] status.json flipped (IN_PROGRESS at open → COMPLETE at close).
- [x] mid-checkpoint (_phase_51_checkpoints/stage_kb_cite_mid.md + W-2 addendum).
- [x] Gate #10 real-provider PASS with durable evidence — pre-fix (W-3) AND post-fix (W-A2-3),
      both persisted (gate10_owner*.json + citations*.jsonl side-by-side).

## 6. Evidence pointers
- `artifacts/spikes/phase51_w3/` — pre-fix (W-3): real gpt-4o, Express README, GATE_PASS but
  relevance all-zero (the latent bug, honestly recorded).
- `artifacts/spikes/phase51_w3_postfix/` — post-fix (W-A2-3): real gpt-4o, Azure REST
  Guidelines, GATE_PASS with non-zero cosine relevance (0.27–0.48). Before/after preserved
  side-by-side.

## 7. Commit trail (all LOCAL until CTO "push GO")
c069529 W-0 (decision + status flip) · 6042834 W-1 (pass + S-D/S-E) · 9cffb0c mid-checkpoint ·
9259e2a W-2 (S-A/B/C + seam A-1) · e24e190 W-2.1 (lazy storage_lance) · 6a404ba W-3 (Gate #10
real, pre-fix) · ec4ef5a A-2 open · bad42b6 A-2 fix (Option B) + S359 · 3161f16 driver update
(owner interim) · c302c39 W-A2-3 (post-fix Gate #10 evidence) · <this closure commit> W-4.
The annotated tag phase-51-complete goes on THIS closure commit hash — only after the CTO
verifies from a fresh zip and says "push GO + tag".

## 8. Backlog (none blocking)
- Relevance FLOOR (min-relevance-to-cite) — OPTIONAL; could over-block honest LOW citations.
- providerTrace response persistence for the agent.invoke path (PHASE-48/50 gap).
- active_project.json schema unification (project_id vs active_project_id — dual-key reads
  applied both sides in PHASE-50).
- TAVILY / web-search discovery (deferred since PHASE-50 A-1).
- Browser automation (PHASE-7-D placeholder); iterative MVP build loop (PHASE-10).
- Light Playwright UI smoke (PHASE-13) to catch endpoint-shape parse bugs pre-owner.
- `embedding_engine.js` does not enforce unit-normalization (relies on OpenAI's output
  property) — a defensive normalize (or an assertion) would harden a future embedder swap.

## 9. Next
PHASE-52-PENDING-DECISION (requires a fresh decision artifact + owner approval — do NOT
auto-open).
