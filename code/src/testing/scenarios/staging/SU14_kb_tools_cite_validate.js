"use strict";

// SU14 — kb_tools.js: kb.cite and kb.validate_citations

const os   = require("os");
const path = require("path");
const fs   = require("fs");

// ── Module mock paths ─────────────────────────────────────────────────────────

const LANCE_PATH = path.resolve(__dirname, "../../../runtime/kb/storage_lance.js");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su14_" + Date.now());
const PID      = "test_proj_su14";
const SCOPE    = "project";

let passed = 0, failed_count = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail !== undefined ? ("| " + JSON.stringify(detail)) : ""); failed_count++; }
}

// ── Inject lance stub (needed by kb_tools require chain) ─────────────────────

if (!require.cache[LANCE_PATH]) {
  require.cache[LANCE_PATH] = {
    id: LANCE_PATH, filename: LANCE_PATH, loaded: true,
    exports: {
      openStore: async () => ({}), insertChunks: async () => ({ inserted: 0 }),
      searchVector: async () => [], deleteBySource: async () => ({ deleted: 0 }),
      closeStore: async () => {}, closeAll: async () => {}
    }
  };
}

// ── Load kb_tools ─────────────────────────────────────────────────────────────

const { tools }          = require("../../../runtime/tools/kb_tools");
const cite_tool          = tools.find(t => t.name === "kb.cite");
const validate_tool      = tools.find(t => t.name === "kb.validate_citations");
const list_sources_tool  = tools.find(t => t.name === "kb.list_sources");
const delete_source_tool = tools.find(t => t.name === "kb.delete_source");

// ── Helpers ────────────────────────────────────────────────────────────────────

function seedSource(project_id) {
  const exportsDir = path.join(TMP_ROOT, "artifacts/projects", project_id, "kb/exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  const src = {
    schema_version: "1.0.0", id: "src_aabbcc112233", url: "https://api.search.brave.com/su14",
    title: "SU14 Source", fetched_at: "2026-05-12T00:00:00Z", content_type: "text/html",
    raw_byte_size: 300, extracted_text_size: 100, language: "en",
    credibility: { score: 0.70, tier: "REPUTABLE", signals: ["https"], scored_by: "heuristic_v1", scored_at: "2026-05-12T00:00:00Z" },
    scope: SCOPE, project_id, ingestion_decision: null
  };
  fs.writeFileSync(path.join(exportsDir, "sources.jsonl"), JSON.stringify(src) + "\n", "utf8");
  return src;
}

function makeChunk(chunk_id, source_id, relevance_score) {
  return { chunk_id, source_id, text: "Supporting text for the claim.", relevance_score, credibility_tier: "REPUTABLE" };
}

async function run() {
  console.log("SU14 — kb_tools: kb.cite + kb.validate_citations");

  seedSource(PID);

  // ── T1: kb.cite happy path ────────────────────────────────────────────────────

  const chunk1 = makeChunk("chk_aabbcc11_0", "src_aabbcc112233", 0.85);
  const r1 = await cite_tool.execute({
    claim_text:     "The system must persist all session tokens in encrypted storage.",
    claim_location: { artifact_path: "artifacts/projects/su14/spec.md", line_range: [5, 5] },
    chunks:         [chunk1],
    synthesized_by: "documentation",
    project_id:     PID,
    scope:          SCOPE
  }, { root: TMP_ROOT });

  assert("T1: envelope = SUCCESS",       r1.status === "SUCCESS",                              r1.status);
  assert("T1: cit_id format",            r1.output && /^cit_[a-f0-9]{12}$/.test(r1.output.cit_id), r1.output && r1.output.cit_id);
  assert("T1: confidence = HIGH",        r1.output && r1.output.confidence === "HIGH",          r1.output && r1.output.confidence);
  assert("T1: output.status = OK",       r1.output && r1.output.status === "OK",               r1.output && r1.output.status);

  // ── T2: kb.cite — BLOCKED when all LOW ────────────────────────────────────────

  const lowChunk = { chunk_id: "chk_aabbcc11_1", source_id: "src_aabbcc112233", text: "Low quality text.", relevance_score: 0.90, credibility_tier: "LOW" };
  const r2 = await cite_tool.execute({
    claim_text:     "The system supports 99.9% uptime guarantees per specification.",
    claim_location: { artifact_path: "artifacts/projects/su14/spec.md", line_range: [6, 6] },
    chunks:         [lowChunk],
    project_id:     PID,
    scope:          SCOPE
  }, { root: TMP_ROOT });

  assert("T2: BLOCKED → envelope FAILED",  r2.status === "FAILED",                                r2.status);
  assert("T2: reason = ALL_CHUNKS_LOW_CREDIBILITY", r2.metadata && r2.metadata.reason === "ALL_CHUNKS_LOW_CREDIBILITY", r2.metadata && r2.metadata.reason);

  // ── T3: kb.validate_citations — PASS (cited lines match claims) ───────────────

  // Write artifact file
  const artifactDir = path.join(TMP_ROOT, "artifacts/projects", PID);
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifactContent = [
    "# System Spec",
    "Introduction paragraph with no claims.",
    "",
    "The system must persist all session tokens in encrypted storage.",  // line 4 — claim
    "End of document."
  ].join("\n");
  fs.writeFileSync(path.join(artifactDir, "spec.md"), artifactContent, "utf8");

  // Cite line 4 to set up PASS condition
  await cite_tool.execute({
    claim_text:     "The system must persist all session tokens in encrypted storage.",
    claim_location: { artifact_path: "artifacts/projects/" + PID + "/spec.md", line_range: [4, 4] },
    chunks:         [chunk1],
    project_id:     PID,
    scope:          SCOPE
  }, { root: TMP_ROOT });

  const r3 = await validate_tool.execute({
    artifact_path: "artifacts/projects/" + PID + "/spec.md",
    project_id:    PID,
    scope:         SCOPE
  }, { root: TMP_ROOT });

  assert("T3: envelope = SUCCESS",         r3.status === "SUCCESS",                           r3.status);
  assert("T3: audit status = PASS",        r3.output && r3.output.status === "PASS",          r3.output && r3.output.status);
  assert("T3: cited_claims_count = 1",     r3.output && r3.output.cited_claims_count === 1,   r3.output && r3.output.cited_claims_count);
  assert("T3: uncited_claims_count = 0",   r3.output && r3.output.uncited_claims_count === 0, r3.output && r3.output.uncited_claims_count);

  // ── T4: kb.validate_citations — FAIL_UNCITED ─────────────────────────────────

  // New project with uncited claim
  const PID2       = PID + "_unc";
  const unc_dir    = path.join(TMP_ROOT, "artifacts/projects", PID2);
  fs.mkdirSync(unc_dir, { recursive: true });
  const uncitedDoc = [
    "# Another Spec",
    "The system requires 99.9% uptime for all production services."  // line 2 — uncited
  ].join("\n");
  fs.writeFileSync(path.join(unc_dir, "spec2.md"), uncitedDoc, "utf8");

  const r4 = await validate_tool.execute({
    artifact_path: "artifacts/projects/" + PID2 + "/spec2.md",
    project_id:    PID2,
    scope:         SCOPE
  }, { root: TMP_ROOT });

  assert("T4: audit status = FAIL_UNCITED",     r4.output && r4.output.status === "FAIL_UNCITED",      r4.output && r4.output.status);
  assert("T4: uncited_claims_count = 1",        r4.output && r4.output.uncited_claims_count === 1,     r4.output && r4.output.uncited_claims_count);
  assert("T4: uncited_claims[0].line = 2",      r4.output && r4.output.uncited_claims[0] && r4.output.uncited_claims[0].line === 2, r4.output && r4.output.uncited_claims[0]);

  // ── T5: kb.list_sources ───────────────────────────────────────────────────────

  const r5 = await list_sources_tool.execute({ project_id: PID, scope: SCOPE }, { root: TMP_ROOT });
  assert("T5: envelope = SUCCESS",      r5.status === "SUCCESS",                              r5.status);
  assert("T5: sources array returned",  r5.output && Array.isArray(r5.output.sources),        r5.output);
  assert("T5: count >= 1",              r5.output && r5.output.count >= 1,                    r5.output && r5.output.count);

  // ── T6: kb.validate_citations — FILE_NOT_FOUND ───────────────────────────────

  const r6 = await validate_tool.execute({
    artifact_path: "artifacts/projects/nonexistent/missing.md",
    project_id:    "nonexistent",
    scope:         SCOPE
  }, { root: TMP_ROOT });

  assert("T6: FILE_NOT_FOUND returns FAILED", r6.status === "FAILED", r6.status);

  // ── T7: kb.delete_source cascade — chunks.jsonl + citations.jsonl cleaned ───

  const PID3       = PID + "_del";
  const del_dir    = path.join(TMP_ROOT, "artifacts/projects", PID3, "kb/exports");
  fs.mkdirSync(del_dir, { recursive: true });

  // Seed source manifest
  const delSrc = {
    schema_version: "1.0.0", id: "src_aabbcc112233", url: "https://api.search.brave.com/del",
    title: "Del Source", fetched_at: "2026-05-12T00:00:00Z", content_type: "text/html",
    raw_byte_size: 100, extracted_text_size: 50, language: "en",
    credibility: { score: 0.70, tier: "REPUTABLE", signals: ["https"], scored_by: "heuristic_v1", scored_at: "2026-05-12T00:00:00Z" },
    scope: SCOPE, project_id: PID3, ingestion_decision: null
  };
  fs.writeFileSync(path.join(del_dir, "sources.jsonl"), JSON.stringify(delSrc) + "\n", "utf8");

  // Seed chunks.jsonl with 2 chunks for this source
  const chk1 = { schema_version: "1.0.0", id: "chk_aabbcc11_0", source_id: "src_aabbcc112233", ordinal: 0, text: "chunk 1", char_start: 0, char_end: 7, overlap_with_prev: 0, embedding: new Array(512).fill(0), embedding_model: "text-embedding-3-small@512", metadata: { chunk_strategy: "fixed_v1", page: null } };
  const chk2 = { schema_version: "1.0.0", id: "chk_aabbcc11_1", source_id: "src_aabbcc112233", ordinal: 1, text: "chunk 2", char_start: 7, char_end: 14, overlap_with_prev: 0, embedding: new Array(512).fill(0), embedding_model: "text-embedding-3-small@512", metadata: { chunk_strategy: "fixed_v1", page: null } };
  fs.writeFileSync(path.join(del_dir, "chunks.jsonl"), JSON.stringify(chk1) + "\n" + JSON.stringify(chk2) + "\n", "utf8");

  // Seed citations.jsonl with a citation referencing chk_aabbcc11_0
  const delCit = {
    schema_version: "1.0.0", id: "cit_abc123456789",
    claim_text: "The system must persist all session tokens in encrypted storage.",
    claim_location: { artifact_path: "artifacts/projects/" + PID3 + "/spec.md", line_range: [1, 1] },
    supporting_chunks: [{ chunk_id: "chk_aabbcc11_0", source_id: "src_aabbcc112233", relevance_score: 0.85, excerpt: "chunk 1" }],
    confidence: "HIGH", synthesized_by: "research", synthesized_at: "2026-05-12T00:00:00Z"
  };
  fs.writeFileSync(path.join(del_dir, "citations.jsonl"), JSON.stringify(delCit) + "\n", "utf8");

  const r7 = await delete_source_tool.execute(
    { src_id: "src_aabbcc112233", project_id: PID3, scope: SCOPE },
    { root: TMP_ROOT }
  );

  assert("T7: envelope = SUCCESS",           r7.status === "SUCCESS",                                       r7.status);
  assert("T7: source_removed = true",        r7.output && r7.output.source_removed === true,                r7.output && r7.output.source_removed);
  assert("T7: chunks_jsonl_removed = 2",     r7.output && r7.output.chunks_jsonl_removed === 2,             r7.output && r7.output.chunks_jsonl_removed);
  assert("T7: citations_removed = 1",        r7.output && r7.output.citations_removed === 1,                r7.output && r7.output.citations_removed);

  // Verify JSONL files are empty after cascade
  const chunksRemaining   = fs.readFileSync(path.join(del_dir, "chunks.jsonl"), "utf8").trim();
  const citationsRemaining = fs.readFileSync(path.join(del_dir, "citations.jsonl"), "utf8").trim();
  assert("T7: chunks.jsonl empty after delete",    chunksRemaining === "",    chunksRemaining || "(empty)");
  assert("T7: citations.jsonl empty after delete", citationsRemaining === "", citationsRemaining || "(empty)");

  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU14:", passed, "passed,", failed_count, "failed");
  process.exit(failed_count > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU14 ERROR:", err.message, err.stack);
  process.exit(1);
});
