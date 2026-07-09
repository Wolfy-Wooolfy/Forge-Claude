"use strict";

// PHASE-51 (W-1) helpers — documentation-time citation generation.
//
// S-D (runSDCitationRecordSchema): sandbox-runnable, NO kb.retrieve. Drives kb.cite
//   directly with canned chunks and asserts the EMITTED CitationRecord conforms to §5
//   of docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md:
//     - id === citId(claim_text, chunk_ids)  [C-3: the REAL formula — sha256(claim_text
//       + "\x00" + sorted(chunk_ids).join("|")).slice(0,12), prefixed "cit_"]
//     - supporting_chunks non-empty; excerpt ≤200 chars (proven with a >200-char chunk)
//     - synthesized_by ∈ {documentation,architect,research} (== "documentation" here)
//     - claim_location.line_range emitted verbatim; confidence ∈ {HIGH,MEDIUM,LOW}
//   Sibling leg (C-2): canned ALL-LOW chunks → kb.cite SKIPS (no record) → the claim
//   would stay uncited. Proves no-fabrication on the credibility-skip path.
//
// S-E (runSENonMutation): sandbox-runnable, NO kb.retrieve success. Calls the exported
//   citation pass directly over a claim-bearing documentation.json and asserts the file
//   bytes are IDENTICAL before and after (the pass reads the doc + writes citations.jsonl
//   only; it never rewrites documentation.json). Hermetic: kb.retrieve fast-fails without
//   an API key (getClient throws) → 0 citations, byte-identical doc.
//
// Track A note (test infrastructure): fs.mkdirSync / fs.writeFileSync / fs.rmSync /
// fs.existsSync / fs.readFileSync are used here only for fixture setup + byte assertions,
// not in production code.

const fs   = require("fs");
const path = require("path");

const ROOT          = process.cwd();
const PROJECTS_ROOT = path.resolve(ROOT, "artifacts", "projects");

const { citId }              = require("../../runtime/kb/_id_minting");
const manifests              = require("../../runtime/kb/manifests");
const { getDefaultRegistry } = require("../../runtime/tools/_registry");

// storage_lance pulls in @lancedb/lancedb at load — lazy-require it INSIDE the S-A/B/C
// methods only, so S-D/S-E (which need no vector store) stay lancedb-independent and load
// in a lancedb-less env (W-2.1).
function _lanceStore() { return require("../../runtime/kb/storage_lance"); }
const { runDocumentationCitationPass, createConversationEngine } =
  require("../../ai_os/conversationEngine");
// Reuse the DOCUMENTATION loop seed + state read from the PHASE-32 helper (test infra).
const {
  _seedLoopAtDocumentation,
  _currentState,
  _ensureProjectDir,
  _writeState
} = require("./document_project_test_helper");

// Fixed unit embedding vector: every input embeds identically → query ≡ chunk →
// LanceDB distance 0 → relevance ≈ 1.0. Deterministic, zero network, zero cost.
function _fixedVector() {
  const v = new Array(512).fill(0);
  v[0] = 1;
  return v;
}
function _mockEmbedClient() {
  return { embeddings: { create: async () => ({
    data: [{ embedding: _fixedVector() }], usage: { total_tokens: 5 }
  }) } };
}

function _cleanup(projectId) {
  try {
    const d = path.join(PROJECTS_ROOT, projectId);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  } catch (_) {}
}

// ── S-D — CitationRecord schema validity (+ C-2 credibility-skip sibling) ──────

async function runSDCitationRecordSchema() {
  const PID = "sd_citation_record";
  _cleanup(PID);

  try {
    const reg = getDefaultRegistry();

    // Leg 1 — canned NON-LOW chunk (chunk text >200 chars to exercise the excerpt cap).
    const claimText   = "The API server provides token-based authentication for every request.";
    const artifactRel = "artifacts/projects/" + PID + "/orchestration/loop_sd/documentation.json";
    const chunkText   = "X".repeat(250);
    const chunk       = {
      chunk_id:         "chk_8a148165_0",
      source_id:        "src_8a148165135d",
      text:             chunkText,
      relevance_score:  0.87,
      credibility_tier: "REPUTABLE"
    };

    const citeEnv = await reg.invoke("kb.cite", {
      claim_text:     claimText,
      claim_location: { artifact_path: artifactRel, line_range: [12, 12] },
      chunks:         [chunk],
      synthesized_by: "documentation",
      project_id:     PID
    }, { root: ROOT });

    const cite_ok = !!(citeEnv && citeEnv.status === "SUCCESS" &&
                       citeEnv.output && typeof citeEnv.output.cit_id === "string");

    // Read the persisted record back from citations.jsonl (the exports writer path).
    const records = manifests.readCitations(PID, "project", { root: ROOT });
    const rec     = records.find(r => r.claim_text === claimText) || null;

    const expectedId = citId(claimText, [chunk.chunk_id]);   // C-3: real formula

    const schema_version_ok          = !!rec && rec.schema_version === "1.0.0";
    const id_matches_citid           = !!rec && rec.id === expectedId;
    const id_pattern_ok              = !!rec && /^cit_[a-f0-9]{12}$/.test(rec.id);
    const supporting_chunks_nonempty = !!rec && Array.isArray(rec.supporting_chunks) &&
                                       rec.supporting_chunks.length >= 1;
    const excerpt_within_200         = !!rec && Array.isArray(rec.supporting_chunks) &&
                                       rec.supporting_chunks.every(sc =>
                                         typeof sc.excerpt === "string" && sc.excerpt.length <= 200);
    const synthesized_by_documentation = !!rec && rec.synthesized_by === "documentation";
    const synthesized_by_in_enum       = !!rec &&
                                       ["documentation", "architect", "research"].includes(rec.synthesized_by);
    const line_range_verbatim        = !!rec && rec.claim_location &&
                                       Array.isArray(rec.claim_location.line_range) &&
                                       rec.claim_location.line_range[0] === 12 &&
                                       rec.claim_location.line_range[1] === 12;
    const artifact_path_ok           = !!rec && rec.claim_location &&
                                       rec.claim_location.artifact_path === artifactRel;
    const confidence_valid           = !!rec && ["HIGH", "MEDIUM", "LOW"].includes(rec.confidence);

    // Leg 2 (C-2 sibling) — ALL-LOW chunks → kb.cite SKIPS, no record, no fabrication.
    const lowClaim = "The database layer requires an index on the created_at column for reads.";
    const lowCiteEnv = await reg.invoke("kb.cite", {
      claim_text:     lowClaim,
      claim_location: { artifact_path: artifactRel, line_range: [20, 20] },
      chunks:         [{
        chunk_id:         "chk_8a148165_1",
        source_id:        "src_8a148165135d",
        text:             "some weakly-sourced passage",
        relevance_score:  0.9,
        credibility_tier: "LOW"
      }],
      synthesized_by: "documentation",
      project_id:     PID
    }, { root: ROOT });

    const low_cred_blocked = !!(lowCiteEnv && lowCiteEnv.status !== "SUCCESS");
    const recordsAfterLow  = manifests.readCitations(PID, "project", { root: ROOT });
    const low_cred_no_record = !recordsAfterLow.some(r => r.claim_text === lowClaim);

    return {
      cite_ok,
      schema_version_ok, id_matches_citid, id_pattern_ok,
      supporting_chunks_nonempty, excerpt_within_200,
      synthesized_by_documentation, synthesized_by_in_enum,
      line_range_verbatim, artifact_path_ok, confidence_valid,
      low_cred_blocked, low_cred_no_record
    };
  } finally {
    _cleanup(PID);
  }
}

// ── S-E — Non-mutation / determinism of the citation pass ──────────────────────

async function runSENonMutation() {
  const PID     = "se_non_mutation";
  const LOOP_ID = "loop_se";
  _cleanup(PID);

  try {
    const reg     = getDefaultRegistry();
    const orchDir = path.join(PROJECTS_ROOT, PID, "orchestration", LOOP_ID);
    fs.mkdirSync(orchDir, { recursive: true });

    // A claim-bearing documentation.json (Pattern-1: "must persist ...", "provides ...").
    const docObject = {
      overview: "The API server must persist all session tokens in encrypted storage.",
      summary:  "A REST API that provides token-based authentication and stores audit logs.",
      sections: ["auth", "storage"]
    };
    const docPath   = path.join(orchDir, "documentation.json");
    const docRelPath = "artifacts/projects/" + PID + "/orchestration/" + LOOP_ID + "/documentation.json";
    fs.writeFileSync(docPath, JSON.stringify(docObject, null, 2), "utf8");

    const bytesBefore = fs.readFileSync(docPath, "utf8");

    // Run the pass over the IDENTICAL bytes the §8 audit would read (C-1). Hermetic:
    // kb.retrieve fast-fails without an API key → 0 citations, doc untouched.
    const summary = await runDocumentationCitationPass(
      reg, PID, docRelPath, bytesBefore, ROOT);

    const bytesAfter = fs.readFileSync(docPath, "utf8");

    const claims_detected_ge_1 = !!summary && summary.claims_detected >= 1;
    const cited_zero_hermetic  = !!summary && summary.cited === 0;
    const bytes_identical      = bytesBefore === bytesAfter;
    const doc_still_exists      = fs.existsSync(docPath);

    return { claims_detected_ge_1, cited_zero_hermetic, bytes_identical, doc_still_exists };
  } finally {
    _cleanup(PID);
  }
}

// ── S-A — cited path (retrieval-coupled; real LanceDB, mock embeddings) ────────
// A REPUTABLE source + one chunk seeded into real LanceDB; the fixed-vector mock makes
// every claim retrieve that chunk → all cited → §8 PASS → advance to QUALITY_JUDGE.

async function runSACitedPath() {
  const PID     = "sa_cited_path";
  const LOOP_ID = "loop_sa";
  _cleanup(PID);
  const projectDir = _ensureProjectDir(PID);
  const storage    = _lanceStore();
  let store = null;
  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S-A Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });
    await _seedLoopAtDocumentation(PID, LOOP_ID, {});

    // Seed a REPUTABLE source + one chunk (identical fixed vector) into real LanceDB.
    const srcId = "src_8a148165135d";
    manifests.appendSource({
      schema_version: "1.0.0", id: srcId, url: "https://example.com/fixture",
      title: "S-A Fixture Source", fetched_at: "2026-07-07T00:00:00.000Z",
      content_type: "text/html", raw_byte_size: 512, extracted_text_size: 80, language: "en",
      credibility: { score: 0.72, tier: "REPUTABLE", signals: ["https"],
        scored_by: "heuristic_v1", scored_at: "2026-07-07T00:00:00.000Z" },
      scope: "project", project_id: PID, ingestion_decision: null
    }, PID, "project", { root: ROOT });

    store = await storage.openStore(PID, "project", { root: ROOT });
    await storage.insertChunks(store, [{
      id: "chk_8a148165_0", source_id: srcId, ordinal: 0,
      text: "The service persists tasks across restarts using durable storage.",
      char_start: 0, char_end: 64, overlap_with_prev: 0,
      embedding: _fixedVector(), embedding_model: "text-embedding-3-small@512",
      section_heading: null, metadata: { chunk_strategy: "fixed_v1", page: null }
    }]);

    const engine = createConversationEngine({ root: ROOT, _client: _mockEmbedClient() });
    const result = await engine.documentProject({
      project_id: PID, loop_id: LOOP_ID,
      doc_provider: "mock", doc_model: "mock-doc-s352", doc_scenario_id: "S352"
    });

    const records = manifests.readCitations(PID, "project", { root: ROOT });

    const audit_pass          = !!(result.citation_audit && result.citation_audit.status === "PASS");
    const advanced_true       = result.advanced === true;
    const advanced_to_qj      = result.advanced_to === "QUALITY_JUDGE";
    const citation_pass_cited = !!(result.citation_pass && result.citation_pass.cited >= 1);
    const citations_written   = records.length >= 1;
    const record_role_documentation = records.length >= 1 &&
                                       records.every(r => r.synthesized_by === "documentation");
    const state_quality_judge = (await _currentState(PID, LOOP_ID)) === "QUALITY_JUDGE";

    return {
      audit_pass, advanced_true, advanced_to_qj, citation_pass_cited,
      citations_written, record_role_documentation, state_quality_judge
    };
  } finally {
    try { await storage.closeAll(); } catch (_) {}
    _cleanup(PID);
  }
}

// ── S-B — uncited fail-closed (retrieval-coupled; empty LanceDB store) ─────────
// No chunk ingested → mock embed succeeds, LanceDB search returns [] → no cite →
// §8 FAIL_UNCITED → build HALTS. End-to-end complement to S-D leg 2.

async function runSBUncitedFailClosed() {
  const PID     = "sb_uncited_failclosed";
  const LOOP_ID = "loop_sb";
  _cleanup(PID);
  const projectDir = _ensureProjectDir(PID);
  const storage    = _lanceStore();
  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S-B Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });
    await _seedLoopAtDocumentation(PID, LOOP_ID, {});
    // No source, no chunk → the active project KB is empty.

    const engine = createConversationEngine({ root: ROOT, _client: _mockEmbedClient() });
    const result = await engine.documentProject({
      project_id: PID, loop_id: LOOP_ID,
      doc_provider: "mock", doc_model: "mock-doc-s352", doc_scenario_id: "S352"
    });

    const audit_fail_uncited  = !!(result.citation_audit && result.citation_audit.status === "FAIL_UNCITED");
    const advanced_false      = result.advanced !== true;
    const doc_error_uncited   = result.doc_error === "UNCITED_CLAIMS";
    const citation_pass_zero  = !!(result.citation_pass && result.citation_pass.cited === 0);
    const claims_detected     = !!(result.citation_pass && result.citation_pass.claims_detected >= 1);
    const no_citations_written = manifests.readCitations(PID, "project", { root: ROOT }).length === 0;
    const state_documentation = (await _currentState(PID, LOOP_ID)) === "DOCUMENTATION";

    return {
      audit_fail_uncited, advanced_false, doc_error_uncited,
      citation_pass_zero, claims_detected, no_citations_written, state_documentation
    };
  } finally {
    try { await storage.closeAll(); } catch (_) {}
    _cleanup(PID);
  }
}

// ── S-C — detector-coverage invariant (pass attempts == audit flags) ──────────
// The set of claims the pass enumerates == the set §7.1 flags for the §8 audit
// (guaranteed by C-1; made explicit here). Empty store → all uncited → the equality
// claims_detected === cited_claims_count + uncited_claims_count must hold.

async function runSCDetectorCoverage() {
  const PID     = "sc_detector_coverage";
  const LOOP_ID = "loop_sc";
  _cleanup(PID);
  const projectDir = _ensureProjectDir(PID);
  const storage    = _lanceStore();
  try {
    _writeState(projectDir, {
      project_id: PID, project_name: "S-C Test",
      active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
      loop_id: LOOP_ID, last_updated_at: new Date().toISOString()
    });
    await _seedLoopAtDocumentation(PID, LOOP_ID, {});

    const engine = createConversationEngine({ root: ROOT, _client: _mockEmbedClient() });
    const result = await engine.documentProject({
      project_id: PID, loop_id: LOOP_ID,
      doc_provider: "mock", doc_model: "mock-doc-s352", doc_scenario_id: "S352"
    });

    const cp = result.citation_pass || {};
    const ca = result.citation_audit || {};
    const passAttempted = typeof cp.claims_detected === "number" ? cp.claims_detected : -1;
    const auditTotal =
      (typeof ca.cited_claims_count === "number" ? ca.cited_claims_count : 0) +
      (typeof ca.uncited_claims_count === "number" ? ca.uncited_claims_count : 0);

    const both_present    = !!result.citation_pass && !!result.citation_audit;
    const invariant_holds = passAttempted >= 1 && passAttempted === auditTotal;

    return { both_present, invariant_holds };
  } finally {
    try { await storage.closeAll(); } catch (_) {}
    _cleanup(PID);
  }
}

// ── S359 — cosine relevance regression (PHASE-51 A-2; the test that CATCHES the bug) ──
// Non-identical query vs chunk (cosine 1/sqrt2 = 0.7071) through REAL LanceDB _toResult.
// Under the OLD squared-L2 formula this surfaced 0.414 (and 0.000 for any cos<0.5); under
// the cosine-metric fix it surfaces ~0.7071 → confidence MEDIUM. S356 uses IDENTICAL
// vectors (distance 0) so it can never exercise this range — which is exactly why the bug
// slipped through. The query embeds to [1,0,..] via the mock; the chunk is seeded with
// normalize([1,1,0,..]) directly into LanceDB.

async function runS359CosineRelevance() {
  const PID = "s359_cosine_relevance";
  _cleanup(PID);
  _ensureProjectDir(PID);
  const storage = _lanceStore();
  const reg     = getDefaultRegistry();

  try {
    const srcId = "src_8a148165135d";
    manifests.appendSource({
      schema_version: "1.0.0", id: srcId, url: "https://example.com/fixture-s359",
      title: "S-359 Fixture", fetched_at: "2026-07-07T00:00:00.000Z",
      content_type: "text/html", raw_byte_size: 512, extracted_text_size: 80, language: "en",
      credibility: { score: 0.72, tier: "REPUTABLE", signals: ["https"],
        scored_by: "heuristic_v1", scored_at: "2026-07-07T00:00:00.000Z" },
      scope: "project", project_id: PID, ingestion_decision: null
    }, PID, "project", { root: ROOT });

    // chunk vector = normalize([1,1,0,...]) → cosine vs query [1,0,...] = 1/sqrt2 = 0.7071
    const cv = new Array(512).fill(0); cv[0] = 1; cv[1] = 1;
    const nrm = Math.sqrt(2);
    const chunkVec = cv.map(x => x / nrm);

    const store = await storage.openStore(PID, "project", { root: ROOT });
    await storage.insertChunks(store, [{
      id: "chk_8a148165_0", source_id: srcId, ordinal: 0,
      text: "The service persists tasks across restarts using durable storage.",
      char_start: 0, char_end: 64, overlap_with_prev: 0,
      embedding: chunkVec, embedding_model: "text-embedding-3-small@512",
      section_heading: null, metadata: { chunk_strategy: "fixed_v1", page: null }
    }]);

    // retrieve with query vector [1,0,...] (mock embed) → cosine 0.7071 via real _toResult
    const rEnv = await reg.invoke("kb.retrieve", {
      query: "tasks persistence across restarts", project_id: PID, credibility_floor: "COMMUNITY"
    }, { root: ROOT, _client: _mockEmbedClient() });
    const results  = (rEnv && rEnv.output && rEnv.output.results) || [];
    const top      = results[0] || {};
    const observed = typeof top.relevance_score === "number" ? top.relevance_score : -1;

    const retrieved          = results.length >= 1;
    const relevance_in_range = observed >= 0.700 && observed <= 0.715;   // ≈ 0.7071
    const relevance_not_zero = observed > 0.1;                            // guards old buggy 0.000

    // cite → the corrected 0.7071 must flow to confidence MEDIUM (0.60 ≤ 0.7071 < 0.80)
    const cEnv = await reg.invoke("kb.cite", {
      claim_text:     "The service persists tasks across restarts using durable storage.",
      claim_location: { artifact_path: "artifacts/projects/" + PID + "/orchestration/l/documentation.json", line_range: [3, 3] },
      chunks:         results,
      synthesized_by: "documentation",
      project_id:     PID
    }, { root: ROOT });
    const cite_ok = !!(cEnv && cEnv.status === "SUCCESS");
    const recs = manifests.readCitations(PID, "project", { root: ROOT });
    const rec  = recs[0] || null;
    const confidence_medium = !!rec && rec.confidence === "MEDIUM";

    return { retrieved, relevance_in_range, relevance_not_zero, cite_ok, confidence_medium };
  } finally {
    try { await storage.closeAll(); } catch (_) {}
    _cleanup(PID);
  }
}

// ── PHASE-52 D3 — auto web-discovery scenarios (S360–S363) ─────────────────────
//
// These exercise the discovery loop wired into runDocumentationCitationPass via the
// OPTIONAL `_discovery = { search, ingest }` seam (the A-1 `_client` analog). The mock
// search returns canned result URLs (no network); the mock ingest SEEDS a chunk into the
// SAME real LanceDB store the pass re-retrieves from (in-process cached store — a mid-pass
// insert is visible to the next kb.retrieve). retrieve + cite stay REAL. $0 (no keys).
//
// Mechanics ruling (CTO erratum #3): kb.retrieve's COMMUNITY floor filters LOW-credibility
// chunks BEFORE kb.cite, and kb.cite skips only on all-LOW — disjoint sets. So on the real
// path discovery triggers only on zero_chunks, and a LOW ingested source manifests as
// "re-retrieve returns empty" (not cite-rejection). S361 proves the no-fabrication guarantee
// via that reachable mechanism.

// Spy-able mock `_discovery` seam. opts:
//   searchMode: "url" (default) | "empty" | "failed"
//   url:        result URL (default a fixed example.com URL; same url across calls → dedup)
//   ingestTier: "REPUTABLE" (default, lift) | "LOW" (filtered by retrieve → stays uncited)
//   maxTotalSearches: optional per-run cap override (test-only)
function _mockDiscovery(opts) {
  const o     = opts || {};
  const url   = o.url || "https://example.com/discovered-source";
  const state = { searchQueries: [], ingestUrls: [] };

  const disc = {
    async search(input) {
      state.searchQueries.push(input.query);
      if (o.searchMode === "empty")  return { status: "SUCCESS", output: { results: [] } };
      if (o.searchMode === "failed") return { status: "FAILED",  metadata: { reason: "BOTH_PROVIDERS_FAILED" } };
      // A-1: results carry `content` (Tavily raw_content) — the discovery loop ingests it
      // directly via kb.ingest_content (no fetch). Empty content → the loop skips the ingest.
      return { status: "SUCCESS", output: { results: [
        { url, title: "Discovered Source", snippet: "supporting passage",
          content: "Discovered supporting passage for the claim under documentation." }
      ] } };
    },
    async ingest(input, ctx) {
      state.ingestUrls.push(input.url);
      const pid  = input.project_id;
      const root = (ctx && ctx.root) || ROOT;
      const tier = o.ingestTier || "REPUTABLE";
      const n    = state.ingestUrls.length;
      // §5 schema-valid IDs: src_[a-f0-9]{12}, chk_[a-f0-9]{8}_N.
      const srcId = "src_" + n.toString(16).padStart(12, "0");
      const chkId = "chk_" + n.toString(16).padStart(8, "0") + "_0";
      manifests.appendSource({
        schema_version: "1.0.0", id: srcId, url: input.url,
        title: "Discovered " + n, fetched_at: "2026-07-08T00:00:00.000Z",
        content_type: "text/html", raw_byte_size: 256, extracted_text_size: 64, language: "en",
        credibility: { score: tier === "LOW" ? 0.2 : 0.72, tier, signals: ["https"],
          scored_by: "heuristic_v1", scored_at: "2026-07-08T00:00:00.000Z" },
        scope: "project", project_id: pid, ingestion_decision: null
      }, pid, "project", { root });
      const store = await _lanceStore().openStore(pid, "project", { root });
      await _lanceStore().insertChunks(store, [{
        id: chkId, source_id: srcId, ordinal: 0,
        text: "Discovered supporting passage for the claim under documentation.",
        char_start: 0, char_end: 60, overlap_with_prev: 0,
        embedding: _fixedVector(), embedding_model: "text-embedding-3-small@512",
        section_heading: null, metadata: { chunk_strategy: "fixed_v1", page: null }
      }]);
      return { status: "SUCCESS", output: { status: "OK", src_id: srcId, chunks_created: 1, deduped: false } };
    }
  };
  if (Number.isInteger(o.maxTotalSearches)) disc.maxTotalSearches = o.maxTotalSearches;
  return { disc, state };
}

// Drive documentProject at DOCUMENTATION over the claim-bearing mock-doc-s352 with an
// injected _discovery seam, from an EMPTY LanceDB store. Returns { result, state }.
async function _runDocumentProjectWithDiscovery(pid, loopId, disc, preSeedTier) {
  const projectDir = _ensureProjectDir(pid);
  _writeState(projectDir, {
    project_id: pid, project_name: "S-disc",
    active_runtime_state: "IDEATION", conversation_mode: "PIPELINE",
    loop_id: loopId, last_updated_at: new Date().toISOString()
  });
  await _seedLoopAtDocumentation(pid, loopId, {});

  if (preSeedTier) {
    // Pre-seed a matching chunk so EVERY claim is citable from the base KB (no discovery).
    // §5 schema-valid IDs: src_[a-f0-9]{12}, chk_[a-f0-9]{8}_N.
    const srcId = "src_0000000000aa";
    manifests.appendSource({
      schema_version: "1.0.0", id: srcId, url: "https://example.com/preseed",
      title: "Preseed", fetched_at: "2026-07-08T00:00:00.000Z",
      content_type: "text/html", raw_byte_size: 256, extracted_text_size: 64, language: "en",
      credibility: { score: 0.72, tier: preSeedTier, signals: ["https"],
        scored_by: "heuristic_v1", scored_at: "2026-07-08T00:00:00.000Z" },
      scope: "project", project_id: pid, ingestion_decision: null
    }, pid, "project", { root: ROOT });
    const store = await _lanceStore().openStore(pid, "project", { root: ROOT });
    await _lanceStore().insertChunks(store, [{
      id: "chk_000000aa_0", source_id: srcId, ordinal: 0,
      text: "The service persists tasks across restarts using durable storage.",
      char_start: 0, char_end: 64, overlap_with_prev: 0,
      embedding: _fixedVector(), embedding_model: "text-embedding-3-small@512",
      section_heading: null, metadata: { chunk_strategy: "fixed_v1", page: null }
    }]);
  }

  const engine = createConversationEngine({ root: ROOT, _client: _mockEmbedClient(), _discovery: disc });
  const result = await engine.documentProject({
    project_id: pid, loop_id: loopId,
    doc_provider: "mock", doc_model: "mock-doc-s352", doc_scenario_id: "S352"
  });
  return result;
}

// ── S360 — discovery lifts a zero-chunk claim to CITED (+ additive-only proof) ──
async function runS360DiscoveryLift() {
  const storage = _lanceStore();

  // Sub-run 1 (additive-only): pre-seeded REPUTABLE chunk → all claims cited via the BASE
  // path → discovery is NEVER attempted (search spy has 0 calls).
  const PID1 = "s360_additive_no_search";
  _cleanup(PID1);
  let base_all_cited = false, base_no_search = false, base_advanced = false;
  const d1 = _mockDiscovery({});
  try {
    const r = await _runDocumentProjectWithDiscovery(PID1, "loop_s360a", d1.disc, "REPUTABLE");
    const cp = r.citation_pass || {};
    base_advanced   = r.advanced === true;
    base_all_cited  = cp.cited >= 1 && cp.zero_chunks === 0;
    base_no_search  = cp.discovery_searches === 0 && d1.state.searchQueries.length === 0;
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PID1); }

  // Sub-run 2 (lift): empty store → every claim zero_chunks → discovery search + ingest a
  // REPUTABLE source → re-retrieve → re-cite SUCCESS → CITED → §8 PASS → advance QUALITY_JUDGE.
  const PID2 = "s360_discovery_lift";
  _cleanup(PID2);
  let lift_advanced = false, lift_to_qj = false, lift_searched = false,
      lift_discovery_cited = false, lift_citations_written = false;
  const d2 = _mockDiscovery({ ingestTier: "REPUTABLE" });
  try {
    const r = await _runDocumentProjectWithDiscovery(PID2, "loop_s360b", d2.disc, null);
    const cp = r.citation_pass || {};
    lift_advanced          = r.advanced === true;
    lift_to_qj             = r.advanced_to === "QUALITY_JUDGE";
    lift_searched          = cp.discovery_searches >= 1 && d2.state.searchQueries.length >= 1;
    lift_discovery_cited   = cp.discovery_cited >= 1;
    lift_citations_written = manifests.readCitations(PID2, "project", { root: ROOT }).length >= 1;
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PID2); }

  return {
    base_advanced, base_all_cited, base_no_search,
    lift_advanced, lift_to_qj, lift_searched, lift_discovery_cited, lift_citations_written
  };
}

// ── S361 — discovery yields nothing / LOW-only → UNCITED (fail-closed, no fabrication) ──
async function runS361DiscoveryUncited() {
  const storage = _lanceStore();
  const reg     = getDefaultRegistry();

  // Leg A: empty store → zero_chunks → discovery search returns EMPTY → claim stays UNCITED →
  // §8 FAIL_UNCITED → build HALTS.
  const PIDA = "s361_search_empty";
  _cleanup(PIDA);
  let a_searched = false, a_uncited = false, a_no_citations = false, a_state_doc = false;
  const dA = _mockDiscovery({ searchMode: "empty" });
  try {
    const r = await _runDocumentProjectWithDiscovery(PIDA, "loop_s361a", dA.disc, null);
    const cp = r.citation_pass || {};
    a_searched     = cp.discovery_searches >= 1 && dA.state.searchQueries.length >= 1;
    a_uncited      = r.advanced !== true && r.doc_error === "UNCITED_CLAIMS" && cp.discovery_cited === 0;
    a_no_citations = manifests.readCitations(PIDA, "project", { root: ROOT }).length === 0;
    a_state_doc    = (await _currentState(PIDA, "loop_s361a")) === "DOCUMENTATION";
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PIDA); }

  // Leg B (no-fabrication, the CTO-refinement proof via the REACHABLE mechanism): search
  // returns a URL → ingest seeds a LOW-credibility source → real re-retrieve (COMMUNITY floor)
  // FILTERS it → reChunks empty → discovery returns false → claim STAYS UNCITED. Ingest ran,
  // but no fabricated "cited".
  const PIDB = "s361_low_ingest";
  _cleanup(PIDB);
  let b_searched = false, b_ingested = false, b_not_cited = false, b_uncited = false, b_no_citations = false;
  const dB = _mockDiscovery({ ingestTier: "LOW" });
  try {
    const r = await _runDocumentProjectWithDiscovery(PIDB, "loop_s361b", dB.disc, null);
    const cp = r.citation_pass || {};
    b_searched     = cp.discovery_searches >= 1;
    b_ingested     = cp.discovery_ingests >= 1 && dB.state.ingestUrls.length >= 1;
    b_not_cited    = cp.discovery_cited === 0;
    b_uncited      = r.advanced !== true && r.doc_error === "UNCITED_CLAIMS";
    b_no_citations = manifests.readCitations(PIDB, "project", { root: ROOT }).length === 0;
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PIDB); }

  // Leg C (RULING 2 exclusion): retrieve_failed (hermetic, NO _client → kb.retrieve fast-fails)
  // with a _discovery spy present → discovery is NEVER attempted (search spy has 0 calls).
  // Sandbox-class (no LanceDB touched — retrieve fails at the embed step).
  const PIDC = "s361_retrieve_failed_excl";
  _cleanup(PIDC);
  _ensureProjectDir(PIDC);
  let c_retrieve_failed = false, c_no_search = false, c_uncited = false;
  const dC = _mockDiscovery({});
  try {
    const content = [
      "The service provides durable task persistence across restarts.",
      "The API requires bearer authentication on every request."
    ].join("\n");
    const rel = "artifacts/projects/" + PIDC + "/orchestration/loop_s361c/documentation.json";
    const summary = await runDocumentationCitationPass(reg, PIDC, rel, content, ROOT, undefined, dC.disc);
    c_retrieve_failed = summary.retrieve_failed >= 1;
    c_no_search       = summary.discovery_searches === 0 && dC.state.searchQueries.length === 0;
    c_uncited         = summary.cited === 0 && summary.uncited === summary.claims_detected;
  } finally { _cleanup(PIDC); }

  return {
    a_searched, a_uncited, a_no_citations, a_state_doc,
    b_searched, b_ingested, b_not_cited, b_uncited, b_no_citations,
    c_retrieve_failed, c_no_search, c_uncited
  };
}

// ── S362 — per-run total-search cap enforced ──────────────────────────────────
// Direct pass over a 4-claim doc, empty store (all zero_chunks), search returns EMPTY (no
// ingest → all claims remain zero_chunks and reach discovery), maxTotalSearches = 2 →
// exactly 2 searches fire; the 3rd/4th claims short-circuit before searching.
async function runS362SearchCap() {
  const storage = _lanceStore();
  const reg     = getDefaultRegistry();
  const PID     = "s362_search_cap";
  _cleanup(PID);
  _ensureProjectDir(PID);
  const d = _mockDiscovery({ searchMode: "empty", maxTotalSearches: 2 });
  try {
    const content = [
      "The service provides durable task persistence across restarts.",
      "The API requires bearer authentication on every request.",
      "The system must validate all request payloads before processing.",
      "The gateway supports rate limiting per client key."
    ].join("\n");
    const rel = "artifacts/projects/" + PID + "/orchestration/loop_s362/documentation.json";
    const summary = await runDocumentationCitationPass(
      reg, PID, rel, content, ROOT, _mockEmbedClient(), d.disc);

    const enough_claims   = summary.claims_detected >= 3;
    const all_zero_chunks = summary.zero_chunks >= 3;
    const cap_enforced    = summary.discovery_searches === 2 && d.state.searchQueries.length === 2;
    const cap_not_exceeded = summary.discovery_searches <= 2;
    const all_uncited     = summary.cited === 0;
    return { enough_claims, all_zero_chunks, cap_enforced, cap_not_exceeded, all_uncited };
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PID); }
}

// ── S363 — in-run URL dedup (never ingest the same URL twice per run) ──────────
// Direct pass over a 2-claim doc, empty store, search returns the SAME url for both claims,
// ingest seeds a LOW chunk (filtered by retrieve → both claims stay zero_chunks and BOTH reach
// discovery). Claim-1 ingests; claim-2 hits the in-run dedup guard and does NOT ingest again.
async function runS363UrlDedup() {
  const storage = _lanceStore();
  const reg     = getDefaultRegistry();
  const PID     = "s363_url_dedup";
  _cleanup(PID);
  _ensureProjectDir(PID);
  const d = _mockDiscovery({ url: "https://example.com/same-source", ingestTier: "LOW" });
  try {
    const content = [
      "The service provides durable task persistence across restarts.",
      "The API requires bearer authentication on every request."
    ].join("\n");
    const rel = "artifacts/projects/" + PID + "/orchestration/loop_s363/documentation.json";
    const summary = await runDocumentationCitationPass(
      reg, PID, rel, content, ROOT, _mockEmbedClient(), d.disc);

    const two_claims        = summary.claims_detected === 2;
    const both_searched     = summary.discovery_searches === 2 && d.state.searchQueries.length === 2;
    const ingested_once     = d.state.ingestUrls.length === 1 && summary.discovery_ingests === 1;
    const dedup_same_url    = d.state.ingestUrls.length >= 1 && d.state.ingestUrls[0] === "https://example.com/same-source";
    const both_uncited      = summary.cited === 0;
    return { two_claims, both_searched, ingested_once, dedup_same_url, both_uncited };
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PID); }
}

// ── PHASE-52 A-1 (D-A1.4) — Tavily-content ingest scenarios (S364–S366) ─────────
//
// These prove Approach B (kb.ingest_content — ingest Tavily-RETURNED text, never fetch the
// arbitrary host) through the REAL tool, per the A-1 Step 2 GO refinements:
//   S364 — kb.ingest_content direct (real tool; mock embed via ctx._client); empty → REJECTED.
//   S365 — NON-VACUOUS no-fetch proof: the REAL kb.ingest_content on the EXACT host that
//          returned HOST_NOT_ALLOWED in the real Gate #10 (asoasis.tech) SUCCEEDS with an
//          invoke-spy proving ZERO http.get/http.post during the call — while the CONTRAST
//          leg shows kb.ingest_url on the SAME host is still HOST_NOT_ALLOWED (allow-list
//          intact). NOT routed through the mocked discovery seam (that would be vacuous).
//   S366 — E2E content-path lift through the REAL kb.ingest_content: _discovery provides
//          ONLY search (returns {url, content}); _ingest falls through to the real
//          reg.invoke("kb.ingest_content") with the mock embed client in ingestCtx.
//
// failed() envelope shape (contract): { status:"FAILED", output:null, metadata:{reason,...} }
// → REJECTED assertions check metadata.reason, not output.

// The EXACT URL that failed with HOST_NOT_ALLOWED in the real Gate #10 ($0 probe evidence,
// _phase_52_checkpoints/stage_gate10_real.md §3).
const GATE10_BLOCKED_URL =
  "https://asoasis.tech/articles/2026-04-07-0253-rest-api-health-check-endpoint-design";

const S36X_CONTENT =
  "Health check endpoints are a REST API design pattern: the service exposes GET /health " +
  "and returns HTTP 200 with a small JSON status body when the process is reachable. " +
  "The endpoint performs no authentication and no persistence access, so it responds fast " +
  "and is safe for load balancers and uptime monitors to poll frequently.";

// ── S364 — kb.ingest_content direct (the tool works; empty content REJECTED) ──
async function runS364IngestContentDirect() {
  const PID = "s364_ingest_content";
  _cleanup(PID);
  const storage = _lanceStore();
  const reg     = getDefaultRegistry();
  try {
    const url = "https://example.tld/x";
    const env = await reg.invoke("kb.ingest_content",
      { url, content: S36X_CONTENT, title: "S364 Source", project_id: PID },
      { root: ROOT, _client: _mockEmbedClient() });

    const ingest_ok        = !!(env && env.status === "SUCCESS" && env.output && env.output.status === "OK");
    const chunks_ge_1      = !!(env && env.output && env.output.chunks_created >= 1);
    const src_id_valid     = !!(env && env.output && /^src_[a-f0-9]{12}$/.test(env.output.src_id));

    // Credibility scored by URL only → plain https → REPUTABLE (0.55).
    const sources          = manifests.readSources(PID, "project", { root: ROOT });
    const rec              = sources.find(s => s.url === url) || null;
    const tier_reputable   = !!(rec && rec.credibility && rec.credibility.tier === "REPUTABLE");
    const content_type_plain = !!(rec && rec.content_type === "text/plain");

    // kb.retrieve finds the stored chunk (mock embed: query ≡ chunk → relevance ≈ 1).
    const rEnv = await reg.invoke("kb.retrieve",
      { query: "health check endpoint returns 200", project_id: PID, credibility_floor: "COMMUNITY" },
      { root: ROOT, _client: _mockEmbedClient() });
    const results   = (rEnv && rEnv.output && rEnv.output.results) || [];
    const retrieved = rEnv && rEnv.status === "SUCCESS" && results.length >= 1;
    const retrieved_tier_ok = results.length >= 1 && results[0].credibility_tier === "REPUTABLE";

    // Empty/whitespace content → REJECTED (EMPTY_CONTENT), nothing persisted.
    const emptyEnv = await reg.invoke("kb.ingest_content",
      { url: "https://example.tld/empty", content: "   \n\t ", project_id: PID },
      { root: ROOT, _client: _mockEmbedClient() });
    const empty_rejected  = !!(emptyEnv && emptyEnv.status !== "SUCCESS" &&
                               emptyEnv.metadata && emptyEnv.metadata.reason === "EMPTY_CONTENT");
    const empty_no_source = !manifests.readSources(PID, "project", { root: ROOT })
                               .some(s => s.url === "https://example.tld/empty");

    return {
      ingest_ok, chunks_ge_1, src_id_valid, tier_reputable, content_type_plain,
      retrieved, retrieved_tier_ok, empty_rejected, empty_no_source
    };
  } finally {
    try { await storage.closeAll(); } catch (_) {}
    _cleanup(PID);
  }
}

// ── S365 — NO fetch on the EXACT Gate #10 failure case (real tool + invoke spy) ──
async function runS365NoArbitraryFetch() {
  const PID = "s365_no_fetch";
  _cleanup(PID);
  const storage = _lanceStore();
  const reg     = getDefaultRegistry();

  // Spy: record EVERY registry invocation (name + input.url) for the duration of the
  // kb.ingest_content call, then restore. Test-only, in-process, restored in finally.
  const calls      = [];
  const origInvoke = reg.invoke;
  let ingestEnv    = null;
  try {
    // CONTRAST leg FIRST (the Gate #10 case itself, $0 — HOST_NOT_ALLOWED fires in
    // _validateUrl BEFORE any network I/O): kb.ingest_url on the blocked host, in a
    // PRISTINE project KB (must run BEFORE ingest_content — otherwise the persistent
    // srcId(url) dedup returns DUPLICATE before the fetch is ever attempted).
    const urlEnv = await reg.invoke("kb.ingest_url",
      { url: GATE10_BLOCKED_URL, project_id: PID }, { root: ROOT });
    const ingest_url_still_blocked = !!(urlEnv && urlEnv.status !== "SUCCESS" &&
      urlEnv.metadata && urlEnv.metadata.reason === "HOST_NOT_ALLOWED");

    reg.invoke = async function (name, input, ctx) {
      calls.push({ name, url: input && input.url });
      return origInvoke.call(reg, name, input, ctx);
    };
    try {
      ingestEnv = await reg.invoke("kb.ingest_content",
        { url: GATE10_BLOCKED_URL, content: S36X_CONTENT, title: "Gate10 blocked host", project_id: PID },
        { root: ROOT, _client: _mockEmbedClient() });
    } finally {
      reg.invoke = origInvoke;   // ALWAYS restore before anything else runs
    }

    // The exact URL that FAILED in the real Gate #10 now INGESTS successfully…
    const ingest_success = !!(ingestEnv && ingestEnv.status === "SUCCESS" &&
                              ingestEnv.output && ingestEnv.output.status === "OK" &&
                              ingestEnv.output.chunks_created >= 1);

    // …with ZERO http.get / http.post during the whole call (Forge never contacted ANY host,
    // a fortiori not the arbitrary one). Semantic invariant: every contacted host ∈ allow-list
    // holds vacuously-strongly here because the contacted-host set is EMPTY.
    const httpCalls          = calls.filter(c => c.name === "http.get" || c.name === "http.post");
    const zero_http_calls    = httpCalls.length === 0;
    const zero_fetch_of_host = !calls.some(c =>
      (c.name === "http.get" || c.name === "http.post") &&
      typeof c.url === "string" && c.url.indexOf("asoasis.tech") !== -1);
    const spy_saw_ingest     = calls.some(c => c.name === "kb.ingest_content");

    return {
      ingest_success, zero_http_calls, zero_fetch_of_host, spy_saw_ingest,
      ingest_url_still_blocked
    };
  } finally {
    reg.invoke = origInvoke;     // idempotent double-restore (safety)
    try { await storage.closeAll(); } catch (_) {}
    _cleanup(PID);
  }
}

// ── S366 — E2E content-path lift through the REAL kb.ingest_content ────────────
// _discovery provides ONLY search; _ingest falls through to the REAL
// reg.invoke("kb.ingest_content") with the mock embed client in ingestCtx. Only Tavily +
// the embedder are stubbed — the ingest/store/retrieve/cite chain is real.
async function runS366ContentPathLift() {
  const PID     = "s366_content_lift";
  const LOOP_ID = "loop_s366";
  _cleanup(PID);
  const storage = _lanceStore();
  const state   = { searchQueries: [] };
  const disc    = {
    async search(input) {
      state.searchQueries.push(input.query);
      return { status: "SUCCESS", output: { results: [{
        url:     "https://example.tld/discovered-s366",
        title:   "Discovered S366",
        snippet: "supporting passage",
        content: S36X_CONTENT
      }] } };
    }
    // NO ingest override — the loop's _ingest uses the REAL kb.ingest_content.
  };
  try {
    const result = await _runDocumentProjectWithDiscovery(PID, LOOP_ID, disc, null);
    const cp = result.citation_pass || {};

    const searched            = cp.discovery_searches >= 1 && state.searchQueries.length >= 1;
    const real_ingest_ran     = cp.discovery_ingests >= 1;
    const discovery_cited     = cp.discovery_cited >= 1;
    const advanced_true       = result.advanced === true;
    const advanced_to_qj      = result.advanced_to === "QUALITY_JUDGE";
    const audit_pass          = !!(result.citation_audit && result.citation_audit.status === "PASS");

    // The REAL ingest persisted a REPUTABLE text/plain SourceRecord for the discovered URL.
    const sources = manifests.readSources(PID, "project", { root: ROOT });
    const src     = sources.find(s => s.url === "https://example.tld/discovered-s366") || null;
    const source_persisted_reputable = !!(src && src.credibility && src.credibility.tier === "REPUTABLE" &&
                                          src.content_type === "text/plain");
    const citations_written = manifests.readCitations(PID, "project", { root: ROOT }).length >= 1;

    return {
      searched, real_ingest_ran, discovery_cited,
      advanced_true, advanced_to_qj, audit_pass,
      source_persisted_reputable, citations_written
    };
  } finally {
    try { await storage.closeAll(); } catch (_) {}
    _cleanup(PID);
  }
}

module.exports = {
  runSDCitationRecordSchema,
  runSENonMutation,
  runSACitedPath,
  runSBUncitedFailClosed,
  runSCDetectorCoverage,
  runS359CosineRelevance,
  runS360DiscoveryLift,
  runS361DiscoveryUncited,
  runS362SearchCap,
  runS363UrlDedup,
  runS364IngestContentDirect,
  runS365NoArbitraryFetch,
  runS366ContentPathLift
};
