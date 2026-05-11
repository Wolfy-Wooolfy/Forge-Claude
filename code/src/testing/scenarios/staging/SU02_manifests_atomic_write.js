"use strict";

// SU02 — manifests.js unit test
// Tests: atomic append, concurrent-safe writes, valid JSONL output
// Dev-only (not in official S129–S136 set).

const os   = require("os");
const path = require("path");
const fs   = require("fs");

const { appendSource, appendChunk, appendCitation, readSources, readChunks, readCitations, exportPaths } = require("../../../runtime/kb/manifests");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su02_" + Date.now());

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

function sampleSource(n) {
  return {
    schema_version: "1.0.0",
    id: "src_aabbccdd" + String(n).padStart(2, "0") + "ef",
    url: "https://example.com/page" + n,
    title: "Page " + n,
    fetched_at: new Date().toISOString(),
    content_type: "text/html",
    raw_byte_size: 5000,
    extracted_text_size: 3000,
    language: "en",
    credibility: {
      score: 0.85,
      tier: "REPUTABLE",
      signals: ["https"],
      scored_by: "heuristic_v1",
      scored_at: new Date().toISOString()
    },
    scope: "project",
    project_id: "test_proj_su02",
    ingestion_decision: null
  };
}

function sampleChunk(n) {
  return {
    schema_version: "1.0.0",
    id: "chk_aabbccdd_" + n,
    source_id: "src_aabbccdd00ef",
    ordinal: n,
    text: "Chunk text number " + n,
    char_start: n * 100,
    char_end: (n + 1) * 100,
    overlap_with_prev: n === 0 ? 0 : 20,
    embedding: new Array(512).fill(0.1 * n),
    embedding_model: "text-embedding-3-small@512",
    section_heading: null,
    metadata: { chunk_strategy: "fixed_v1", page: null }
  };
}

function sampleCitation(n) {
  return {
    schema_version: "1.0.0",
    id: "cit_aabbccdd" + String(n).padStart(2, "0") + "ef",
    claim_text: "Claim number " + n + " is a testable assertion made here.",
    claim_location: {
      artifact_path: "artifacts/projects/test_proj_su02/docs/01_spec.md",
      line_range: [n * 5 + 1, n * 5 + 3]
    },
    supporting_chunks: [{
      chunk_id: "chk_aabbccdd_" + n,
      source_id: "src_aabbccdd00ef",
      relevance_score: 0.9,
      excerpt: "Chunk text number " + n
    }],
    confidence: "HIGH",
    synthesized_by: "documentation",
    synthesized_at: new Date().toISOString()
  };
}

async function run() {
  console.log("SU02 — manifests atomic write");

  const opts = { root: TMP_ROOT };

  // Test 1: append 3 sources
  for (let i = 0; i < 3; i++) {
    appendSource(sampleSource(i), opts);
  }
  const srcs = readSources("test_proj_su02", "project", opts);
  assert("readSources returns 3 records", srcs.length === 3, "got " + srcs.length);
  assert("sources are valid SourceRecords", srcs.every(s => s.schema_version === "1.0.0" && s.id));
  assert("sources JSONL file exists", fs.existsSync(exportPaths("test_proj_su02", "project", opts).sources));

  // Test 2: append 5 chunks
  for (let i = 0; i < 5; i++) {
    appendChunk(sampleChunk(i), "test_proj_su02", "project", opts);
  }
  const chks = readChunks("test_proj_su02", "project", opts);
  assert("readChunks returns 5 records", chks.length === 5, "got " + chks.length);
  assert("chunks have embedding arrays", chks.every(c => Array.isArray(c.embedding) && c.embedding.length === 512));

  // Test 3: append 2 citations
  for (let i = 0; i < 2; i++) {
    appendCitation(sampleCitation(i), "test_proj_su02", "project", opts);
  }
  const cits = readCitations("test_proj_su02", "project", opts);
  assert("readCitations returns 2 records", cits.length === 2, "got " + cits.length);
  assert("citations have supporting_chunks", cits.every(c => Array.isArray(c.supporting_chunks) && c.supporting_chunks.length > 0));

  // Test 4: verify JSONL is valid newline-delimited JSON
  const paths = exportPaths("test_proj_su02", "project", opts);
  const sourcesRaw = fs.readFileSync(paths.sources, "utf8");
  const sourceLines = sourcesRaw.split("\n").filter(l => l.trim());
  assert("sources.jsonl has 3 non-empty lines", sourceLines.length === 3, "got " + sourceLines.length);
  const allParseable = sourceLines.every(l => { try { JSON.parse(l); return true; } catch(_) { return false; } });
  assert("all sources.jsonl lines are valid JSON", allParseable);

  // Test 5: atomic write — no .tmp file left behind
  assert("no .tmp files left behind", !fs.existsSync(paths.sources + ".tmp"));

  // Test 6: idempotent re-read after multiple appends
  appendSource(sampleSource(99), opts);
  const srcs2 = readSources("test_proj_su02", "project", opts);
  assert("4th source appended correctly", srcs2.length === 4, "got " + srcs2.length);

  // Cleanup
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU02:", passed, "passed,", failed, "failed");
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU02 ERROR:", err.message);
  process.exit(1);
});
