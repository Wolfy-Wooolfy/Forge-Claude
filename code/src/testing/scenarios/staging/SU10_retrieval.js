"use strict";

// SU10 — retrieval.js unit test (mock _client + mock storage_lance)

const os   = require("os");
const path = require("path");
const fs   = require("fs");

// We override storage_lance before requiring retrieval.js by injecting into module cache
const LANCE_PATH = path.resolve(__dirname, "../../../runtime/kb/storage_lance.js");
const MANIFEST_PATH = path.resolve(__dirname, "../../../runtime/kb/manifests.js");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su10_" + Date.now());
const PID      = "test_proj_su10";
const SCOPE    = "project";

let passed = 0, failed_count = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail !== undefined ? ("| " + JSON.stringify(detail)) : ""); failed_count++; }
}

// ── Source manifest fixture ───────────────────────────────────────────────────

function seedManifest() {
  const exportsDir = path.join(TMP_ROOT, "artifacts/projects", PID, "kb/exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  const src = {
    schema_version: "1.0.0", id: "src_aabbcc112233", url: "https://api.search.brave.com/test",
    title: "Test Source", fetched_at: "2026-05-12T00:00:00Z",
    content_type: "text/html", raw_byte_size: 1000, extracted_text_size: 500,
    language: "en", credibility: { score: 0.70, tier: "REPUTABLE", signals: ["https"], scored_by: "heuristic_v1", scored_at: "2026-05-12T00:00:00Z" },
    scope: SCOPE, project_id: PID, ingestion_decision: null
  };
  const srcLow = {
    schema_version: "1.0.0", id: "src_001122334455", url: "https://api.search.brave.com/low",
    title: "Low Source", fetched_at: "2026-05-12T00:00:00Z",
    content_type: "text/html", raw_byte_size: 100, extracted_text_size: 50,
    language: "en", credibility: { score: 0.10, tier: "LOW", signals: [], scored_by: "heuristic_v1", scored_at: "2026-05-12T00:00:00Z" },
    scope: SCOPE, project_id: PID, ingestion_decision: null
  };
  fs.writeFileSync(
    path.join(exportsDir, "sources.jsonl"),
    JSON.stringify(src) + "\n" + JSON.stringify(srcLow) + "\n",
    "utf8"
  );
}

// ── Mock vector results ───────────────────────────────────────────────────────

const MOCK_RAW_RESULTS = [
  { id: "chk_aabbcc11_0", source_id: "src_aabbcc112233", ordinal: 0, text: "Relevant text about APIs.", relevance_score: 0.85, section_heading: "Introduction", chunk_strategy: "semantic_v1" },
  { id: "chk_001122_0",   source_id: "src_001122334455", ordinal: 0, text: "Low credibility text.",    relevance_score: 0.70, section_heading: null, chunk_strategy: "fixed_v1" }
];

// ── Mock lance module (mutable search delegate for T4) ───────────────────────

let _searchDelegate = async () => MOCK_RAW_RESULTS.slice();

const mockLance = {
  openStore:      async () => ({ table: {} }),
  searchVector:   async (store, vec, k, filters) => _searchDelegate(store, vec, k, filters),
  insertChunks:   async () => ({ inserted: 0 }),
  deleteBySource: async () => ({ deleted: 0 }),
  closeStore:     async () => {},
  closeAll:       async () => {}
};

require.cache[LANCE_PATH] = { id: LANCE_PATH, filename: LANCE_PATH, loaded: true, exports: mockLance };

// ── Mock embeddings client ────────────────────────────────────────────────────

const mockClient = {
  embeddings: {
    create: async () => ({
      data: [{ embedding: new Array(512).fill(0.01) }],
      usage: { total_tokens: 10 }
    })
  }
};

// ── Load retrieval AFTER injecting mock ──────────────────────────────────────

const { retrieve } = require("../../../runtime/kb/retrieval");

async function run() {
  console.log("SU10 — retrieval.js");

  seedManifest();

  // ── T1: happy path — REPUTABLE floor filters out LOW source ─────────────────

  const r1 = await retrieve("test query about APIs", {
    project_id:        PID,
    scope:             SCOPE,
    k:                 5,
    credibility_floor: "REPUTABLE",
    root:              TMP_ROOT,
    _client:           mockClient
  });

  assert("T1: returns object with results array",  Array.isArray(r1.results),            r1);
  assert("T1: LOW source filtered out",            r1.results.length === 1,              r1.results.length);
  assert("T1: result has chunk_id",                r1.results[0] && r1.results[0].chunk_id === "chk_aabbcc11_0", r1.results[0] && r1.results[0].chunk_id);
  assert("T1: credibility_tier REPUTABLE",         r1.results[0] && r1.results[0].credibility_tier === "REPUTABLE", r1.results[0] && r1.results[0].credibility_tier);
  assert("T1: relevance_score present",            r1.results[0] && typeof r1.results[0].relevance_score === "number", r1.results[0] && r1.results[0].relevance_score);
  assert("T1: rejected_low_credibility=1",         r1.rejected_low_credibility === 1,    r1.rejected_low_credibility);

  // ── T2: COMMUNITY floor — includes LOW? No — LOW rank (0) < COMMUNITY rank (1) ─

  const r2 = await retrieve("test query", {
    project_id:        PID,
    scope:             SCOPE,
    k:                 5,
    credibility_floor: "COMMUNITY",
    root:              TMP_ROOT,
    _client:           mockClient
  });

  assert("T2: COMMUNITY floor includes REPUTABLE",   r2.results.some(c => c.credibility_tier === "REPUTABLE"), r2.results.map(c => c.credibility_tier));
  assert("T2: COMMUNITY floor still excludes LOW",   !r2.results.some(c => c.credibility_tier === "LOW"),      r2.results.map(c => c.credibility_tier));
  assert("T2: rejected_low_credibility=1",           r2.rejected_low_credibility === 1, r2.rejected_low_credibility);

  // ── T3: k=1 limits results ───────────────────────────────────────────────────

  const r3 = await retrieve("test query", {
    project_id:        PID,
    scope:             SCOPE,
    k:                 1,
    credibility_floor: "REPUTABLE",
    root:              TMP_ROOT,
    _client:           mockClient
  });

  assert("T3: k=1 limits to 1 result", r3.results.length === 1, r3.results.length);

  // ── T4: empty store → empty results ──────────────────────────────────────────

  _searchDelegate = async () => [];

  const r4 = await retrieve("test query", {
    project_id: PID, scope: SCOPE, root: TMP_ROOT, _client: mockClient
  });

  assert("T4: empty store returns empty results array", Array.isArray(r4.results) && r4.results.length === 0, r4);
  assert("T4: empty store rejected_low_credibility=0",  r4.rejected_low_credibility === 0, r4.rejected_low_credibility);

  _searchDelegate = async () => MOCK_RAW_RESULTS.slice(); // restore

  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU10:", passed, "passed,", failed_count, "failed");
  process.exit(failed_count > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU10 ERROR:", err.message, err.stack);
  process.exit(1);
});
