"use strict";

// SU11 — citation_engine.js unit test

const os   = require("os");
const path = require("path");
const fs   = require("fs");

const { synthesizeCitation } = require("../../../runtime/kb/citation_engine");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su11_" + Date.now());
const PID      = "test_proj_su11";
const SCOPE    = "project";

let passed = 0, failed_count = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail !== undefined ? ("| " + JSON.stringify(detail)) : ""); failed_count++; }
}

// ── Chunk fixture helpers ─────────────────────────────────────────────────────

function makeChunk(chunk_id, source_id, relevance_score, credibility_tier, text) {
  return { chunk_id, source_id, text: text || "Sample text excerpt for citation test.", relevance_score, credibility_tier };
}

const REPUTABLE_CHUNK = makeChunk("chk_aabb1122_0", "src_aabbcc112233", 0.85, "REPUTABLE");
const LOW_CHUNK       = makeChunk("chk_dd33ee44_0", "src_dd33ee445566", 0.90, "LOW");
const MEDIUM_CHUNK    = makeChunk("chk_ff55aa66_0", "src_ff55aa667788", 0.65, "REPUTABLE");
const LOW_CHUNK2      = makeChunk("chk_001122_0",   "src_001122334455", 0.95, "LOW");

const CLAIM_LOC = { artifact_path: "artifacts/projects/su11/spec.md", line_range: [10, 10] };

async function run() {
  console.log("SU11 — citation_engine.js");

  // ── T1: happy path — HIGH confidence (max >= 0.80) ──────────────────────────

  const r1 = synthesizeCitation({
    claim_text:     "The system must persist all session tokens in encrypted storage.",
    claim_location: CLAIM_LOC,
    chunks:         [REPUTABLE_CHUNK],
    synthesized_by: "documentation",
    project_id:     PID,
    scope:          SCOPE,
    root:           TMP_ROOT
  });

  assert("T1: status = OK",               r1.status === "OK",                              r1.status);
  assert("T1: citation returned",          r1.citation && typeof r1.citation === "object",  typeof r1.citation);
  assert("T1: cit_id format",             r1.citation && /^cit_[a-f0-9]{12}$/.test(r1.citation.id), r1.citation && r1.citation.id);
  assert("T1: confidence = HIGH",         r1.citation && r1.citation.confidence === "HIGH", r1.citation && r1.citation.confidence);
  assert("T1: synthesized_by set",        r1.citation && r1.citation.synthesized_by === "documentation", r1.citation && r1.citation.synthesized_by);

  // Check citation was persisted to JSONL
  const exportsDir = path.join(TMP_ROOT, "artifacts/projects", PID, "kb/exports");
  const citFile    = path.join(exportsDir, "citations.jsonl");
  assert("T1: citations.jsonl created",   fs.existsSync(citFile), citFile);
  const entries = fs.readFileSync(citFile, "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert("T1: 1 citation in JSONL",       entries.length === 1,                            entries.length);

  // ── T2: MEDIUM confidence (0.60 <= max < 0.80) ───────────────────────────────

  const r2 = synthesizeCitation({
    claim_text:     "The API supports versioning via URL path prefixes.",
    claim_location: CLAIM_LOC,
    chunks:         [MEDIUM_CHUNK],
    synthesized_by: "research",
    project_id:     PID,
    scope:          SCOPE,
    root:           TMP_ROOT
  });

  assert("T2: confidence = MEDIUM", r2.status === "OK" && r2.citation.confidence === "MEDIUM", r2.citation && r2.citation.confidence);

  // ── T3: LOW chunk → BLOCKED ───────────────────────────────────────────────────

  const r3 = synthesizeCitation({
    claim_text:     "This system requires 99.9% uptime guarantees.",
    claim_location: CLAIM_LOC,
    chunks:         [LOW_CHUNK],
    project_id:     PID,
    scope:          SCOPE,
    root:           TMP_ROOT
  });

  assert("T3: BLOCKED when all chunks LOW",     r3.status === "BLOCKED",                                   r3.status);
  assert("T3: reason = ALL_CHUNKS_LOW_CREDIBILITY", r3.reason === "ALL_CHUNKS_LOW_CREDIBILITY",            r3.reason);

  // ── T4: empty chunks → BLOCKED ────────────────────────────────────────────────

  const r4 = synthesizeCitation({
    claim_text:     "No supporting chunks provided for this claim.",
    claim_location: CLAIM_LOC,
    chunks:         [],
    project_id:     PID,
    scope:          SCOPE,
    root:           TMP_ROOT
  });

  assert("T4: BLOCKED when no chunks",     r4.status === "BLOCKED",                     r4.status);
  assert("T4: reason = NO_SUPPORTING_CHUNKS", r4.reason === "NO_SUPPORTING_CHUNKS",     r4.reason);

  // ── T5: mixed LOW + REPUTABLE → OK, LOW filtered out ─────────────────────────

  const r5 = synthesizeCitation({
    claim_text:     "Authentication tokens are validated per RFC 7519 specification.",
    claim_location: CLAIM_LOC,
    chunks:         [LOW_CHUNK2, REPUTABLE_CHUNK],
    project_id:     PID,
    scope:          SCOPE,
    root:           TMP_ROOT
  });

  assert("T5: status = OK (REPUTABLE survives)", r5.status === "OK",                                r5.status);
  assert("T5: only REPUTABLE chunk in supporting", r5.citation && r5.citation.supporting_chunks.length === 1, r5.citation && r5.citation.supporting_chunks.length);
  assert("T5: LOW chunk absent from citation",
    r5.citation && !r5.citation.supporting_chunks.some(sc => sc.chunk_id === "chk_001122_0"),
    r5.citation && r5.citation.supporting_chunks.map(sc => sc.chunk_id)
  );

  // ── T6: deterministic cit_id (same input → same id) ──────────────────────────

  const input6 = {
    claim_text:     "The system must persist all session tokens in encrypted storage.",
    claim_location: CLAIM_LOC,
    chunks:         [REPUTABLE_CHUNK],
    synthesized_by: "documentation",
    project_id:     PID, scope: SCOPE, root: TMP_ROOT
  };
  const r6a = synthesizeCitation(input6);
  const r6b = synthesizeCitation(input6);

  assert("T6: cit_id deterministic", r6a.citation && r6b.citation && r6a.citation.id === r6b.citation.id,
    [r6a.citation && r6a.citation.id, r6b.citation && r6b.citation.id]
  );

  // ── T7: excerpt capped at 200 chars ──────────────────────────────────────────

  const longText = "A".repeat(300);
  const longChunk = makeChunk("chk_aabbcc11_1", "src_aabbcc112233", 0.80, "REPUTABLE", longText);
  const r7 = synthesizeCitation({
    claim_text:     "The system ensures encryption is mandatory for all storage.",
    claim_location: CLAIM_LOC,
    chunks:         [longChunk],
    project_id:     PID, scope: SCOPE, root: TMP_ROOT
  });

  assert("T7: excerpt capped at 200",
    r7.status === "OK" && r7.citation.supporting_chunks[0].excerpt.length === 200,
    r7.citation && r7.citation.supporting_chunks[0] && r7.citation.supporting_chunks[0].excerpt.length
  );

  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU11:", passed, "passed,", failed_count, "failed");
  process.exit(failed_count > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU11 ERROR:", err.message, err.stack);
  process.exit(1);
});
