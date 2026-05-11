"use strict";

// L-KB-2 Embedding Engine — fills ChunkRecord.embedding via OpenAI embeddings API.
// Uses Provider Contract v2's getClient() singleton; NO direct new OpenAI() here.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §4 (ChunkRecord v1.0.0)

const { getClient, withRetry, withTimeout, DEFAULT_TIMEOUT_MS } = require("../../providers/_contract/openAiAdapter");
const { appendEntry } = require("./cost_ledger");
const {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  EMBEDDING_BATCH_SIZE
} = require("./_constants");

// Per OpenAI pricing 2026: text-embedding-3-small = $0.020 / 1M tokens
const COST_PER_TOKEN = 0.020 / 1_000_000;

// ── embedChunks ───────────────────────────────────────────────────────────────

// Takes an array of ChunkRecord skeletons (no embedding field).
// Returns the same array with `embedding` field filled in-place.
// Options:
//   project_id   — for cost ledger (required)
//   root         — project root for cost ledger path
//   _client      — override OpenAI client (used by unit tests for mocking)
//   batch_size   — override batch size (default: EMBEDDING_BATCH_SIZE)

async function embedChunks(chunks, options) {
  if (!chunks || chunks.length === 0) return chunks;

  const opts       = options || {};
  const project_id = opts.project_id;
  const batchSize  = opts.batch_size || EMBEDDING_BATCH_SIZE;
  const client     = opts._client || getClient();

  // Process in batches
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.text);

    let response;
    await withRetry(async () => {
      const callPromise = client.embeddings.create({
        model:      EMBEDDING_MODEL,
        input:      texts,
        dimensions: EMBEDDING_DIMENSIONS
      });
      response = await withTimeout(callPromise, DEFAULT_TIMEOUT_MS, "embedding_engine");
    }, { max_attempts: 2, backoff_ms: [500, 2000], provider_id: "embedding_engine" });

    const data = response.data;
    if (!data || data.length !== batch.length) {
      throw new Error(
        "embedding_engine: OpenAI returned " + (data ? data.length : 0) +
        " embeddings for batch of " + batch.length
      );
    }

    // Validate dimensions
    for (const item of data) {
      if (!item.embedding || item.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          "embedding_engine: expected " + EMBEDDING_DIMENSIONS + " dims, got " +
          (item.embedding ? item.embedding.length : "null")
        );
      }
    }

    // Fill embeddings into chunk skeletons
    for (let j = 0; j < batch.length; j++) {
      batch[j].embedding       = data[j].embedding;
      batch[j].embedding_model = EMBEDDING_MODEL_ID;
    }

    // Record cost
    const usage       = response.usage || {};
    const totalTokens = usage.total_tokens || 0;
    const costUsd     = totalTokens * COST_PER_TOKEN;

    if (project_id) {
      appendEntry({
        project_id,
        operation:  "embedding",
        cost_usd:   costUsd,
        model:      EMBEDDING_MODEL_ID,
        tool:       "kb.ingest_url",
        tokens_in:  totalTokens,
        tokens_out: 0
      }, { root: opts.root });
    }
  }

  return chunks;
}

module.exports = { embedChunks };
