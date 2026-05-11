"use strict";

// SU05 — chunking_engine.js unit test

const { chunkSource } = require("../../../runtime/kb/chunking_engine");

let passed = 0, failed = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail ? ("| " + detail) : ""); failed++; }
}

console.log("SU05 — chunking_engine");

function makeSrc(content_type) {
  return { id: "src_aabbccddeeff", content_type };
}

// ── fixed_v1 ──────────────────────────────────────────────────────────────────

const longText = "A".repeat(1500) + "B".repeat(1500) + "C".repeat(300);
const srcTxt   = makeSrc("text/plain");
const fixed    = chunkSource(srcTxt, longText, { chunk_size: 1500, overlap: 200 });

assert("fixed_v1: chunks produced for long text", fixed.length > 0);
assert("fixed_v1: first chunk char_start=0", fixed[0].char_start === 0);
assert("fixed_v1: last chunk ends at text length", fixed[fixed.length - 1].char_end <= longText.length);
assert("fixed_v1: no chunk exceeds 1500 chars", fixed.every(c => c.text.length <= 1500));
assert("fixed_v1: overlap_with_prev=0 for first chunk", fixed[0].overlap_with_prev === 0);
assert("fixed_v1: overlap_with_prev=200 for subsequent chunks", fixed.length < 2 || fixed[1].overlap_with_prev === 200);
assert("fixed_v1: chunk IDs match pattern", fixed.every(c => /^chk_[a-f0-9]{8}_[0-9]+$/.test(c.id)));
assert("fixed_v1: ordinals are sequential", fixed.every((c, i) => c.ordinal === i));
assert("fixed_v1: source_id matches", fixed.every(c => c.source_id === "src_aabbccddeeff"));
assert("fixed_v1: schema_version 1.0.0", fixed.every(c => c.schema_version === "1.0.0"));
assert("fixed_v1: chunk_strategy = fixed_v1", fixed.every(c => c.metadata.chunk_strategy === "fixed_v1"));
assert("fixed_v1: no embedding field (added later)", fixed.every(c => c.embedding === undefined));

// ── semantic_v1 on markdown ───────────────────────────────────────────────────

const md = `# Introduction
This is the intro section with some content.

## Authentication
JWT tokens must expire within 60 minutes for security.
Refresh tokens should rotate on each use.

## Database
PostgreSQL is recommended for production workloads.
Always use connection pooling.
`;

const srcMd    = makeSrc("text/markdown");
const semantic = chunkSource(srcMd, md, { strategy: "semantic_v1" });

assert("semantic_v1 md: chunks produced", semantic.length > 0);
assert("semantic_v1 md: section headings preserved", semantic.some(c => c.section_heading != null));
assert("semantic_v1 md: chunk_strategy = semantic_v1", semantic.every(c => c.metadata.chunk_strategy === "semantic_v1"));
assert("semantic_v1 md: Authentication section has heading", semantic.some(c => c.section_heading === "Authentication"));

// ── semantic_v1 large section falls back to fixed ────────────────────────────

const bigMd = "## Big Section\n" + "X".repeat(4000);
const bigChunks = chunkSource(srcMd, bigMd, { strategy: "semantic_v1", chunk_size: 1500, overlap: 200 });
assert("semantic_v1 large section splits into fixed sub-chunks", bigChunks.length > 1);
assert("semantic_v1 sub-chunks inherit section heading", bigChunks.every(c => c.section_heading === "Big Section"));
assert("semantic_v1 sub-chunks don't exceed 1500 chars", bigChunks.every(c => c.text.length <= 1500));

// ── empty text → no chunks ────────────────────────────────────────────────────

const empty = chunkSource(makeSrc("text/plain"), "   ");
assert("empty/whitespace text → no chunks", empty.length === 0);

// ── short text → single chunk ─────────────────────────────────────────────────

const short = chunkSource(makeSrc("text/plain"), "Hello world");
assert("short text → single chunk", short.length === 1);
assert("single chunk char_start=0", short[0].char_start === 0);
assert("single chunk char_end=text.length", short[0].char_end === "Hello world".length);

console.log("\nSU05:", passed, "passed,", failed, "failed");
process.exit(failed > 0 ? 1 : 0);
