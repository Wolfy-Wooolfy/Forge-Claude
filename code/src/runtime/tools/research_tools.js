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
      root:       (ctx && ctx.root) || process.cwd(),
      _reg:       (ctx && ctx._reg) || null
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

// ── 2. research.search_web ────────────────────────────────────────────────────

// Fixed cost estimate per search call (conservative; real costs are sub-cent).
const SEARCH_COST_USD = 0.005;

// Normalize Brave results array to [{url, title, snippet}]
function _normalizeBrave(parsed) {
  const webResults = (parsed && parsed.web && parsed.web.results) || [];
  return webResults.map(r => ({
    url:     r.url     || "",
    title:   r.title   || "",
    snippet: r.description || r.extra_snippets && r.extra_snippets[0] || ""
  }));
}

// Normalize Tavily results array to [{url, title, snippet}]
function _normalizeTavily(parsed) {
  const results = (parsed && parsed.results) || [];
  return results.map(r => ({
    url:     r.url     || "",
    title:   r.title   || "",
    snippet: r.content || ""
  }));
}

const search_web = defineTool({
  name: "research.search_web",
  description: "Search the web using Brave Search API (primary) with Tavily fallback. Returns credibility-tiered result URLs.",
  required_mode: "WORKSPACE_WRITE",

  preview(input) {
    return Promise.resolve({
      status:   "PREVIEWED",
      output:   { would_search: input.query, would_use_max_results: input.max_results || 5 },
      metadata: {}
    });
  },

  input_schema: {
    type: "object",
    properties: {
      query:             { type: "string",  description: "Search query" },
      project_id:        { type: "string",  description: "Project ID for cost ledger" },
      max_results:       { type: "number",  description: "Max results to return (default 5)" },
      credibility_floor: { type: "string",  description: "Min credibility tier (default REPUTABLE)" }
    },
    required: ["query", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      status:        { type: "string",  description: "SUCCESS | FAILED" },
      results:       { type: "array",   description: "[{url, title, snippet}]" },
      provider_used: { type: "string",  description: "brave | tavily" },
      cost_usd:      { type: "number",  description: "Fixed cost estimate for this call" }
    },
    required: ["status"]
  },

  async execute(input, ctx) {
    const root       = (ctx && ctx.root) || process.cwd();
    const maxResults = input.max_results || 5;
    const { BRAVE_SEARCH_API_BASE, TAVILY_API_BASE } = require("../kb/_constants");
    const { appendEntry } = require("../kb/cost_ledger");

    // Lazy require registry — avoid circular dep at module load; ctx._reg for test injection
    const { getDefaultRegistry } = require("./_registry");
    const reg = (ctx && ctx._reg) || getDefaultRegistry();
    const regCtx = { root };

    let results       = null;
    let providerUsed  = null;

    // ── Brave (primary) ───────────────────────────────────────────────────────
    const braveKey = process.env.BRAVE_SEARCH_API_KEY;
    if (braveKey) {
      const braveUrl = BRAVE_SEARCH_API_BASE + "?q=" + encodeURIComponent(input.query) + "&count=" + maxResults;
      const braveEnv = await reg.invoke("http.get", {
        url:        braveUrl,
        headers:    { "X-Subscription-Token": braveKey, "Accept": "application/json" },
        timeout_ms: 10000
      }, regCtx);

      if (braveEnv && braveEnv.status === "SUCCESS" && braveEnv.output.status_code < 400) {
        try {
          const parsed = JSON.parse(braveEnv.output.body);
          results      = _normalizeBrave(parsed);
          providerUsed = "brave";
        } catch (_) { /* parse failure → fall through to Tavily */ }
      }
    }

    // ── Tavily (fallback) ─────────────────────────────────────────────────────
    if (!results) {
      const tavilyKey = process.env.TAVILY_API_KEY;
      if (tavilyKey) {
        const tavilyBody = JSON.stringify({ api_key: tavilyKey, query: input.query, max_results: maxResults });
        const tavilyEnv  = await reg.invoke("http.post", {
          url:        TAVILY_API_BASE,
          body:       tavilyBody,
          headers:    { "Content-Type": "application/json" },
          timeout_ms: 10000
        }, regCtx);

        if (tavilyEnv && tavilyEnv.status === "SUCCESS" && tavilyEnv.output.status_code < 400) {
          try {
            const parsed = JSON.parse(tavilyEnv.output.body);
            results      = _normalizeTavily(parsed);
            providerUsed = "tavily";
          } catch (_) { /* parse failure → both failed */ }
        }
      }
    }

    if (!results) {
      return failed("BOTH_PROVIDERS_FAILED", "Brave and Tavily both failed or no API keys configured");
    }

    // ── Record cost (§ARC-4 — cost_ledger direct fs) ──────────────────────────
    try {
      appendEntry({
        project_id: input.project_id,
        operation:  "web_search",
        cost_usd:   SEARCH_COST_USD,
        model:      providerUsed,
        tool:       "research.search_web",
        tokens_in:  0,
        tokens_out: 0
      }, { root });
    } catch (_) { /* cost ledger failure is non-fatal */ }

    return ok({ status: "SUCCESS", results, provider_used: providerUsed, cost_usd: SEARCH_COST_USD });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  tools: [fetch_url, search_web]
};
