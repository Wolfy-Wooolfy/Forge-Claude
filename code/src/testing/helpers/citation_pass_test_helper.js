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

// PHASE-52 A-1 hermeticity (CTO-ruled, 2026-07-09): after A-1, an EMPTY project KB triggers
// the citation pass's auto web-discovery (zero_chunks). Any scenario asserting the
// fail-closed-on-empty-KB outcome (S-B/S-C) must therefore explicitly DISABLE discovery
// with this no-op seam — discovery ATTEMPTS but deterministically finds nothing → the claim
// stays UNCITED → §8 FAIL_UNCITED → halt (the original PHASE-51 intent), regardless of any
// provider key in the environment. (The production default seam would run a REAL Tavily
// search if a key leaked in — the S357 regression this fixes, alongside the forge-test.js
// HERMETIC_STRIP_KEYS hardening.)
function _hermeticNoDiscovery() {
  return {
    search: async () => ({ status: "FAILED", output: null, metadata: { reason: "HERMETIC_NO_DISCOVERY" } }),
    ingest: async () => ({ status: "FAILED", output: null, metadata: { reason: "HERMETIC_NO_DISCOVERY" } })
  };
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

    // A-1: empty KB now triggers discovery — disable it (no-op seam) so the fail-closed
    // outcome is asserted deterministically (see _hermeticNoDiscovery).
    const engine = createConversationEngine({ root: ROOT, _client: _mockEmbedClient(), _discovery: _hermeticNoDiscovery() });
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

    // A-1: empty KB now triggers discovery — disable it (no-op seam) so the invariant is
    // measured on a deterministic all-uncited outcome (see _hermeticNoDiscovery).
    const engine = createConversationEngine({ root: ROOT, _client: _mockEmbedClient(), _discovery: _hermeticNoDiscovery() });
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
//   chunkVec:   optional explicit embedding for the ingested chunk (PHASE-53 — controls the
//               DISCOVERED source's cosine relevance vs the fixed query; default _fixedVector())
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
        embedding: (o.chunkVec || _fixedVector()), embedding_model: "text-embedding-3-small@512",
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
// preSeedVec (PHASE-53, additive): optional explicit embedding for the pre-seeded chunk —
// controls the BASE KB's cosine relevance vs the fixed query (default _fixedVector() ≈ 1.0).
async function _runDocumentProjectWithDiscovery(pid, loopId, disc, preSeedTier, preSeedVec) {
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
      embedding: (preSeedVec || _fixedVector()), embedding_model: "text-embedding-3-small@512",
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

// ── PHASE-53 D4 — relevance-floor scenarios (S367–S372) ────────────────────────
//
// These exercise the pre-cite relevance floor (R-1 KEEP-BEST) wired into
// runDocumentationCitationPass: a claim WITH first-pass chunks whose best relevance sits
// below RELEVANCE_FLOOR_MEDIUM (0.60) gets ONE targeted discovery, then KEEP-BEST of
// (original, new) feeds the SINGLE kb.cite. All hermetic: mock `_discovery` seam (no
// network), REAL LanceDB + retrieve/cite, relevance controlled by explicit chunk VECTORS
// vs the fixed query [1,0,...] — cosine(normalize(e0 + k·e1), e0) = 1/sqrt(1+k²):
//   k=1 → 0.7071 (≥ floor, MEDIUM) · k=2 → 0.4472 (< floor) · k=3 → 0.3162 (worse).
// Per-claim query differentiation (S367/S370) uses a TEXT-SENSITIVE mock embed client.

function _vecCosK(k) {
  const v = new Array(512).fill(0);
  const n = Math.sqrt(1 + k * k);
  v[0] = 1 / n; v[1] = k / n;
  return v;
}
function _e2Vector() { const v = new Array(512).fill(0); v[2] = 1; return v; }

// Text-sensitive, call-counting mock embed client. pick(text) → vector (null pick →
// _fixedVector() for every input). state.calls counts embeddings.create invocations —
// with the mock seam ingest, that equals the number of kb.retrieve calls (S371's
// redundant-re-retrieve-skip assertion).
function _textEmbedClient(pick) {
  const state  = { calls: 0 };
  const client = { embeddings: { create: async (req) => {
    state.calls++;
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    return {
      data:  inputs.map(t => ({ embedding: pick ? pick(String(t)) : _fixedVector() })),
      usage: { total_tokens: 5 * inputs.length }
    };
  } } };
  return { client, state };
}

// Seed one source + one chunk with an EXPLICIT embedding vector (generalizes the
// S-A/preseed inline blocks). IDs must be §5-schema-valid: src_[a-f0-9]{12}, chk_[a-f0-9]{8}_N.
async function _seedVecChunk(pid, o) {
  manifests.appendSource({
    schema_version: "1.0.0", id: o.srcId, url: o.url,
    title: o.title || "Seed", fetched_at: "2026-07-09T00:00:00.000Z",
    content_type: "text/html", raw_byte_size: 256, extracted_text_size: 64, language: "en",
    credibility: { score: o.tier === "LOW" ? 0.2 : 0.72, tier: o.tier || "REPUTABLE",
      signals: ["https"], scored_by: "heuristic_v1", scored_at: "2026-07-09T00:00:00.000Z" },
    scope: "project", project_id: pid, ingestion_decision: null
  }, pid, "project", { root: ROOT });
  const store = await _lanceStore().openStore(pid, "project", { root: ROOT });
  await _lanceStore().insertChunks(store, [{
    id: o.chkId, source_id: o.srcId, ordinal: 0,
    text: o.text || "Seeded supporting passage for the claim under documentation.",
    char_start: 0, char_end: 60, overlap_with_prev: 0,
    embedding: o.vec, embedding_model: "text-embedding-3-small@512",
    section_heading: null, metadata: { chunk_strategy: "fixed_v1", page: null }
  }]);
}

// Shared claim texts (all §7.1 Pattern-1 matches, ≥10 chars).
const CLAIM_P = "The service provides durable task persistence across restarts.";   // → e0
const CLAIM_A = "The API requires bearer authentication on every request.";          // → e2
const CLAIM_V = "The system must validate all request payloads before processing."; // → e2
const CLAIM_R = "The gateway supports rate limiting per client key.";               // → e2
function _pickByPersistence(t) { return t.indexOf("persistence") !== -1 ? _fixedVector() : _e2Vector(); }

// ── S367 — below-floor claim triggers ONE targeted discovery; ≥floor claim does NOT ──
async function runS367FloorTrigger() {
  const storage = _lanceStore();
  const reg     = getDefaultRegistry();
  const PID     = "s367_floor_trigger";
  _cleanup(PID);
  _ensureProjectDir(PID);
  // Discovered source lands at cosine 0.7071 vs the below-floor claim's query → lift.
  const d = _mockDiscovery({ chunkVec: _vecCosK(1) });
  const emb = _textEmbedClient(_pickByPersistence);
  try {
    // Base KB: K1 = 0.4472 vs CLAIM_P (below floor; orthogonal to CLAIM_A's query) and
    // K2 = 1.0 vs CLAIM_A (above floor; orthogonal to CLAIM_P's query).
    await _seedVecChunk(PID, { srcId: "src_000000000053", chkId: "chk_00000053_0",
      url: "https://example.com/base-low-rel", vec: _vecCosK(2) });
    await _seedVecChunk(PID, { srcId: "src_0000000000a2", chkId: "chk_000000a2_0",
      url: "https://example.com/base-high-rel", vec: _e2Vector() });

    const content = [CLAIM_P, CLAIM_A].join("\n");
    const rel = "artifacts/projects/" + PID + "/orchestration/loop_s367/documentation.json";
    const summary = await runDocumentationCitationPass(reg, PID, rel, content, ROOT, emb.client, d.disc);

    const two_claims_checked = summary.claims_detected === 2 && summary.floor_checked === 2;
    const one_below_floor    = summary.floor_below === 1;
    const one_targeted_search = summary.discovery_searches === 1 && d.state.searchQueries.length === 1 &&
                                d.state.searchQueries[0].indexOf("persistence") !== -1;
    const above_floor_untouched = !d.state.searchQueries.some(q => q.indexOf("authentication") !== -1);
    const rec = summary.floor_claims[0] || null;
    const lifted_record_ok   = summary.floor_claims.length === 1 && !!rec &&
                               rec.trigger === "floor" && rec.attempted === true && rec.lifted === true &&
                               rec.below_floor === false &&
                               rec.best_relevance_before >= 0.42 && rec.best_relevance_before <= 0.47 &&
                               rec.best_relevance_after  >= 0.70 && rec.best_relevance_after  <= 0.72;
    const floor_lifted_one   = summary.floor_lifted === 1 && summary.below_floor_claims === 0;
    const both_cited         = summary.cited === 2 && summary.uncited === 0;
    return {
      two_claims_checked, one_below_floor, one_targeted_search,
      above_floor_untouched, lifted_record_ok, floor_lifted_one, both_cited
    };
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PID); }
}

// ── S368 — keep-best UPGRADE: LOW→MEDIUM + EXACTLY ONE CitationRecord (R-1 guard) ──
async function runS368KeepBestUpgrade() {
  const storage = _lanceStore();
  const reg     = getDefaultRegistry();
  const PID     = "s368_keep_best";
  _cleanup(PID);
  _ensureProjectDir(PID);
  const d = _mockDiscovery({ chunkVec: _vecCosK(1) });   // discovered → 0.7071 (MEDIUM)
  try {
    await _seedVecChunk(PID, { srcId: "src_000000000053", chkId: "chk_00000053_0",
      url: "https://example.com/base-low-rel", vec: _vecCosK(2) });   // base → 0.4472 (LOW)

    const rel = "artifacts/projects/" + PID + "/orchestration/loop_s368/documentation.json";
    const summary = await runDocumentationCitationPass(
      reg, PID, rel, CLAIM_P, ROOT, _mockEmbedClient(), d.disc);

    const records = manifests.readCitations(PID, "project", { root: ROOT });
    const claimRecords = records.filter(r => r.claim_text === CLAIM_P);

    const cited_one          = summary.cited === 1 && summary.uncited === 0;
    // R-1 load-bearing regression guard: exactly ONE record — never a duplicate, never a strip.
    const exactly_one_record = records.length === 1 && claimRecords.length === 1;
    const confidence_medium  = claimRecords.length === 1 && claimRecords[0].confidence === "MEDIUM";
    const rec = summary.floor_claims[0] || null;
    const upgrade_record_ok  = !!rec && rec.lifted === true && rec.below_floor === false &&
                               rec.best_relevance_before < 0.60 && rec.best_relevance_after >= 0.60;
    const record_no_floor_field = claimRecords.length === 1 && !("below_floor" in claimRecords[0]);
    return { cited_one, exactly_one_record, confidence_medium, upgrade_record_ok, record_no_floor_field };
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PID); }
}

// ── S369 — no better source → keep-best original, below_floor flag, §8 PASS (NO HALT) ──
async function runS369NoLiftNoHalt() {
  const storage = _lanceStore();

  // Leg A (worse discovered source): base 0.4472, discovered 0.3162 → keep-best keeps the
  // original set → claim STILL CITED (LOW) → §8 PASS → advance QUALITY_JUDGE.
  const PIDA = "s369_no_lift_worse";
  _cleanup(PIDA);
  let a_advanced = false, a_to_qj = false, a_audit_pass = false, a_cited = false,
      a_flagged = false, a_record_ok = false, a_one_low_record = false;
  const dA = _mockDiscovery({ chunkVec: _vecCosK(3) });
  try {
    const r = await _runDocumentProjectWithDiscovery(PIDA, "loop_s369a", dA.disc, "REPUTABLE", _vecCosK(2));
    const cp = r.citation_pass || {};
    a_advanced   = r.advanced === true;
    a_to_qj      = r.advanced_to === "QUALITY_JUDGE";
    a_audit_pass = !!(r.citation_audit && r.citation_audit.status === "PASS");
    a_cited      = cp.cited >= 1 && cp.uncited === 0;
    a_flagged    = cp.below_floor_claims === cp.cited && cp.floor_lifted === 0;
    const rec = (cp.floor_claims || [])[0] || null;
    a_record_ok  = !!rec && rec.trigger === "floor" && rec.attempted === true &&
                   rec.lifted === false && rec.below_floor === true &&
                   rec.best_relevance_after === rec.best_relevance_before;
    const records = manifests.readCitations(PIDA, "project", { root: ROOT });
    a_one_low_record = records.length === cp.cited && records.every(x => x.confidence === "LOW");
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PIDA); }

  // Leg B (offline: search FAILED, e.g. no TAVILY key): identical fallback — claim cited
  // from the original set, flagged, build advances, zero ingests.
  const PIDB = "s369_no_lift_offline";
  _cleanup(PIDB);
  let b_advanced = false, b_cited_flagged = false, b_no_ingest = false, b_attempted = false;
  const dB = _mockDiscovery({ searchMode: "failed" });
  try {
    const r = await _runDocumentProjectWithDiscovery(PIDB, "loop_s369b", dB.disc, "REPUTABLE", _vecCosK(2));
    const cp = r.citation_pass || {};
    b_advanced      = r.advanced === true && r.advanced_to === "QUALITY_JUDGE";
    b_cited_flagged = cp.cited >= 1 && cp.uncited === 0 && cp.below_floor_claims === cp.cited;
    b_no_ingest     = cp.discovery_ingests === 0 && dB.state.ingestUrls.length === 0;
    const rec = (cp.floor_claims || [])[0] || null;
    b_attempted     = !!rec && rec.attempted === true && rec.lifted === false && rec.below_floor === true;
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PIDB); }

  return {
    a_advanced, a_to_qj, a_audit_pass, a_cited, a_flagged, a_record_ok, a_one_low_record,
    b_advanced, b_cited_flagged, b_no_ingest, b_attempted
  };
}

// ── S370 — caps: one attempt/claim + GLOBAL cap SHARED across zero_chunks AND floor (R-3) ──
// Empty store, 4 claims, cap=2. Claim-1 (e0): zero_chunks → search#1 → ingest (0.4472 vs e0)
// → lifted-but-below-floor → R-3: flagged, NO second attempt. Claims 2–4 (e2): first-pass
// now retrieves the ingested REPUTABLE chunk at relevance 0 → floor trigger. Claim-2:
// search#2 (cap reached; same URL → shared dedup, no ingest). Claims 3–4: attempted=false
// (SHARED counter already at cap from a zero_chunks search + a floor search). ALL 4 cited.
async function runS370CapsSharedBudget() {
  const storage = _lanceStore();
  const reg     = getDefaultRegistry();
  const PID     = "s370_caps_shared";
  _cleanup(PID);
  _ensureProjectDir(PID);
  const d   = _mockDiscovery({ chunkVec: _vecCosK(2), maxTotalSearches: 2 });
  const emb = _textEmbedClient(_pickByPersistence);
  try {
    const content = [CLAIM_P, CLAIM_A, CLAIM_V, CLAIM_R].join("\n");
    const rel = "artifacts/projects/" + PID + "/orchestration/loop_s370/documentation.json";
    const summary = await runDocumentationCitationPass(reg, PID, rel, content, ROOT, emb.client, d.disc);

    const four_claims     = summary.claims_detected === 4;
    const one_zero_chunks = summary.zero_chunks === 1;
    const three_floor     = summary.floor_checked === 3 && summary.floor_below === 3;
    const cap_shared      = summary.discovery_searches === 2 && d.state.searchQueries.length === 2 &&
                            d.state.searchQueries[0].indexOf("persistence") !== -1 &&
                            d.state.searchQueries[1].indexOf("authentication") !== -1;
    const one_ingest      = summary.discovery_ingests === 1 && d.state.ingestUrls.length === 1;
    const all_cited_no_halt = summary.cited === 4 && summary.uncited === 0;
    const all_flagged     = summary.below_floor_claims === 4;

    const fc = summary.floor_claims || [];
    const lines = fc.map(x => x.line);
    // R-3: exactly one record per claim — the zero_chunks claim NEVER re-appears as a
    // floor-trigger attempt, and no claim searched twice.
    const one_record_per_claim = fc.length === 4 && new Set(lines).size === 4;
    const zc = fc.find(x => x.trigger === "zero_chunks") || null;
    const r3_zero_chunks_flagged = !!zc && zc.attempted === true && zc.below_floor === true &&
                                   zc.best_relevance_before === 0;
    const floorRecs = fc.filter(x => x.trigger === "floor");
    const past_cap_not_attempted = floorRecs.length === 3 &&
      floorRecs.filter(x => x.attempted === true).length === 1 &&
      floorRecs.filter(x => x.attempted === false).length === 2;

    return {
      four_claims, one_zero_chunks, three_floor, cap_shared, one_ingest,
      all_cited_no_halt, all_flagged, one_record_per_claim,
      r3_zero_chunks_flagged, past_cap_not_attempted
    };
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PID); }
}

// ── S371 — shared URL dedup on the targeted path (+ redundant re-retrieve skipped) ──
async function runS371UrlDedupShared() {
  const storage = _lanceStore();
  const reg     = getDefaultRegistry();
  const PID     = "s371_dedup_shared";
  _cleanup(PID);
  _ensureProjectDir(PID);
  // Both claims below floor (base 0.4472); discovered source is WORSE (0.3162) and the SAME
  // URL both times → claim-1 ingests it; claim-2 hits the shared in-run dedup.
  const d   = _mockDiscovery({ url: "https://example.com/same-source", chunkVec: _vecCosK(3) });
  const emb = _textEmbedClient(null);   // fixed vector + call counter
  try {
    await _seedVecChunk(PID, { srcId: "src_000000000053", chkId: "chk_00000053_0",
      url: "https://example.com/base-low-rel", vec: _vecCosK(2) });

    const content = [CLAIM_P, CLAIM_A].join("\n");
    const rel = "artifacts/projects/" + PID + "/orchestration/loop_s371/documentation.json";
    const summary = await runDocumentationCitationPass(reg, PID, rel, content, ROOT, emb.client, d.disc);

    const both_triggered  = summary.floor_below === 2 &&
                            summary.discovery_searches === 2 && d.state.searchQueries.length === 2;
    const ingested_once   = summary.discovery_ingests === 1 && d.state.ingestUrls.length === 1 &&
                            d.state.ingestUrls[0] === "https://example.com/same-source";
    // kb.retrieve calls == embed calls: c1 first-pass + c1 re-retrieve + c2 first-pass = 3.
    // The dedup-skip path returns BEFORE the redundant re-retrieve (4th call never happens).
    const re_retrieve_skipped = emb.state.calls === 3;
    const both_cited_flagged  = summary.cited === 2 && summary.uncited === 0 &&
                                summary.below_floor_claims === 2 && summary.floor_lifted === 0;
    return { both_triggered, ingested_once, re_retrieve_skipped, both_cited_flagged };
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PID); }
}

// ── S372 — zero_chunks discovery regression: CITATION OUTPUT unchanged vs PHASE-52 ──
// CTO scoping note: PHASE-53 adds a claim-granular floor_claims record on the zero_chunks
// LIFT path, so the SUMMARY is not byte-identical — the regression invariant is the
// CITATION OUTPUT: same cited/uncited verdict, same CitationRecord (schema untouched,
// confidence HIGH from the ≈1.0 discovered chunk), same advance to QUALITY_JUDGE.
async function runS372ZeroChunksRegression() {
  const storage = _lanceStore();
  const PID     = "s372_zc_regression";
  _cleanup(PID);
  const d = _mockDiscovery({});   // PHASE-52 S360-lift shape: REPUTABLE, fixed vector (≈1.0)
  try {
    const r = await _runDocumentProjectWithDiscovery(PID, "loop_s372", d.disc, null);
    const cp = r.citation_pass || {};

    const lift_advanced   = r.advanced === true && r.advanced_to === "QUALITY_JUDGE";
    const audit_pass      = !!(r.citation_audit && r.citation_audit.status === "PASS");
    const same_verdict    = cp.cited >= 1 && cp.uncited === 0 &&
                            cp.discovery_searches >= 1 && cp.discovery_ingests >= 1 &&
                            cp.discovery_cited >= 1;
    const records = manifests.readCitations(PID, "project", { root: ROOT });
    const same_citation_output = records.length >= 1 &&
      records.every(x => x.synthesized_by === "documentation" && x.confidence === "HIGH");
    // R-2: the CitationRecord schema is untouched — no below_floor field on any record.
    const record_schema_untouched = records.every(x => !("below_floor" in x));
    // PHASE-53 additive-only on this path: no floor trigger fired; the ≈1.0 lift is NOT
    // below the floor; the zero_chunks forensic record exists and says so.
    const floor_untriggered = cp.floor_below === 0 && cp.below_floor_claims === 0;
    const zc_record_ok      = (cp.floor_claims || []).length === cp.cited &&
                              (cp.floor_claims || []).every(x =>
                                x.trigger === "zero_chunks" && x.below_floor === false);
    const state_qj = (await _currentState(PID, "loop_s372")) === "QUALITY_JUDGE";

    return {
      lift_advanced, audit_pass, same_verdict, same_citation_output,
      record_schema_untouched, floor_untriggered, zc_record_ok, state_qj
    };
  } finally { try { await storage.closeAll(); } catch (_) {} _cleanup(PID); }
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
  runS366ContentPathLift,
  runS367FloorTrigger,
  runS368KeepBestUpgrade,
  runS369NoLiftNoHalt,
  runS370CapsSharedBudget,
  runS371UrlDedupShared,
  runS372ZeroChunksRegression
};
