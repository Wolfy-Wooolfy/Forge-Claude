"use strict";

// L-KB-2 Chunking Engine — produces ChunkRecord skeletons (no embeddings yet).
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §4 (ChunkRecord v1.0.0)

const { chkId }              = require("./_id_minting");
const { CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS, CHUNK_STRATEGY_BY_TYPE } = require("./_constants");

// ── Public API ────────────────────────────────────────────────────────────────

// Returns an array of partial ChunkRecord objects (embedding field absent).
// Caller (embedding_engine) fills in embedding + schema_version.
function chunkSource(sourceRecord, extractedText, options) {
  if (!extractedText || typeof extractedText !== "string") return [];

  const opts       = options || {};
  const chunkSize  = opts.chunk_size  || CHUNK_SIZE_CHARS;
  const overlap    = opts.overlap     || CHUNK_OVERLAP_CHARS;
  const strategy   = opts.strategy    || CHUNK_STRATEGY_BY_TYPE[sourceRecord.content_type] || "fixed_v1";

  let rawChunks;
  if (strategy === "semantic_v1") {
    rawChunks = _semanticChunk(extractedText, chunkSize, overlap, sourceRecord.content_type);
  } else {
    rawChunks = _fixedChunk(extractedText, chunkSize, overlap);
  }

  return rawChunks.map((raw, ordinal) => ({
    schema_version:  "1.0.0",
    id:              chkId(sourceRecord.id, ordinal),
    source_id:       sourceRecord.id,
    ordinal,
    text:            raw.text,
    char_start:      raw.char_start,
    char_end:        raw.char_end,
    overlap_with_prev: ordinal === 0 ? 0 : overlap,
    // embedding: filled by embedding_engine
    embedding_model: "text-embedding-3-small@512",
    section_heading: raw.section_heading || null,
    metadata: {
      chunk_strategy: strategy,
      page: raw.page !== undefined ? raw.page : null
    }
  }));
}

// ── Fixed-size chunking (fixed_v1) ────────────────────────────────────────────

function _fixedChunk(text, chunkSize, overlap) {
  const chunks = [];
  let pos = 0;
  while (pos < text.length) {
    const end     = Math.min(pos + chunkSize, text.length);
    const chunk   = text.slice(pos, end);
    if (chunk.trim().length > 0) {
      chunks.push({ text: chunk, char_start: pos, char_end: end, section_heading: null });
    }
    if (end >= text.length) break;
    pos = end - overlap;
    if (pos <= 0) pos = end; // safety: no backwards movement
  }
  return chunks;
}

// ── Semantic chunking (semantic_v1) ───────────────────────────────────────────
// Splits on Markdown headings (# / ## / ###) and HTML heading tags (<h1>–<h6>).
// Headings mark section boundaries. Text between boundaries is chunked with
// fixed_v1 fallback if a section is larger than chunkSize.

const MD_HEADING_RE  = /^(#{1,6})\s+(.+)$/m;
const HTML_HEADING_RE = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;

function _extractSections(text, contentType) {
  const sections = [];

  if (contentType === "text/html") {
    // Split HTML on heading tags
    const parts = text.split(/<h[1-6][^>]*>.*?<\/h[1-6]>/i);
    let headingMatches = [];
    let m;
    const re = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
    while ((m = re.exec(text)) !== null) {
      // strip inner HTML tags from heading text
      headingMatches.push(m[1].replace(/<[^>]+>/g, "").trim());
    }
    parts.forEach((part, i) => {
      sections.push({
        heading: i === 0 ? null : (headingMatches[i - 1] || null),
        text: part.trim()
      });
    });
  } else {
    // Markdown — split on lines starting with #
    const lines = text.split("\n");
    let currentHeading = null;
    let buffer = [];

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        if (buffer.join("\n").trim().length > 0) {
          sections.push({ heading: currentHeading, text: buffer.join("\n").trim() });
        }
        currentHeading = match[2].trim();
        buffer = [];
      } else {
        buffer.push(line);
      }
    }
    if (buffer.join("\n").trim().length > 0) {
      sections.push({ heading: currentHeading, text: buffer.join("\n").trim() });
    }
  }

  return sections.filter(s => s.text.length > 0);
}

function _semanticChunk(text, chunkSize, overlap, contentType) {
  const sections = _extractSections(text, contentType);
  const chunks   = [];
  let   offset   = 0;

  if (sections.length === 0) {
    return _fixedChunk(text, chunkSize, overlap);
  }

  for (const section of sections) {
    const sectionStart = text.indexOf(section.text, offset);
    const sectionActualStart = sectionStart >= 0 ? sectionStart : offset;

    if (section.text.length <= chunkSize) {
      chunks.push({
        text:            section.text,
        char_start:      sectionActualStart,
        char_end:        sectionActualStart + section.text.length,
        section_heading: section.heading
      });
    } else {
      // Section too large — fall back to fixed chunking within this section
      const subChunks = _fixedChunk(section.text, chunkSize, overlap);
      for (const sub of subChunks) {
        chunks.push({
          text:            sub.text,
          char_start:      sectionActualStart + sub.char_start,
          char_end:        sectionActualStart + sub.char_end,
          section_heading: section.heading
        });
      }
    }

    offset = sectionActualStart + section.text.length;
  }

  return chunks;
}

module.exports = { chunkSource };
