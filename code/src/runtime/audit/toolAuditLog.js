"use strict";

const fs   = require("fs");
const path = require("path");

const AUDIT_REL = path.join("artifacts", "audit", "tool_audit.jsonl");

function logPath(root) {
  return path.resolve(root || process.cwd(), AUDIT_REL);
}

function appendAuditEntry(root, entry) {
  const file = logPath(root);
  const dir  = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry));
  fs.appendFileSync(file, line + "\n", "utf8");
  return file;
}

function readEntries(root, opts) {
  const { since_ts, tail } = opts || {};
  const file = logPath(root);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (since_ts && e.ts < since_ts) continue;
      entries.push(e);
    } catch { /* skip malformed */ }
  }
  if (tail && tail > 0) return entries.slice(-tail);
  return entries;
}

function countRecent(root, since_ts) {
  return readEntries(root, { since_ts }).length;
}

module.exports = { appendAuditEntry, readEntries, countRecent, logPath };
