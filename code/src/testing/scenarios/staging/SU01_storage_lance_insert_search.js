"use strict";

// SU01 — storage_lance.js unit test
// Tests: insert 3 chunks, vector search returns ranked top-k
// Dev-only (not in official S129–S136 set). Remove or keep before PHASE-9 closure.

const os   = require("os");
const path = require("path");
const fs   = require("fs");

const { openStore, insertChunks, searchVector, closeStore, getTableInfo } = require("../../../runtime/kb/storage_lance");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su01_" + Date.now());

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log("  PASS:", label);
    passed++;
  } else {
    console.error("  FAIL:", label, detail ? ("| " + detail) : "");
    failed++;
  }
}

function vec(fill) { return new Array(512).fill(fill); }

async function run() {
  console.log("SU01 — storage_lance insert + search");

  const store = await openStore("test_proj", "project", { root: TMP_ROOT });
  assert("openStore returns object", store && typeof store === "object");

  const chunks = [
    {
      id: "chk_aabbccdd_0", source_id: "src_aabbccddeeff", ordinal: 0,
      text: "JWT tokens expire after a set duration",
      char_start: 0, char_end: 38, overlap_with_prev: 0,
      embedding: vec(0.8), embedding_model: "text-embedding-3-small@512",
      section_heading: "Security", metadata: { chunk_strategy: "fixed_v1", page: null }
    },
    {
      id: "chk_aabbccdd_1", source_id: "src_aabbccddeeff", ordinal: 1,
      text: "Refresh tokens should rotate on each use",
      char_start: 38, char_end: 78, overlap_with_prev: 200,
      embedding: vec(0.2), embedding_model: "text-embedding-3-small@512",
      section_heading: null, metadata: { chunk_strategy: "fixed_v1", page: null }
    },
    {
      id: "chk_aabbccdd_2", source_id: "src_aabbccddeeff", ordinal: 2,
      text: "HTTPS required for all token transmission",
      char_start: 78, char_end: 120, overlap_with_prev: 200,
      embedding: vec(0.5), embedding_model: "text-embedding-3-small@512",
      section_heading: null, metadata: { chunk_strategy: "fixed_v1", page: null }
    }
  ];

  const insertResult = await insertChunks(store, chunks);
  assert("insertChunks returns inserted count 3", insertResult.inserted === 3, JSON.stringify(insertResult));

  const info = await getTableInfo(store);
  assert("getTableInfo reports 3 rows", info.count === 3, JSON.stringify(info));

  // Query with a vector closest to vec(0.8) — should return chk_aabbccdd_0 first
  const results = await searchVector(store, vec(0.8), 3, {});
  assert("searchVector returns 3 results", results.length === 3, "got " + results.length);
  assert("first result is chk_aabbccdd_0", results[0].id === "chk_aabbccdd_0", results[0] && results[0].id);
  assert("results have relevance_score", results.every(r => r.relevance_score !== undefined && r.relevance_score !== null));
  assert("results have text field", results.every(r => typeof r.text === "string"));

  // k=1 should return only 1 result
  const top1 = await searchVector(store, vec(0.8), 1, {});
  assert("searchVector with k=1 returns 1 result", top1.length === 1, "got " + top1.length);

  await closeStore(store);

  // Cleanup
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU01:", passed, "passed,", failed, "failed");
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU01 ERROR:", err.message);
  process.exit(1);
});
