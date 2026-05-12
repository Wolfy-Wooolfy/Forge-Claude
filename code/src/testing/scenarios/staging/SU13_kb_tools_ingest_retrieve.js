"use strict";

// SU13 — kb_tools.js: kb.ingest_url and kb.retrieve (mock registry + mock client)

const os   = require("os");
const path = require("path");
const fs   = require("fs");

// ── Module path constants for mock injection ──────────────────────────────────

const LANCE_PATH   = path.resolve(__dirname, "../../../runtime/kb/storage_lance.js");
const ACQ_PATH     = path.resolve(__dirname, "../../../runtime/kb/source_acquisition.js");
const EMB_PATH     = path.resolve(__dirname, "../../../runtime/kb/embedding_engine.js");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su13_" + Date.now());
const PID      = "test_proj_su13";

let passed = 0, failed_count = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail !== undefined ? ("| " + JSON.stringify(detail)) : ""); failed_count++; }
}

// ── Mock acquisition result ───────────────────────────────────────────────────

const MOCK_SRC = {
  schema_version: "1.0.0", id: "src_aabbcc112233", url: "https://api.search.brave.com/t1",
  title: "Test Source", fetched_at: "2026-05-12T00:00:00Z", content_type: "text/html",
  raw_byte_size: 500, extracted_text_size: 200, language: "en",
  credibility: { score: 0.70, tier: "REPUTABLE", signals: ["https"], scored_by: "heuristic_v1", scored_at: "2026-05-12T00:00:00Z" },
  scope: "project", project_id: PID, ingestion_decision: null
};

let _acquireDelegate = async () => ({ status: "OK", source: MOCK_SRC, deduped: false, extracted_text: "Hello from test source." });

require.cache[ACQ_PATH] = {
  id: ACQ_PATH, filename: ACQ_PATH, loaded: true,
  exports: { acquireSource: async (...args) => _acquireDelegate(...args) }
};

// ── Mock embedding engine ─────────────────────────────────────────────────────

require.cache[EMB_PATH] = {
  id: EMB_PATH, filename: EMB_PATH, loaded: true,
  exports: {
    embedChunks: async (chunks) => {
      for (const chk of chunks) {
        chk.embedding       = new Array(512).fill(0.01);
        chk.embedding_model = "text-embedding-3-small@512";
      }
      return chunks;
    }
  }
};

// ── Mock lance store ──────────────────────────────────────────────────────────

let _insertedChunks = [];
let _searchDelegate  = async () => [];

require.cache[LANCE_PATH] = {
  id: LANCE_PATH, filename: LANCE_PATH, loaded: true,
  exports: {
    openStore:      async () => ({ table: {} }),
    insertChunks:   async (store, chunks) => { _insertedChunks.push(...chunks); return { inserted: chunks.length }; },
    searchVector:   async (store, vec, k) => _searchDelegate(k),
    deleteBySource: async () => ({ deleted: 0 }),
    closeStore:     async () => {},
    closeAll:       async () => {}
  }
};

// ── Load tools AFTER injecting mocks ─────────────────────────────────────────

const { tools } = require("../../../runtime/tools/kb_tools");
const ingest_url_tool  = tools.find(t => t.name === "kb.ingest_url");
const retrieve_tool    = tools.find(t => t.name === "kb.retrieve");

// ── Mock client for retrieval embedding ──────────────────────────────────────

const mockClient = {
  embeddings: {
    create: async () => ({ data: [{ embedding: new Array(512).fill(0.01) }], usage: { total_tokens: 5 } })
  }
};

async function run() {
  console.log("SU13 — kb_tools: kb.ingest_url + kb.retrieve");

  // ── T1: kb.ingest_url happy path ─────────────────────────────────────────────

  _insertedChunks = [];

  const r1 = await ingest_url_tool.execute(
    { url: "https://api.search.brave.com/t1", project_id: PID },
    { root: TMP_ROOT }
  );

  assert("T1: status envelope = SUCCESS", r1.status === "SUCCESS", r1.status);
  assert("T1: output.status = OK",        r1.output && r1.output.status === "OK", r1.output && r1.output.status);
  assert("T1: src_id set",                r1.output && r1.output.src_id === "src_aabbcc112233", r1.output && r1.output.src_id);
  assert("T1: chunks_created > 0",        r1.output && r1.output.chunks_created > 0, r1.output && r1.output.chunks_created);
  assert("T1: chunks inserted to LanceDB", _insertedChunks.length > 0, _insertedChunks.length);
  assert("T1: each chunk has embedding",  _insertedChunks.every(c => Array.isArray(c.embedding) && c.embedding.length === 512), null);

  // ── T2: kb.ingest_url — DUPLICATE path ───────────────────────────────────────

  _acquireDelegate = async () => ({ status: "DUPLICATE", source: MOCK_SRC, deduped: true, extracted_text: null });

  const r2 = await ingest_url_tool.execute(
    { url: "https://api.search.brave.com/t1", project_id: PID },
    { root: TMP_ROOT }
  );

  assert("T2: DUPLICATE envelope = SUCCESS",   r2.status === "SUCCESS",                   r2.status);
  assert("T2: output.status = DUPLICATE",      r2.output && r2.output.status === "DUPLICATE", r2.output && r2.output.status);
  assert("T2: deduped = true",                 r2.output && r2.output.deduped === true,    r2.output && r2.output.deduped);
  assert("T2: chunks_created = 0",             r2.output && r2.output.chunks_created === 0, r2.output && r2.output.chunks_created);

  // ── T3: kb.ingest_url — REJECTED path ────────────────────────────────────────

  _acquireDelegate = async () => ({ status: "REJECTED", reason: "HOST_NOT_ALLOWED", source: null, deduped: false, extracted_text: null });

  const r3 = await ingest_url_tool.execute(
    { url: "https://api.search.brave.com/t1", project_id: PID },
    { root: TMP_ROOT }
  );

  assert("T3: REJECTED envelope = FAILED",     r3.status === "FAILED",                    r3.status);
  assert("T3: reason = HOST_NOT_ALLOWED",      r3.metadata && r3.metadata.reason === "HOST_NOT_ALLOWED", r3.metadata && r3.metadata.reason);

  // Reset acquireDelegate
  _acquireDelegate = async () => ({ status: "OK", source: MOCK_SRC, deduped: false, extracted_text: "Hello from test source." });

  // ── T4: kb.retrieve — returns results (with manifest for credibility) ─────────

  // Seed manifest so retrieve's post-filter works
  const exportsDir = path.join(TMP_ROOT, "artifacts/projects", PID, "kb/exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  fs.writeFileSync(path.join(exportsDir, "sources.jsonl"), JSON.stringify(MOCK_SRC) + "\n", "utf8");

  _searchDelegate = async (k) => [
    { id: "chk_aabbcc11_0", source_id: "src_aabbcc112233", ordinal: 0, text: "API result text.", relevance_score: 0.80, section_heading: null, chunk_strategy: "semantic_v1" }
  ];

  const r4 = await retrieve_tool.execute(
    { query: "API documentation", project_id: PID, k: 5 },
    { root: TMP_ROOT, _client: mockClient }
  );

  assert("T4: envelope = SUCCESS",             r4.status === "SUCCESS",                              r4.status);
  assert("T4: results is array",               r4.output && Array.isArray(r4.output.results),        r4.output);
  assert("T4: 1 result returned",              r4.output && r4.output.results.length === 1,          r4.output && r4.output.results.length);
  assert("T4: result has chunk_id",            r4.output && r4.output.results[0].chunk_id === "chk_aabbcc11_0", r4.output && r4.output.results[0]);
  assert("T4: credibility_tier on result",     r4.output && r4.output.results[0].credibility_tier === "REPUTABLE", r4.output && r4.output.results[0] && r4.output.results[0].credibility_tier);

  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU13:", passed, "passed,", failed_count, "failed");
  process.exit(failed_count > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU13 ERROR:", err.message, err.stack);
  process.exit(1);
});
