"use strict";

// L2 KB Tools — knowledge-base operations exposed as L2 tools.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §1, §5, §7
//
// Track A: no direct fetch(), no direct fs.*Sync, no new OpenAI().
//   All writes go through registry tools or §ARC-4 bounded modules.
//
// Tools implemented here (6 total, first 3 in Stage 9.5 Step G):
//   kb.ingest_url       — fetch + chunk + embed + store in vector DB
//   kb.retrieve         — embed query + vector search + credibility post-filter
//   kb.cite             — synthesize CitationRecord from retrieval chunks
//   kb.list_sources     — list source manifests for a project (Step H)
//   kb.delete_source    — remove source record and chunks (Step H)
//   kb.validate_citations — audit artifact for uncited claims (Step H)

const { defineTool, ok, failed } = require("./_contract");

// ── Lazy module imports (avoid circular deps at load time) ───────────────────

function _acq()   { return require("../kb/source_acquisition"); }
function _chunk() { return require("../kb/chunking_engine"); }
function _emb()   { return require("../kb/embedding_engine"); }
function _store() { return require("../kb/storage_lance"); }
function _man()   { return require("../kb/manifests"); }
function _ret()   { return require("../kb/retrieval"); }
function _cit()   { return require("../kb/citation_engine"); }
function _cv()    { return require("../kb/citation_validator"); }
function _bg()    { return require("../kb/budget_guard"); }

// ── 1. kb.ingest_url ─────────────────────────────────────────────────────────

const ingest_url = defineTool({
  name:          "kb.ingest_url",
  description:   "Fetch a URL, chunk its text, embed the chunks, and store them in the project vector KB. Deduplicates by URL hash.",
  required_mode: "WORKSPACE_WRITE",

  input_schema: {
    type: "object",
    properties: {
      url:        { type: "string",  description: "URL to ingest" },
      project_id: { type: "string",  description: "Project ID for KB storage" },
      scope:      { type: "string",  description: "\"project\" (default) or \"global\"" }
    },
    required: ["url", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      status:         { type: "string",  description: "OK | DUPLICATE | REJECTED" },
      src_id:         { type: "string",  description: "SourceRecord ID" },
      chunks_created: { type: "number",  description: "Number of chunks embedded and stored" },
      deduped:        { type: "boolean", description: "true if URL was already in KB" }
    },
    required: ["status", "src_id", "deduped"]
  },

  preview(input) {
    const { srcId } = require("../kb/_id_minting");
    return Promise.resolve({
      status:  "PREVIEWED",
      output:  { would_ingest: input.url, would_dedup_if_exists: srcId(input.url) },
      metadata: {}
    });
  },

  async execute(input, ctx) {
    const root       = (ctx && ctx.root) || process.cwd();
    const project_id = input.project_id;
    const scope      = input.scope || "project";

    // Budget check before any API calls
    try {
      _bg().enforceBudget(project_id, { root });
    } catch (budgetErr) {
      return failed("BUDGET_EXCEEDED", budgetErr.message);
    }

    // Step 1: Acquire source (fetch + dedup + source JSON + manifest)
    const acqResult = await _acq().acquireSource(input.url, {
      project_id,
      scope,
      root,
      _reg: (ctx && ctx._reg) || null
    });

    if (acqResult.status === "DUPLICATE") {
      return ok({ status: "DUPLICATE", src_id: acqResult.source.id, chunks_created: 0, deduped: true });
    }
    if (acqResult.status === "REJECTED") {
      return failed(acqResult.reason || "FETCH_REJECTED", null, {
        status: "REJECTED",
        src_id: require("../kb/_id_minting").srcId(input.url),
        chunks_created: 0,
        deduped: false
      });
    }

    const sourceRecord   = acqResult.source;
    const extractedText  = acqResult.extracted_text || "";

    // Step 2: Chunk
    const skeletons = _chunk().chunkSource(sourceRecord, extractedText);

    if (skeletons.length === 0) {
      return ok({ status: "OK", src_id: sourceRecord.id, chunks_created: 0, deduped: false });
    }

    // Step 3: Embed (fills embedding field in-place)
    const embOpts = { project_id, root, _client: (ctx && ctx._client) || null };
    await _emb().embedChunks(skeletons, embOpts);

    // Step 4: Store in LanceDB
    const store = await _store().openStore(project_id, scope, { root });
    await _store().insertChunks(store, skeletons);

    // Step 5: Append chunk manifests (§ARC-4 covers manifests.js)
    for (const chk of skeletons) {
      _man().appendChunk(chk, project_id, scope, { root });
    }

    // Warn if budget now at 70%+
    try { _bg().logWarnIfNeeded(project_id, { root }); } catch (_) {}

    return ok({ status: "OK", src_id: sourceRecord.id, chunks_created: skeletons.length, deduped: false });
  }
});

// ── 2. kb.retrieve ────────────────────────────────────────────────────────────

const retrieve = defineTool({
  name:          "kb.retrieve",
  description:   "Embed a query, search the project vector KB, and return the top-k chunks filtered by credibility tier.",
  required_mode: "READ_ONLY",
  is_read_only:  true,

  input_schema: {
    type: "object",
    properties: {
      query:             { type: "string",  description: "Natural language query" },
      project_id:        { type: "string",  description: "Project ID to search" },
      k:                 { type: "number",  description: "Max results to return (default 5)" },
      credibility_floor: { type: "string",  description: "Min tier: AUTHORITATIVE|REPUTABLE|COMMUNITY (default REPUTABLE)" },
      scope:             { type: "string",  description: "\"project\" (default) or \"global\"" }
    },
    required: ["query", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        description: "[{chunk_id, source_id, text, relevance_score, credibility_tier, section_heading, ordinal}]"
      }
    },
    required: ["results"]
  },

  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const results = await _ret().retrieve(input.query, {
      project_id:        input.project_id,
      scope:             input.scope || "project",
      k:                 input.k,
      credibility_floor: input.credibility_floor,
      root,
      _client: (ctx && ctx._client) || null
    });
    return ok({ results });
  }
});

// ── 3. kb.cite ────────────────────────────────────────────────────────────────

const cite = defineTool({
  name:          "kb.cite",
  description:   "Synthesize a CitationRecord linking a claim in an artifact to supporting KB chunks. Rejects if all supporting chunks are LOW credibility.",
  required_mode: "WORKSPACE_WRITE",

  input_schema: {
    type: "object",
    properties: {
      claim_text: {
        type: "string",
        description: "The verbatim claim text from the artifact (min 10 chars)"
      },
      claim_location: {
        type: "object",
        description: "{ artifact_path: string, line_range: [start, end] }",
        properties: {
          artifact_path: { type: "string" },
          line_range:    { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }
        },
        required: ["artifact_path", "line_range"]
      },
      chunks: {
        type: "array",
        description: "Retrieval results from kb.retrieve — [{chunk_id, source_id, text, relevance_score, credibility_tier}]"
      },
      synthesized_by: {
        type: "string",
        description: "\"documentation\" | \"architect\" | \"research\" (default \"research\")"
      },
      project_id: { type: "string" },
      scope:      { type: "string",  description: "\"project\" (default) or \"global\"" }
    },
    required: ["claim_text", "claim_location", "chunks", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      cit_id:     { type: "string",  description: "Generated CitationRecord ID (cit_<12hex>)" },
      confidence: { type: "string",  description: "HIGH | MEDIUM | LOW" },
      status:     { type: "string",  description: "OK | BLOCKED" }
    },
    required: ["status"]
  },

  preview(input) {
    return Promise.resolve({
      status:  "PREVIEWED",
      output:  {
        would_cite_claim: (input.claim_text || "").slice(0, 80),
        would_use_chunks:  (input.chunks || []).length
      },
      metadata: {}
    });
  },

  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();

    const result = _cit().synthesizeCitation({
      claim_text:     input.claim_text,
      claim_location: input.claim_location,
      chunks:         input.chunks || [],
      synthesized_by: input.synthesized_by || "research",
      project_id:     input.project_id,
      scope:          input.scope || "project",
      root
    });

    if (result.status === "BLOCKED") {
      return failed(result.reason, null, { status: "BLOCKED", reason: result.reason });
    }

    return ok({
      status:     "OK",
      cit_id:     result.citation.id,
      confidence: result.citation.confidence
    });
  }
});

// ── Steps H tools (kb.list_sources, kb.delete_source, kb.validate_citations) ──
// Implemented in Stage 9.5 Step H after mid-stage checkpoint.

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [ingest_url, retrieve, cite]
};
