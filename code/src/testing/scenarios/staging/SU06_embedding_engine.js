"use strict";

// SU06 — embedding_engine.js unit test (mock OpenAI client)

const os   = require("os");
const path = require("path");
const fs   = require("fs");

const { embedChunks } = require("../../../runtime/kb/embedding_engine");
const { readAll }     = require("../../../runtime/kb/cost_ledger");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su06_" + Date.now());
const PID      = "test_proj_su06";
const opts_base = { project_id: PID, root: TMP_ROOT };

let passed = 0, failed = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail ? ("| " + detail) : ""); failed++; }
}

// ── Mock OpenAI client ────────────────────────────────────────────────────────

function makeMockClient(dims) {
  // Always returns `dims`-dimensional embeddings, regardless of what the API call requests.
  // This lets us test the validation path with wrong dimensions.
  return {
    embeddings: {
      create: async ({ input }) => {
        return {
          data: input.map((_, i) => ({
            embedding: new Array(dims || 512).fill(0.01 * (i + 1)),
            index: i
          })),
          usage: { total_tokens: input.reduce((s, t) => s + t.split(" ").length, 0) }
        };
      }
    }
  };
}

function makeChunkSkeleton(n) {
  return {
    schema_version:    "1.0.0",
    id:                "chk_aabbccdd_" + n,
    source_id:         "src_aabbccddeeff",
    ordinal:           n,
    text:              "Chunk text number " + n + " with some words for token counting",
    char_start:        n * 100,
    char_end:          (n + 1) * 100,
    overlap_with_prev: n === 0 ? 0 : 200,
    embedding_model:   "text-embedding-3-small@512",
    section_heading:   null,
    metadata:          { chunk_strategy: "fixed_v1", page: null }
  };
}

async function run() {
  console.log("SU06 — embedding_engine (mock client)");

  const mockClient = makeMockClient(512);

  // Test 1: embed 5 chunks
  const chunks = [0, 1, 2, 3, 4].map(makeChunkSkeleton);
  const opts   = Object.assign({ _client: mockClient }, opts_base);
  const result = await embedChunks(chunks, opts);

  assert("embedChunks returns same array reference", result === chunks);
  assert("all 5 chunks have embedding", chunks.every(c => Array.isArray(c.embedding)));
  assert("embeddings are 512-dim", chunks.every(c => c.embedding.length === 512));
  assert("embedding values are non-zero", chunks.every(c => c.embedding.some(v => v !== 0)));
  assert("embedding_model field set", chunks.every(c => c.embedding_model === "text-embedding-3-small@512"));

  // Test 2: cost ledger has 1 entry (5 chunks in 1 batch)
  const ledger = readAll(PID, { root: TMP_ROOT });
  assert("cost ledger has 1 entry (single batch)", ledger.length === 1);
  assert("ledger entry operation = embedding", ledger[0].operation === "embedding");
  assert("ledger entry cost_usd >= 0", typeof ledger[0].cost_usd === "number" && ledger[0].cost_usd >= 0);
  assert("ledger entry has timestamp", typeof ledger[0].ts === "string");
  assert("ledger entry tool = kb.ingest_url", ledger[0].tool === "kb.ingest_url");

  // Test 3: batch splitting (batch_size=2 → 3 batches for 5 chunks)
  const chunks2 = [0, 1, 2, 3, 4].map(makeChunkSkeleton);
  const PID2    = "test_proj_su06_b2";
  await embedChunks(chunks2, { _client: mockClient, project_id: PID2, root: TMP_ROOT, batch_size: 2 });
  const ledger2 = readAll(PID2, { root: TMP_ROOT });
  assert("batch_size=2 creates 3 cost ledger entries for 5 chunks", ledger2.length === 3, "got " + ledger2.length);
  assert("all chunks in batch-2 test have embeddings", chunks2.every(c => Array.isArray(c.embedding) && c.embedding.length === 512));

  // Test 4: wrong dimension mock rejects
  const badClient = makeMockClient(256); // wrong dims
  const chunks3 = [makeChunkSkeleton(0)];
  let threw = false;
  try {
    await embedChunks(chunks3, { _client: badClient, project_id: PID, root: TMP_ROOT });
  } catch (err) {
    threw = true;
    assert("wrong dimension error message mentions expected dims",
      err.message.includes("512"), err.message);
  }
  assert("wrong dimension throws", threw);

  // Test 5: empty chunks → returns immediately
  const empty = await embedChunks([], opts);
  assert("empty chunks array returns empty", Array.isArray(empty) && empty.length === 0);

  // Cleanup
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU06:", passed, "passed,", failed, "failed");
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU06 ERROR:", err.message);
  process.exit(1);
});
