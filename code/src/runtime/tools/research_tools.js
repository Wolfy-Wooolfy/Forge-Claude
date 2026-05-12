"use strict";

// L2 Research Tools — source acquisition and web search.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §1 (L-KB-1)
// @see artifacts/decisions/DECISION-202605131900-phase-9-readiness.md §5.1
//
// Track A: tools in this file use http.get/http.post via the registry,
// NOT direct fetch(). Side effects go through L2 tool infrastructure.
//
// research.fetch_url — wraps source_acquisition.acquireSource (L-KB-1)
// research.search_web — Brave primary + Tavily fallback (added post-midstage)

const { defineTool, ok, failed } = require("./_contract");

// ── 1. research.fetch_url ─────────────────────────────────────────────────────

const fetch_url = defineTool({
  name: "research.fetch_url",
  description: "Fetch a URL, extract its text content, and persist a SourceRecord in the project KB. Deduplicates by URL hash.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      url:        { type: "string",  description: "URL to fetch and ingest" },
      project_id: { type: "string",  description: "Project ID for KB storage" },
      scope:      { type: "string",  description: "\"project\" (default) or \"global\"" }
    },
    required: ["url", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      status:               { type: "string",  description: "OK | DUPLICATE | REJECTED" },
      src_id:               { type: "string",  description: "Deterministic src_<12hex> ID" },
      deduped:              { type: "boolean", description: "true if URL was already in KB" },
      content_type:         { type: "string",  description: "Detected content type" },
      extracted_text_size:  { type: "number",  description: "Character count of extracted text" },
      reason:               { type: "string",  description: "Present on REJECTED status" }
    },
    required: ["status", "src_id", "deduped"]
  },

  preview(input) {
    const { srcId } = require("../kb/_id_minting");
    const src_id    = srcId(input.url);
    return Promise.resolve({
      status:    "PREVIEWED",
      output:    { would_fetch: input.url, would_dedup_if_exists: src_id },
      metadata:  {}
    });
  },

  async execute(input, ctx) {
    const { acquireSource } = require("../kb/source_acquisition");
    const result = await acquireSource(input.url, {
      project_id: input.project_id,
      scope:      input.scope || "project",
      root:       (ctx && ctx.root) || process.cwd()
    });

    const out = {
      status:  result.status,
      src_id:  result.source ? result.source.id : require("../kb/_id_minting").srcId(input.url),
      deduped: result.deduped || false
    };

    if (result.source && result.source.content_type) {
      out.content_type = result.source.content_type;
    }
    if (result.source && result.source.extracted_text_size !== undefined) {
      out.extracted_text_size = result.source.extracted_text_size;
    }
    if (result.reason) {
      out.reason = result.reason;
    }

    if (result.status === "REJECTED") {
      return failed(result.reason || "FETCH_REJECTED", null, out);
    }

    return ok(out);
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [fetch_url]
};
