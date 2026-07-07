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

module.exports = {
  runSDCitationRecordSchema,
  runSENonMutation,
  runSACitedPath,
  runSBUncitedFailClosed,
  runSCDetectorCoverage
};
