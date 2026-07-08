# PHASE-52 — Mid-Checkpoint: stage_wiring_mid (after D1 + D2, per PROMPT-STAGE-52 §3)

- Date: 2026-07-08
- Phase: PHASE-52 (Research-Backed Citations — auto web-discovery in the documentation citation pass)
- Decision: DECISION-2026-07-08-phase-52-research-backed-citations.md (D0 committed LOCAL `e0ebf91`)
- Step 1 GO: CTO ratified — RULING 1 (Option-1 seam), RULING 2 (exactly-two-branch trigger), RULING 3 (S360–S363), + CTO refinement (LOW-filter preserved on re-cite) + cost guardrail emphasis.
- Cost so far: **$0** (no real provider calls; no BRAVE/TAVILY/OPENAI key in the harness env).
- §ARC: frozen at **10** (no new exception, no new write path) · L2 tools: 80 · roles: 13.
- Inherited base: `5e7f759` (== origin/main == tag phase-51-complete). No push, no tag.

---

## 1. State — D1 + D2 DONE (one live file, LOCAL commit only)

Single live-surface file edited: **`code/src/ai_os/conversationEngine.js`** (`+147 / −23`, 1 file).
No test files added yet (D3 = Step 2). No new tools, no new deps, no doc edits.

---

## 2. Exact diff surface (3 hunks, all in conversationEngine.js)

### Hunk A — module-scope guardrail constants (D2), new lines [39–42]
```
const DISCOVERY_MAX_SEARCHES_PER_CLAIM = 1;   // one targeted search per triggered claim (query = claim text)
const DISCOVERY_MAX_TOTAL_SEARCHES     = 8;   // per-documentProject ceiling (the cost ceiling)
const DISCOVERY_MAX_URLS_PER_CLAIM     = 1;   // ingest only the top usable result
const DISCOVERY_SEARCH_MAX_RESULTS     = 5;   // ask for a few; take the first usable url
```

### Hunk B — `runDocumentationCitationPass` rewrite (D1 + D2), [87–246]
- Signature gains an OPTIONAL trailing 7th param `_discovery` (A-1 `_client` analog):
  `runDocumentationCitationPass(reg, projectId, artifactRelPath, content, root, _client, _discovery)`.
- `summary` gains 4 additive forensic fields (Gate #10 evidence; read by NO existing scenario):
  `discovery_searches, discovery_ingests, discovery_cited, discovery_blocked_low`.
- New in-run state: `ingestedUrls` (Set — URL dedup) + `totalSearches` (counter, capped).
- `maxTotalSearches` = `_discovery.maxTotalSearches` (test-only override) **or** `DISCOVERY_MAX_TOTAL_SEARCHES`.
- Four seam-aware invokers (`_search`, `_ingest`, `_retrieve`, `_cite`): production → `reg.invoke(...)`;
  tests → `_discovery.{search,ingest}`. `retrieveCtx`/`ingestCtx` = `{root}` (or `{root,_client}` when
  the embed seam is present) — byte-identical to the seam-absent PHASE-51 ctx.
- `_attemptDiscovery(text, line)` [144–191]: per-claim loop bounded by `DISCOVERY_MAX_SEARCHES_PER_CLAIM`,
  each iteration also gated by `totalSearches < maxTotalSearches`. search → collect ≤`MAX_URLS_PER_CLAIM`
  usable urls → in-run dedup → ingest → re-retrieve → re-cite. Returns `true` iff the re-cite is `SUCCESS`
  (a REAL non-LOW citation); on re-cite skip it bumps `discovery_blocked_low` and returns `false`.
- Per-claim loop [193–239]: retrieve → `retrieve_failed` (uncited, **NO discovery** — RULING 2) /
  `zero_chunks` (→ discovery) / cite → `cited` (first-pass, **NO discovery**) / `cite_blocked` (→ discovery).

### Hunk C — engine-construction seam capture + call-site wiring
- [257] `const _kbDiscovery = options._discovery || undefined;` (right after `_kbEmbedClient` at [252]).
- [2560–2562] the `documentProject` call site passes the 7th arg: `..., root, _kbEmbedClient, _kbDiscovery);`.

**`documentProject` itself is otherwise UNCHANGED** — the discovery loop lives entirely inside
`runDocumentationCitationPass`; the bridge only threads one additional optional seam value.

---

## 3. Guardrail constants + values (D2)

| Constant | Value | Purpose |
|---|---|---|
| `DISCOVERY_MAX_SEARCHES_PER_CLAIM` | **1** | one targeted `research.search_web` per triggered claim (query = claim text; a 2nd search of the same text yields nothing new) |
| `DISCOVERY_MAX_TOTAL_SEARCHES` | **8** | per-`documentProject` ceiling — the real Gate #10 cost ceiling. Worst case ≈ 8×$0.005 search + 8 embeds ≈ **$0.04**, well under the decision-§8 estimate ($0.03–0.10) and far under the $3 kill bar. Conservative by design. |
| `DISCOVERY_MAX_URLS_PER_CLAIM` | **1** | ingest only the top usable result per claim |
| `DISCOVERY_SEARCH_MAX_RESULTS` | **5** | ask the search tool for a few; take the first usable url |
| `ingestedUrls` (Set) | in-run | URL dedup — never ingest the same url twice per run (complements `kb.ingest_url`'s persistent hash dedup) |
| `_discovery.maxTotalSearches` | test-only | optional override of the total cap so D3's cap scenario (S362) binds deterministically without a bespoke many-claim mock doc. Absent in production (production `_discovery` is `undefined`). **FLAGGED**: this is a minor extension of the RULING-1 `{search, ingest}` shape — surfaced here per the CTO's "flag seam adjustments at the mid-checkpoint" instruction. If you prefer the pure `{search,ingest}` shape, I will instead drive S362 with a >8-claim fixture (heavier). |

---

## 4. Trigger scope — EXACTLY TWO branches (RULING 2), proven by construction

| First-pass outcome | Line | Discovery? |
|---|---|---|
| `text.length < 10` | [199] | no (cannot form a valid CitationRecord) |
| `retrieve_failed` (envelope not SUCCESS) | [213] | **NO — EXCLUDED (RULING 2)**: same infra would fail the re-retrieve |
| `zero_chunks` (retrieve OK, 0 chunks) | [217–221] | **YES** → `_attemptDiscovery` |
| `cited` (first-pass kb.cite SUCCESS) | [231] | no (already citable — untouched) |
| `cite_blocked` (kb.cite skip, LOW-only) | [234–237] | **YES** → `_attemptDiscovery` (the PHASE-51-LOW fix) |

**No fabrication (CTO refinement):** `_attemptDiscovery` returns `true` ONLY when the re-cite `kb.cite`
returns `SUCCESS`. `kb.cite`'s own §5/C-2 LOW-filter is unchanged and authoritative — a newly-ingested
source that yields only LOW chunks → re-cite BLOCKED → `discovery_blocked_low++` → `false` → claim STAYS
UNCITED → §8 remains the fail-closed gate. Discovery can only lift to a REAL non-LOW citation; it can
never force a fabricated/LOW "cited".

---

## 5. Track A — CLEAN on every added line

`git diff -- conversationEngine.js | grep '^+' | grep -E "fs\.[a-zA-Z]+Sync|require\('fs'\)|node-fetch|[^.]fetch\(|new OpenAI|child_process|ARC-"`
→ **NONE — Track A CLEAN on added lines.** All discovery I/O is via `reg.invoke("research.search_web" /
"kb.ingest_url" / "kb.retrieve" / "kb.cite")` or the injected `_discovery` functions. `node --check` → `SYNTAX_OK`.
(The only `fs.*Sync` hits in the file — [3], [269] `readJsonSafe`, [972] vision-path read — are PRE-EXISTING
and untouched. The `child_process` hits [1702] (a "no child_process" comment) and [1902] (the `vm`-builtin
allowlist string) are PRE-EXISTING negative matches.) §ARC = **10** unchanged (no new write path; `search_web`
cost_ledger + `kb.ingest_url` manifests writes are the EXISTING §ARC-4 bounded writers, reached only via the
L2 tools).

---

## 6. Byte-identity proofs (G-2) — both required proofs GREEN

Full targeted re-run of the PHASE-51 citation scenarios (real LanceDB + mock embeddings), first-attempt clean,
`6 passed / 0 failed / 0 skipped`, 4154ms:

- **Already-citable claim UNTOUCHED — S356 (S-A) PASS unchanged.** A doc claim WITH a supporting REPUTABLE
  chunk is cited on the FIRST `kb.cite` (loop reaches `summary.cited++; continue;` at [231]) and NEVER enters
  `_attemptDiscovery`. Outcome identical to PHASE-51: CitationRecord emitted (synthesized_by=documentation),
  §8 PASS, advance to QUALITY_JUDGE. This is the "already-citable claims are untouched" confirmation.
- **Uncited-WITHOUT-discovery BYTE-IDENTICAL — S355 (S-E) PASS unchanged.** Hermetic (no key) → `kb.retrieve`
  fast-fails → `retrieve_failed` branch → discovery EXCLUDED → `documentation.json` bytes identical before/after
  (`bytesBefore === bytesAfter`), 0 cited. Confirms the retrieve_failed exclusion AND the non-mutation invariant.
- **Discovery-attempted-but-failed preserves fail-closed — S357 (S-B) PASS unchanged.** Empty store →
  `zero_chunks` → discovery NOW fires via the production `reg.invoke("research.search_web")` path; with no
  BRAVE/TAVILY keys the tool returns `BOTH_PROVIDERS_FAILED` **without any network call** ($0), so the claim
  stays uncited → §8 FAIL_UNCITED → build HALTS (advanced:false, DOCUMENTATION). Outcome identical to PHASE-51.
  (Note: S-B is technically "uncited despite discovery attempted", the new graceful-degrade path — outcome-preserving.)
- **Detector-coverage invariant holds — S358 (S-C) PASS.** `claims_detected === cited + uncited` (audit) still holds.
- **Cosine regression intact — S359 PASS.** A-2 fix unaffected.

---

## 7. Full SU suite — baseline UNCHANGED

`node bin/forge-test.js` → **352 passed / 0 failed / 5 skipped (357 total)**, exit 0, duration 488875ms,
first-attempt clean. Identical to the PHASE-51 closure baseline (352/0/5). D1+D2 is strictly additive:
the citation pass is UNCONDITIONAL (runs on every documentProject) yet no scenario changed outcome —
because discovery fires only on would-be-uncited claims and, hermetically (no keys), degrades to a no-op
that preserves the exact PHASE-51 cited/uncited verdicts.

---

## 8. Tool-shape reconciliation (from Step 0 §0.5, now built-in)

- `research.search_web` called with `{ query, project_id, max_results }` (project_id supplied — Step-0 note #1).
- `search_web` FAILED envelope OR SUCCESS-with-empty/no-usable-url both handled → claim stays uncited (Step-0 note #4).
- `kb.ingest_url` called with `{ url, project_id }` (+ `_client` threaded into ingestCtx for the real/hermetic
  embed path). In-run `ingestedUrls` guard is complementary to the tool's persistent DUPLICATE dedup (Step-0 note #3).
- `search_web`/`kb.ingest_url` are WORKSPACE_WRITE (cost_ledger/manifests via §ARC-4) — routed through the same
  permission policy that already authorizes `kb.cite`; no new §ARC (Step-0 note #5).

---

## 9. Honest notes / open items for CTO

- (a) **`_discovery.maxTotalSearches` seam extension** — flagged in §3. Test-only, off the body, absent in
  production. Awaiting CTO acceptance vs the >8-claim-fixture alternative.
- (b) The full-suite S-B/S-C now execute (failing) `research.search_web` calls hermetically. $0, no network
  (both provider keys absent → the tool returns before any `http.get`/`http.post`). Confirmed by the unchanged
  count + zero cost. Same policy-dependence class as the PHASE-51 hermeticity note (no key in the SU harness env).
- (c) D3 (S360–S363) and D4 (real Gate #10) NOT started. D4 stays a HARD STOP pending a separate owner "yes" + estimate.

## STOP

D1 + D2 complete and gate-proven (full suite 352/0/5 unchanged, 6/6 citation scenarios green, Track A clean on
added lines, §ARC=10, $0, both byte-identity proofs GREEN). Awaiting CTO independent verification on a FRESH
LOCAL zip before **Step 2 GO** (D3). Do NOT proceed to D3 until the CTO says "Step 2 GO". Do NOT run D4.
