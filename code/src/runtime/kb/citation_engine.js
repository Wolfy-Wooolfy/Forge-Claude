"use strict";

// L-KB-4 Citation Engine — synthesize and persist CitationRecords.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §1 (L-KB-4), §5 (CitationRecord)
//
// Track A: no direct fetch(), no direct fs.*, no new OpenAI().
//   - Credibility data via chunks passed in from retrieval.js
//   - JSONL export via manifests.appendCitation() (§ARC-4 covers manifests.js)

const { citId }                  = require("./_id_minting");
const { validateCitationRecord } = require("./_schemas");
const manifests                  = require("./manifests");

// ── Confidence mapping ────────────────────────────────────────────────────────

function _scoreToConfidence(maxRelevance) {
  if (maxRelevance >= 0.75) return "HIGH";
  if (maxRelevance >= 0.45) return "MEDIUM";
  return "LOW";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Synthesize a CitationRecord from retrieval chunks and persist it.
 *
 * CTO Clarification 2: LOW-tier filter enforced here (defense-in-depth).
 * The research role KNOWN-gate (L-KB-5) is a separate layer above this module.
 *
 * @param {{
 *   claim_text: string,
 *   claim_location: { artifact_path: string, line_range: [number, number] },
 *   chunks: Array<{ chunk_id, source_id, text, relevance_score, credibility_tier }>,
 *   synthesized_by?: "documentation"|"architect"|"research",
 *   project_id: string,
 *   scope?: "project"|"global",
 *   root?: string
 * }} options
 * @returns {{ status: "OK", citation: object } | { status: "BLOCKED", reason: string }}
 */
function synthesizeCitation(options) {
  const opts           = options || {};
  const claim_text     = opts.claim_text || "";
  const claim_location = opts.claim_location;
  const rawChunks      = opts.chunks || [];
  const synthesized_by = opts.synthesized_by || "research";
  const project_id     = opts.project_id || "";
  const scope          = opts.scope || "project";
  const root           = opts.root || process.cwd();

  // Filter out LOW-tier chunks before building the citation
  const eligibleChunks = rawChunks.filter(c => c.credibility_tier !== "LOW");

  if (eligibleChunks.length === 0) {
    return {
      status: "BLOCKED",
      reason: rawChunks.length === 0 ? "NO_SUPPORTING_CHUNKS" : "ALL_CHUNKS_LOW_CREDIBILITY"
    };
  }

  // Build supporting_chunks (excerpt capped at 200 chars per §5 schema)
  const supporting_chunks = eligibleChunks.map(c => ({
    chunk_id:        c.chunk_id,
    source_id:       c.source_id,
    relevance_score: c.relevance_score,
    excerpt:         (c.text || "").slice(0, 200)
  }));

  // Confidence from max relevance_score across eligible chunks
  const maxRelevance = Math.max(...supporting_chunks.map(sc => sc.relevance_score));
  const confidence   = _scoreToConfidence(maxRelevance);

  // Deterministic ID
  const chunkIds = supporting_chunks.map(sc => sc.chunk_id);
  const cit_id   = citId(claim_text, chunkIds);

  const record = {
    schema_version:   "1.0.0",
    id:               cit_id,
    claim_text,
    claim_location,
    supporting_chunks,
    confidence,
    synthesized_by,
    synthesized_at:   new Date().toISOString()
  };

  // Fail-closed: schema must pass before any persistence
  const validation = validateCitationRecord(record);
  if (!validation.valid) {
    throw new Error("CitationRecord schema validation failed: " + validation.errors.join("; "));
  }

  manifests.appendCitation(record, project_id, scope, { root });

  return { status: "OK", citation: record };
}

module.exports = { synthesizeCitation };
