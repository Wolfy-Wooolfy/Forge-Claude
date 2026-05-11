"use strict";

/**
 * KB Manifests — JSONL atomic append for sources, chunks, citations exports.
 *
 * §ARC-4 Exception: This module uses Node's `fs` module directly for atomic
 * JSONL append operations (write to .tmp → fsync → rename pattern per
 * docs/12_ai_os/22 §11.2).
 *
 * Rationale: Called from inside L2 tool execute() functions
 * (kb.ingest_url, kb.cite, kb.list_sources, research.search_web, etc.).
 * Calling tools.fs.* from these call sites would cause re-entrancy and
 * audit log pollution. L2 fs tools also do not currently expose the
 * atomic .tmp/fsync/rename pattern this module must implement.
 *
 * Same architectural reasoning as §ARC-1 (agents infrastructure modules).
 *
 * This exception is BOUNDED to this file and code/src/runtime/kb/cost_ledger.js.
 * Other files under code/src/runtime/kb/ MUST NOT use fs directly.
 *
 * Formal authorization: artifacts/decisions/DECISION-202605132000-phase-9-arc-4-kb-manifest-fs-exception.md
 *
 * @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §11 (JSONL Export Format)
 */

const fs   = require("fs");
const path = require("path");
const { KB_BASE_REL, KB_GLOBAL_BASE_REL, EXPORTS_REL } = require("./_constants");

// ── Path helpers ──────────────────────────────────────────────────────────────

function _exportsDir(project_id, scope, root) {
  const base = path.resolve(root || process.cwd());
  if (scope === "global") {
    return path.join(base, KB_GLOBAL_BASE_REL, EXPORTS_REL);
  }
  return path.join(base, KB_BASE_REL, project_id, EXPORTS_REL);
}

function _sourcesPath(project_id, scope, root) {
  if (scope === "global") {
    return path.join(path.resolve(root || process.cwd()), KB_GLOBAL_BASE_REL, EXPORTS_REL, "sources.jsonl");
  }
  return path.join(path.resolve(root || process.cwd()), KB_BASE_REL, project_id, EXPORTS_REL, "sources.jsonl");
}

function _chunksPath(project_id, scope, root) {
  if (scope === "global") {
    return path.join(path.resolve(root || process.cwd()), KB_GLOBAL_BASE_REL, EXPORTS_REL, "chunks.jsonl");
  }
  return path.join(path.resolve(root || process.cwd()), KB_BASE_REL, project_id, EXPORTS_REL, "chunks.jsonl");
}

function _citationsPath(project_id, scope, root) {
  if (scope === "global") {
    return path.join(path.resolve(root || process.cwd()), KB_GLOBAL_BASE_REL, EXPORTS_REL, "citations.jsonl");
  }
  return path.join(path.resolve(root || process.cwd()), KB_BASE_REL, project_id, EXPORTS_REL, "citations.jsonl");
}

// ── Atomic append (.tmp → fsync → rename) ────────────────────────────────────

// Per docs/12_ai_os/22 §11.2 and §ARC-4 artifact §3.
// NOTE: For files >10MB this degrades — a future optimization (PHASE-9b) can
// switch to incremental append + periodic fsync. For Stage 9.2 baseline,
// all per-project JSONL files are well below 10MB.

function _appendAtomic(filePath, recordJsonl) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "", "utf8");
  }

  const existing = fs.readFileSync(filePath, "utf8");
  const tmpPath  = filePath + ".tmp";
  const fd       = fs.openSync(tmpPath, "w");
  try {
    fs.writeFileSync(fd, existing + recordJsonl + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
}

// ── Public API ────────────────────────────────────────────────────────────────

function appendSource(sourceRecord, options) {
  const opts  = options || {};
  const scope = sourceRecord.scope || "project";
  const pid   = sourceRecord.project_id || "";
  const p     = _sourcesPath(pid, scope, opts.root);
  _appendAtomic(p, JSON.stringify(sourceRecord));
}

function appendChunk(chunkRecord, project_id, scope, options) {
  const opts = options || {};
  const p    = _chunksPath(project_id, scope, opts.root);
  _appendAtomic(p, JSON.stringify(chunkRecord));
}

function appendCitation(citationRecord, project_id, scope, options) {
  const opts = options || {};
  const p    = _citationsPath(project_id, scope, opts.root);
  _appendAtomic(p, JSON.stringify(citationRecord));
}

function readSources(project_id, scope, options) {
  const opts = options || {};
  const p    = _sourcesPath(project_id, scope, opts.root);
  return _readJsonl(p);
}

function readChunks(project_id, scope, options) {
  const opts = options || {};
  const p    = _chunksPath(project_id, scope, opts.root);
  return _readJsonl(p);
}

function readCitations(project_id, scope, options) {
  const opts = options || {};
  const p    = _citationsPath(project_id, scope, opts.root);
  return _readJsonl(p);
}

function exportPaths(project_id, scope, options) {
  const opts = options || {};
  return {
    sources:   _sourcesPath(project_id, scope, opts.root),
    chunks:    _chunksPath(project_id, scope, opts.root),
    citations: _citationsPath(project_id, scope, opts.root)
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw   = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter(l => l.trim().length > 0);
  const out   = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch (_) { /* skip malformed lines */ }
  }
  return out;
}

module.exports = {
  appendSource,
  appendChunk,
  appendCitation,
  readSources,
  readChunks,
  readCitations,
  exportPaths
};
