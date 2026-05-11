"use strict";

/**
 * KB Cost Ledger — per-project JSONL append-only cost tracking.
 *
 * §ARC-4 Exception: This module uses Node's `fs` module directly for
 * append-only JSONL writes.
 *
 * Rationale: Called from inside L2 tool execute() functions before each
 * cost-incurring operation (research.search_web, kb.ingest_url, embedding
 * batches). Calling tools.fs.* would cause re-entrancy and inflate the
 * audit log with internal cost-tracking writes.
 *
 * Important — naming clarification:
 * This file is code/src/runtime/kb/cost_ledger.js (KB-layer, per-project).
 * It is DISTINCT from code/src/runtime/agents/cost_ledger.js (§ARC-1,
 * agent-layer, global cost ledger at artifacts/agent/cost_ledger.jsonl).
 * Both files legitimately exist; they serve different cost-tracking concerns
 * per KB Contract §9.
 *
 * Write pattern: fs.appendFileSync (line-level atomicity, sufficient for
 * ~200-byte lines — well below POSIX PIPE_BUF and NTFS small-write boundary).
 * The heavier .tmp → rename pattern is NOT used here per §ARC-4 §3.
 *
 * Same architectural reasoning as §ARC-1.
 *
 * This exception is BOUNDED to this file and code/src/runtime/kb/manifests.js.
 *
 * Formal authorization: artifacts/decisions/DECISION-202605132000-phase-9-arc-4-kb-manifest-fs-exception.md
 *
 * @see docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md §9 (Budget Cap Mechanism)
 */

const fs   = require("fs");
const path = require("path");
const { KB_BASE_REL, COST_LEDGER_REL } = require("./_constants");

// ── Path helper ───────────────────────────────────────────────────────────────

function _ledgerPath(project_id, root) {
  return path.resolve(root || process.cwd(), KB_BASE_REL, project_id, COST_LEDGER_REL);
}

function _ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ── Entry validation ──────────────────────────────────────────────────────────

const VALID_OPERATIONS = [
  "embedding",
  "credibility_scoring",
  "citation_synthesis",
  "web_search",
  "research_synthesis"
];

function _validateEntry(entry) {
  const errs = [];
  if (!entry || typeof entry !== "object")    return ["entry must be an object"];
  if (typeof entry.project_id !== "string")   errs.push("project_id required");
  if (!VALID_OPERATIONS.includes(entry.operation)) errs.push("operation invalid: " + entry.operation);
  if (typeof entry.cost_usd !== "number" || entry.cost_usd < 0) errs.push("cost_usd must be non-negative number");
  if (typeof entry.model !== "string")        errs.push("model required");
  if (typeof entry.tool !== "string")         errs.push("tool required");
  return errs;
}

// ── appendEntry ───────────────────────────────────────────────────────────────

function appendEntry(entry, options) {
  const opts = options || {};
  const errs = _validateEntry(entry);
  if (errs.length > 0) throw new Error("KB cost_ledger validation: " + errs.join("; "));

  const full = Object.assign({
    ts:         new Date().toISOString(),
    tokens_in:  0,
    tokens_out: 0
  }, entry);

  const p = _ledgerPath(entry.project_id, opts.root);
  _ensureDir(p);
  fs.appendFileSync(p, JSON.stringify(full) + "\n", "utf8");
  return full;
}

// ── sumCost ───────────────────────────────────────────────────────────────────

function sumCost(project_id, options) {
  const opts = options || {};
  const p    = _ledgerPath(project_id, opts.root);
  if (!fs.existsSync(p)) return { total_usd: 0, entries: 0 };

  const lines   = fs.readFileSync(p, "utf8")
    .split("\n")
    .filter(l => l.trim().length > 0);

  let total = 0;
  let count = 0;
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      if (typeof rec.cost_usd === "number") {
        total += rec.cost_usd;
        count++;
      }
    } catch (_) { /* skip malformed lines */ }
  }
  return { total_usd: total, entries: count };
}

// ── readAll ───────────────────────────────────────────────────────────────────

function readAll(project_id, options) {
  const opts = options || {};
  const p    = _ledgerPath(project_id, opts.root);
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8")
    .split("\n")
    .filter(l => l.trim().length > 0);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch (_) { /* skip */ }
  }
  return out;
}

module.exports = {
  appendEntry,
  sumCost,
  readAll,
  _ledgerPath
};
