"use strict";

// Activity emitter — append-only JSONL at artifacts/agent/activity.jsonl.
//
// Uses direct fs (§ARC-1 precedent: same pattern as cost_ledger.js).
// All writes are best-effort — failures never block role execution.

const fs   = require("fs");
const path = require("path");

const ACTIVITY_LOG_REL = path.join("artifacts", "agent", "activity.jsonl");

function _logPath(root) {
  return path.resolve(root || process.cwd(), ACTIVITY_LOG_REL);
}

function _ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const VALID_STATES = new Set([
  "INVOKING_ADAPTER", "PARSING_OUTPUT", "VALIDATING_SCHEMA", "COMPLETED", "FAILED"
]);

// ── emit ──────────────────────────────────────────────────────────────────────

function emit(event, options) {
  try {
    if (!event || typeof event !== "object") return;
    if (!event.project_id || !event.role || !event.state) return;

    const root    = (options && options.root) || process.cwd();
    const logPath = _logPath(root);

    const entry = {
      ts:             event.ts || new Date().toISOString(),
      event:          "role.activity",
      invocation_id:  event.invocation_id  || null,
      project_id:     event.project_id,
      role:           event.role,
      state:          event.state,
      indicator:      event.indicator      || null,
      duration_ms:    event.duration_ms    !== undefined ? event.duration_ms : null,
      outcome:        event.outcome        || null
    };

    _ensureDir(logPath);
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
  } catch (_err) {
    // best-effort — never throw, never block role execution
  }
}

// ── readEntries ───────────────────────────────────────────────────────────────

function readEntries(filter, options) {
  try {
    const root    = (options && options.root) || process.cwd();
    const logPath = _logPath(root);

    if (!fs.existsSync(logPath)) return [];

    const lines = fs.readFileSync(logPath, "utf8")
      .split("\n")
      .filter(l => l.trim());

    let entries = lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    if (filter) {
      if (filter.project_id) entries = entries.filter(e => e.project_id === filter.project_id);
      if (filter.role)       entries = entries.filter(e => e.role === filter.role);
      if (filter.state)      entries = entries.filter(e => e.state === filter.state);
      if (filter.since)      entries = entries.filter(e => e.ts >= filter.since);
    }

    return entries;
  } catch {
    return [];
  }
}

module.exports = { emit, readEntries, VALID_STATES };
