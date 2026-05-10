"use strict";

// Cost ledger — append-only JSONL at artifacts/agent/cost_ledger.jsonl.
//
// Uses direct fs (same pattern as toolAuditLog.js and permissionPolicy.js audit).
// This is the established infrastructure exception: calling L2 tools from within
// an L2 tool's execute() would cause re-entrancy. See §ARC-1 in decision artifact.

const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

const LEDGER_REL = path.join("artifacts", "agent", "cost_ledger.jsonl");

function _ledgerPath(root) {
  return path.resolve(root || process.cwd(), LEDGER_REL);
}

function _ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Schema validation ─────────────────────────────────────────────────────────

const VALID_OUTCOMES = ["success", "failed", "budget_exceeded", "timeout", "auth_error"];

function _validateEntry(entry) {
  if (!entry || typeof entry !== "object") return ["entry must be an object"];
  const errs = [];
  if (typeof entry.project_id !== "string" || !entry.project_id)  errs.push("project_id required");
  if (typeof entry.provider   !== "string" || !entry.provider)    errs.push("provider required");
  if (typeof entry.model      !== "string")                        errs.push("model required");
  if (!VALID_OUTCOMES.includes(entry.outcome))                     errs.push("outcome must be one of: " + VALID_OUTCOMES.join(", "));
  return errs;
}

// ── appendEntry ───────────────────────────────────────────────────────────────

function appendEntry(entry, options) {
  const root = (options && options.root) || process.cwd();
  const errs = _validateEntry(entry);
  if (errs.length > 0) {
    throw new Error("LEDGER_INVALID_ENTRY: " + errs.join("; "));
  }

  const record = {
    ts:                 new Date().toISOString(),
    invocation_id:      entry.invocation_id || crypto.randomUUID(),
    project_id:         entry.project_id,
    provider:           entry.provider,
    model:              entry.model || "",
    role:               entry.role  || null,
    tokens_in:          typeof entry.tokens_in  === "number" ? entry.tokens_in  : 0,
    tokens_out:         typeof entry.tokens_out === "number" ? entry.tokens_out : 0,
    latency_ms:         typeof entry.latency_ms === "number" ? entry.latency_ms : 0,
    cost_usd_estimated: typeof entry.cost_usd_estimated === "number" ? entry.cost_usd_estimated : 0,
    cost_usd_actual:    typeof entry.cost_usd_actual    === "number" ? entry.cost_usd_actual    : 0,
    outcome:            entry.outcome
  };

  const filePath = _ledgerPath(root);
  try {
    _ensureDir(filePath);
    fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    throw new Error("LEDGER_WRITE_FAILED: " + err.message);
  }

  return record;
}

// ── readEntries ───────────────────────────────────────────────────────────────

function readEntries(filter, options) {
  const root = (options && options.root) || process.cwd();
  const filePath = _ledgerPath(root);

  if (!fs.existsSync(filePath)) return [];

  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error("LEDGER_READ_FAILED: " + err.message);
  }

  const entries = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed);
      if (!filter) { entries.push(rec); continue; }
      if (filter.project_id && rec.project_id !== filter.project_id) continue;
      if (filter.provider   && rec.provider   !== filter.provider)   continue;
      if (filter.since      && rec.ts < filter.since)                 continue;
      entries.push(rec);
    } catch { /* skip malformed lines */ }
  }

  return entries;
}

// ── getTotalCost ──────────────────────────────────────────────────────────────

function getTotalCost(project_id, options) {
  const entries = readEntries({ project_id }, options);
  let total = 0;
  for (const e of entries) {
    const actual = typeof e.cost_usd_actual === "number" ? e.cost_usd_actual : 0;
    total += actual;
  }
  return Math.round(total * 100000) / 100000;
}

// ── isLedgerWritable ──────────────────────────────────────────────────────────

function isLedgerWritable(options) {
  const root = (options && options.root) || process.cwd();
  const filePath = _ledgerPath(root);
  try {
    _ensureDir(filePath);
    // Try to open for append — if it exists, this is a no-op; if not, it creates empty.
    const fd = fs.openSync(filePath, "a");
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

module.exports = { appendEntry, readEntries, getTotalCost, isLedgerWritable };
