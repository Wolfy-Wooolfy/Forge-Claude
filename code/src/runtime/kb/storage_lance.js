"use strict";

// LanceDB vector store wrapper for Forge KB Layer (L-KB-3).
// Track-A-clean: LanceDB owns its own disk I/O. No direct fs from our code.
// @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §2 (Storage Layout)

const path = require("path");
const ldb  = require("@lancedb/lancedb");
const { KB_BASE_REL, KB_GLOBAL_BASE_REL } = require("./_constants");

// ── Store registry (in-process connection cache) ──────────────────────────────

const _openConnections = new Map(); // key: storeKey → { db, table }

function _storeKey(project_id, scope) {
  return scope === "global" ? "__global__" : project_id;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function _dbDir(project_id, scope, root) {
  const base = path.resolve(root || process.cwd());
  if (scope === "global") {
    return path.join(base, KB_GLOBAL_BASE_REL, "chunks");
  }
  return path.join(base, KB_BASE_REL, project_id, "kb", "chunks");
}

const TABLE_NAME = "chunks";

// ── openStore ─────────────────────────────────────────────────────────────────

async function openStore(project_id, scope, options) {
  const opts  = options || {};
  const root  = opts.root || process.cwd();
  const key   = _storeKey(project_id, scope);

  if (_openConnections.has(key)) {
    return _openConnections.get(key);
  }

  const dbDir = _dbDir(project_id, scope, root);
  const db    = await ldb.connect(dbDir);

  // Table may not exist yet. We create it lazily on first insert.
  let table = null;
  const tableNames = await db.tableNames();
  if (tableNames.includes(TABLE_NAME)) {
    table = await db.openTable(TABLE_NAME);
  }

  const store = { db, table, project_id, scope, root, dbDir, key };
  _openConnections.set(key, store);
  return store;
}

// ── insertChunks ──────────────────────────────────────────────────────────────

async function insertChunks(store, chunks) {
  if (!chunks || chunks.length === 0) return { inserted: 0 };

  // LanceDB expects the vector field named "vector" for indexing.
  // We store the 512-dim embedding as "vector" and keep all ChunkRecord fields.
  const rows = chunks.map(chk => ({
    vector:          chk.embedding,          // 512-dim array (required by LanceDB for vector search)
    id:              chk.id,
    source_id:       chk.source_id,
    ordinal:         chk.ordinal,
    text:            chk.text,
    char_start:      chk.char_start,
    char_end:        chk.char_end,
    overlap_with_prev: chk.overlap_with_prev,
    embedding_model: chk.embedding_model,
    section_heading: chk.section_heading || "",
    chunk_strategy:  chk.metadata.chunk_strategy,
    page:            chk.metadata.page != null ? chk.metadata.page : -1
  }));

  if (!store.table) {
    // Create table on first insert
    store.table = await store.db.createTable(TABLE_NAME, rows, { mode: "overwrite" });
  } else {
    await store.table.add(rows);
  }

  return { inserted: rows.length };
}

// ── searchVector ──────────────────────────────────────────────────────────────

async function searchVector(store, queryEmbedding, k, filters) {
  if (!store.table) return [];

  const opts = filters || {};
  let q = store.table.vectorSearch(queryEmbedding).limit(k || 5);

  // Apply credibility_floor filter via post-filter (LanceDB doesn't filter on
  // fields not indexed — we filter in JS after retrieval using a larger limit)
  const rawLimit = opts.credibility_floor ? k * 4 : k;

  const raw = await store.table.vectorSearch(queryEmbedding)
    .limit(rawLimit)
    .toArray();

  if (!opts.credibility_floor) {
    return raw.slice(0, k).map(_toResult);
  }

  // Credibility filter requires caller to pass credibility_floor AND a map of
  // source_id → tier. Store doesn't know about credibility natively.
  // The retrieval.js module (L-KB-4) handles this by post-filtering with the
  // source manifest data. storage_lance.js returns raw results here.
  return raw.slice(0, k).map(_toResult);
}

function _toResult(row) {
  return {
    id:              row.id,
    source_id:       row.source_id,
    ordinal:         row.ordinal,
    text:            row.text,
    char_start:      row.char_start,
    char_end:        row.char_end,
    embedding_model: row.embedding_model,
    section_heading: row.section_heading || null,
    chunk_strategy:  row.chunk_strategy,
    relevance_score: row._distance != null ? Math.max(0, 1 - row._distance) : null
  };
}

// ── deleteBySource ────────────────────────────────────────────────────────────

async function deleteBySource(store, src_id) {
  if (!store.table) return { deleted: 0 };
  const before = await store.table.countRows();
  await store.table.delete("source_id = '" + src_id.replace(/'/g, "''") + "'");
  const after  = await store.table.countRows();
  return { deleted: before - after };
}

// ── closeStore ────────────────────────────────────────────────────────────────

async function closeStore(store) {
  if (!store) return;
  _openConnections.delete(store.key);
  // LanceDB Node.js bindings don't require explicit close; GC handles it.
  // We clear our reference to allow GC.
  store.table = null;
  store.db    = null;
}

// ── closeAll ──────────────────────────────────────────────────────────────────

async function closeAll() {
  for (const store of _openConnections.values()) {
    await closeStore(store);
  }
  _openConnections.clear();
}

// ── getTableInfo ──────────────────────────────────────────────────────────────

async function getTableInfo(store) {
  if (!store.table) return { exists: false, count: 0 };
  const count = await store.table.countRows();
  return { exists: true, count, dbDir: store.dbDir };
}

module.exports = {
  openStore,
  insertChunks,
  searchVector,
  deleteBySource,
  closeStore,
  closeAll,
  getTableInfo
};
