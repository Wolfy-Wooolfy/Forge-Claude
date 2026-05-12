"use strict";

// L-KB-4 Retrieval — embed query, search vector store, post-filter by credibility.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §1 (L-KB-4), §6 (RetrievalResult)
//
// Track A: no direct fetch(), no direct fs.*, no new OpenAI().
//   - Embedding via getClient() (Provider Contract v2)
//   - Vector search via storage_lance.searchVector()
//   - Credibility post-filter via manifests.readSources() (§ARC-4 covers manifests.js)

const { getClient }               = require("../../providers/_contract/openAiAdapter");
const { openStore, searchVector } = require("./storage_lance");
const { readSources }             = require("./manifests");
const {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  CREDIBILITY_FLOOR_DEFAULT,
  RETRIEVAL_K_DEFAULT
} = require("./_constants");

// ── Credibility tier ordering ─────────────────────────────────────────────────

const TIER_RANK = { LOW: 0, COMMUNITY: 1, REPUTABLE: 2, AUTHORITATIVE: 3 };

function _tierRank(tier) {
  return TIER_RANK[tier] != null ? TIER_RANK[tier] : -1;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Retrieve the top-k chunks most relevant to queryText, filtered by credibility.
 *
 * @param {string} queryText
 * @param {{
 *   project_id: string,
 *   scope?: "project"|"global",
 *   k?: number,
 *   credibility_floor?: string,
 *   root?: string,
 *   _client?: object
 * }} options
 * @returns {Promise<Array<{
 *   chunk_id: string,
 *   source_id: string,
 *   text: string,
 *   relevance_score: number,
 *   credibility_tier: string|null,
 *   section_heading: string|null,
 *   ordinal: number
 * }>>}
 */
async function retrieve(queryText, options) {
  const opts              = options || {};
  const project_id        = opts.project_id || "";
  const scope             = opts.scope || "project";
  const k                 = opts.k || RETRIEVAL_K_DEFAULT;
  const credibility_floor = opts.credibility_floor || CREDIBILITY_FLOOR_DEFAULT;
  const root              = opts.root || process.cwd();
  const floorRank         = _tierRank(credibility_floor);

  // 1. Embed the query (Provider Contract v2 — no new OpenAI())
  const client      = opts._client || getClient();
  const embResponse = await client.embeddings.create({
    model:      EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input:      queryText
  });
  const queryVec = embResponse.data[0].embedding;

  // 2. Vector search — retrieve k*4 candidates to allow for credibility post-filter
  const store      = await openStore(project_id, scope, { root });
  const rawResults = await searchVector(store, queryVec, k * 4, {});

  if (!rawResults || rawResults.length === 0) {
    return [];
  }

  // 3. Build credibility tier map: source_id → tier
  const sources = readSources(project_id, scope, { root });
  const tierMap = new Map(
    sources.map(s => [s.id, (s.credibility && s.credibility.tier) || null])
  );

  // 4. Post-filter by credibility_floor, then slice to k
  const filtered = rawResults
    .filter(r => _tierRank(tierMap.get(r.source_id) || null) >= floorRank)
    .slice(0, k);

  // 5. Annotate with credibility tier and normalise field names
  return filtered.map(r => ({
    chunk_id:        r.id,
    source_id:       r.source_id,
    text:            r.text,
    relevance_score: r.relevance_score != null ? r.relevance_score : 0,
    credibility_tier: tierMap.get(r.source_id) || null,
    section_heading: r.section_heading || null,
    ordinal:         r.ordinal
  }));
}

module.exports = { retrieve };
