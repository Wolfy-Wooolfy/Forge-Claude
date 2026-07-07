# PHASE-51 — Mid-Checkpoint: stage_kb_cite_mid (after W-1, per PROMPT-STAGE-51 §1/§3)

- Date: 2026-07-07
- Phase: PHASE-51 (kb.cite — Documentation-Time Citation Generation)
- Decision: DECISION-2026-07-07-phase-51-kb-cite.md (§7 §ARC text CTO-corrected)
- Cost so far: **$0** (mock/hermetic only; zero real provider calls; no API key in harness env)
- §ARC: frozen at 10 (no new exception, no new write path) · L2 tools: 80 · roles: 13

---

## 1. State — W-0 + W-1 DONE (both LOCAL commits only)

| Item | Commit | Content |
|---|---|---|
| W-0 | `c069529` | decision artifact (Appendix A verbatim; §7 replaced with CTO-verified §ARC-4 writer text) + status.json flip (current_task → PHASE-51-KB-CITE-IN-PROGRESS; next_phase unchanged) |
| W-1 | `6042834` | documentation-time citation pass in documentProject + `runDocumentationCitationPass` (exported) + S354 (S-D) + S355 (S-E) |

Inherited base: `56ff128` (== origin, == tag phase-50-complete). No push, no tag. Tree
clean before each stage (no owner "U" churn intervened).

## 2. Design as built (matches Appendix A §3 + C-1/C-2/C-3)

Post-generation citation pass (deterministic sidecar, NOT RAG). Placement in
`conversationEngine.documentProject`: **after** documentation.json is persisted
(fs.write_file), **before** the §8 audit (kb.validate_citations). New module-scope
`runDocumentationCitationPass(reg, projectId, artifactRelPath, content, root)`:

1. **C-1 (parity):** documentProject reads BACK the persisted documentation.json via
   `reg.invoke("fs.read_file", …)` → passes the IDENTICAL `content` string the §8 audit
   reads. Claims are enumerated by the SAME detector the audit uses —
   `validateCitations(content, new Set()).uncited_claims` = every claim line `{line,text}`.
   `claim_location.line_range = [line, line]` uses the reported 1-indexed line verbatim and
   `artifact_path` = the same `orchRelDir + "/documentation.json"`. The pass NEVER
   re-serializes / rewrites documentation.json — it reads the doc + writes citations.jsonl only.
2. **Per claim:** `reg.invoke("kb.retrieve", { query, project_id, credibility_floor:"COMMUNITY" })`
   → if envelope SUCCESS with ≥1 chunk, `reg.invoke("kb.cite", { claim_text, claim_location,
   chunks, synthesized_by:"documentation", project_id })`.
3. **C-2 (no fabrication):** "cited vs uncited" is decided from the **kb.cite RESULT**
   (record emitted = SUCCESS vs skip/BLOCKED), NOT from the retrieve chunk count. A claim
   whose only chunks are LOW-credibility → synthesizeCitation SKIPS → claim stays uncited.
4. **Fail-closed at the gate:** any claim left uncited (no evidence, retrieve unavailable,
   or credibility-skip) → the existing §8 audit returns FAIL_UNCITED → documentProject
   returns `advanced:false, doc_error:UNCITED_CLAIMS` (per-build override outlet unchanged).
   The pass is best-effort generation; §8 is the enforcement gate.

Forensics: a `citation_pass` summary `{claims_detected, cited, uncited, retrieve_failed,
zero_chunks, cite_blocked}` is attached to both the UNCITED-block and success payloads
(additive; strengthens Gate #10 durable evidence alongside citations.jsonl + §8 verdict).

## 3. Track A — CLEAN on every added line

- `code/src/ai_os/conversationEngine.js` (+109 / −3): all HTTP/embedding/fs go through
  `reg.invoke("kb.retrieve" / "kb.cite" / "fs.read_file")`; claim enumeration via the pure
  `validateCitations` import. `git diff | grep '^+'` for `ARC-` / `fs.*Sync` / `new OpenAI` /
  `child_process` / `fetch(` → **0 forbidden additions**. (The only fs.*Sync hits in the file,
  lines 132 + 835, are PRE-EXISTING readJsonSafe / vision-path reads, untouched.)
- `code/src/testing/helpers/citation_pass_test_helper.js` (NEW, test infra): fs used only for
  fixture setup + byte assertions (documented §ARC-exempt test convention).
- No new dependency, no `new OpenAI()`, no direct fetch/child_process.

## 4. §ARC — 10, unchanged

citations.jsonl is written by `manifests.appendCitation → _appendAtomic(_citationsPath)`
= `artifacts/projects/<id>/kb/exports/citations.jsonl`, the EXISTING **§ARC-4**-bounded
writer, reached ONLY via the `kb.cite` L2 tool. PHASE-51 adds NO new write path and NO
new §ARC reference (verified in the diff). (Note: an inline code-vs-ledger drift grep
returns {1,3,4,5,6,8,9,10,11} — pre-existing, a documented backlog item; the canonical
ledger count is 10 and PHASE-51 added nothing to it.)

## 5. Gate evidence (this stage)

- New scenarios: **S354 (S-D)** — kb.cite emits a §5-conformant CitationRecord: `id ===
  citId(claim_text, sorted chunk_ids)` [C-3, real formula incl. `\x00` + `|` join],
  `id` matches `^cit_[a-f0-9]{12}$`, supporting_chunks non-empty, excerpt ≤200 (proven with
  a 250-char chunk), synthesized_by ∈ {documentation,architect,research}, line_range emitted
  verbatim, confidence ∈ {HIGH,MEDIUM,LOW}; **+ C-2 sibling** — all-LOW chunks → kb.cite
  BLOCKED, NO record appended (no fabrication). **S355 (S-E)** — pass over a claim-bearing
  documentation.json: detects ≥1 claim, writes citations.jsonl only, leaves the doc
  **byte-identical** (bytesBefore === bytesAfter); hermetic (no key) → 0 cited.
- Regression proof: the pass is UNCONDITIONAL (runs on every documentProject). Existing
  claim-free happy paths **S302 / S305** still advance (0 claims → 0 retrieve). The
  claim-bearing **S352** still BLOCKS (claims → retrieve fast-fails hermetically →
  uncited → §8 FAIL_UNCITED), override leg still advances. `judge_quality` seeds
  QUALITY_JUDGE via `advance_state` (does NOT call documentProject) — unaffected.
- **Full SU suite (Windows, this machine): 348 pass / 0 fail / 5 skip (353 total)**,
  first-attempt clean, exit 0, duration 446541ms. (346 → 348: S354 + S355.)
- No API key present in the harness env (`OPENAI_API_KEY` unset) → hermetic $0, and
  `getClient()` throws synchronously → kb.retrieve fast-fails (no network, no cost, no hang).

## 6. Integration point (exact)

`code/src/ai_os/conversationEngine.js` · `documentProject(body)`:
persist documentation.json → **[PHASE-51 pass: read-back + `runDocumentationCitationPass`]**
→ §8 audit (kb.validate_citations) → override / FAIL_UNCITED block → advance QUALITY_JUDGE.

## 7. Open risks / honest notes

- (a) **Hermeticity depends on no `OPENAI_API_KEY` in the SU harness env** (keychain-only
  policy; the key is hydrated only by start-api.js, not bin/forge-test.js). Confirmed unset
  on this run. If a real key were ever exported into a suite shell, S352's pass would make
  real embedding calls — same class as the pre-existing S134 dependency (documented PHASE-50
  F-2). Not introduced by this phase; mitigated by policy.
- (b) The pass treats a kb.retrieve infra failure as "leave uncited" (best-effort), NOT a
  hard throw — deliberately, so the §8 audit remains the single fail-closed gate and S352's
  UNCITED_CLAIMS semantics are preserved. This is fail-closed at the SYSTEM level (build
  halts), distinct from the PHASE-50 G-6 research_role case which was fail-OPEN (emitted
  findings). CTO ruling C-2 sanctions "leave uncited → §8 blocks".
- (c) `credibility_floor:"COMMUNITY"` chosen for retrieve so any non-LOW chunk is eligible
  (matches synthesizeCitation's LOW filter); LOW-only support correctly yields no citation.
- (d) Real-path (retrieve→cite→§8 PASS→advance) is NOT provable in a hermetic SU run — that
  is exactly W-2 (S-A/S-B/S-C, real kb.retrieve on Windows) + W-3 Gate #10 (owner real E2E).

## 8. W-2 preconditions (recorded, for after mid-GO)

- S-A cited path / S-B uncited fail-closed (+ credibility-skip end-to-end per C-2) /
  S-C detector-coverage invariant — all retrieval-coupled → run on Windows (lancedb present).
  Will FAIL in the CTO sandbox (no lancedb) — env limit, not a regression.
- Full suite re-run on Windows; report exact count.
- W-3 Gate #10 = HARD STOP: no real/paid call until a separate explicit owner "أيوه" with
  the cost estimate shown first (standing delegation does NOT cover real spend).

## STOP

W-0 + W-1 complete and gate-proven (SU 348/0/5, Track A clean on added lines, §ARC=10, $0).
Awaiting CTO independent verification on a FRESH LOCAL zip before W-2 GO.

---

# W-2 ADDENDUM — 2026-07-07 (after CTO mid-GO; retrieval-coupled scenarios + full suite)

CTO mid-verification PASSED (fresh zip, sha256-authentic to `9cffb0c`); W-2 GO with Option-1
seam ruling + guardrails G-1/G-2/G-3.

## W-2.1 — Hermeticity seam (Amendment A-1, CTO-ratified)
`opts._client` threading (mock embed client) through `runDocumentationCitationPass` →
`kb.retrieve` ctx, injected at ENGINE CONSTRUCTION (`createConversationEngine(options._client)`),
NOT the HTTP body (G-1: documentProject IS HTTP-exposed via POST /api/ai-os/project/document-project).
Additive-optional (G-2): seam-absent ctx is exactly `{ root }`, byte-identical to the
mid-verified path — proven by the diff. Amendment A-1 appended to the decision artifact (G-3).

## W-2.2 — Scenarios S-A / S-B / S-C (S356 / S357 / S358), retrieval-coupled, real LanceDB
- Fixture (hermetic, $0): fixed unit embedding vector (query ≡ chunk → LanceDB distance 0 →
  relevance ≈ 1.0). S-A seeds a REPUTABLE SourceRecord + one chunk into REAL LanceDB
  (`storage_lance.openStore`/`insertChunks`). Reuses the existing `mock-doc-s352` claim-bearing
  doc (no new `mock_responses` entry) + the exported `_seedLoopAtDocumentation` seed.
- **S-A (S356) cited path — the load-bearing full-path proof:** REPUTABLE chunk present →
  every claim retrieves it → all cited → `citation_audit.status==="PASS"` → `advanced===true`,
  `advanced_to==="QUALITY_JUDGE"`, ≥1 record in citations.jsonl (synthesized_by=documentation),
  graph state QUALITY_JUDGE. This is the real retrieve → cite → §8 PASS → advance chain,
  hermetic on Windows.
- **S-B (S357) uncited fail-closed:** empty LanceDB store → retrieve `[]` → no cite →
  `FAIL_UNCITED` → `advanced:false`, `doc_error:"UNCITED_CLAIMS"`, no citations written,
  state stays DOCUMENTATION (end-to-end complement to S-D leg 2).
- **S-C (S358) detector-coverage invariant:** `citation_pass.claims_detected ===
  citation_audit.cited_claims_count + citation_audit.uncited_claims_count` (the set the pass
  attempts == the set §8 flags; C-1 made explicit).
- These three need LanceDB → GREEN on Windows, env-fail in the CTO sandbox (no lancedb) —
  expected per the prompt.

## W-2.3 — Gates
- **Full SU suite (Windows): 351 pass / 0 fail / 5 skip (356 total)**, exit 0, duration 262423ms.
  (348 → 351: S356 + S357 + S358.) Matches the closure-gate target exactly.
- Regression: S352 still BLOCKS (no seam client → retrieve fast-fails → uncited → §8 FAIL);
  S302/S305 still advance (claim-free). Full-suite reproduced GREEN.
- Track A: the seam diff (`git diff 6042834 -- conversationEngine.js | grep '^+'`) has ZERO
  forbidden additions; helper is test infra (0 new OpenAI/child_process/fetch).
- §ARC = 10 unchanged. Cost = $0 (mock embeddings; no API key in harness env).

## W-2 commits (LOCAL only)
| Item | Commit | Content |
|---|---|---|
| W-2 | (this) | A-1 seam + S-A/S-B/S-C (S356/357/358) + `_seedLoopAtDocumentation` export + amendment + this addendum |

## STOP → W-3 readiness (HARD STOP — no spend)
W-3 Gate #10 requires a real build whose project KB is ingested with sources supporting its
claims. NO real/paid call will be made until a SEPARATE explicit owner "أيوه" with the cost
estimate shown first. Reporting Gate #10 readiness + estimate next.
