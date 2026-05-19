"use strict";

/**
 * §ARC-6 Exception: This module uses Node's `fs.appendFileSync`,
 * `fs.mkdirSync`, `fs.statSync`, `fs.renameSync`, and `fs.unlinkSync`
 * directly to write high-frequency log lines. Routing every log write
 * through L2 permissionPolicy → tool.execute() → audit record would
 * introduce unacceptable re-entrancy risk (every L2 tool call itself
 * generates log entries — circular dependency) and performance overhead
 * on the hot path. Authorized by DECISION-2026-05-18T11-30-phase-12-plan.md
 * §6 §ARC-6.
 *
 * This is NOT a license for fs.* direct use outside §ARC-6 scope. Any
 * other module wanting to log MUST use log_writer's public API (info/
 * warn/error), NOT fs.appendFileSync directly.
 */

const fs   = require("fs");
const path = require("path");

// ── Configuration ─────────────────────────────────────────────────────────────

const MAX_BYTES     = 10 * 1024 * 1024;  // 10 MB rotation threshold
const MAX_ROTATIONS = 5;                  // forge.log + .1 … .4 (4 rotated slots)

// ── Singleton state (lazy-initialized on first write) ────────────────────────

let _logsDir       = null;
let _mainLog       = null;
let _errorLog      = null;
let _initialized   = false;
let _rotationCount = 0;
let _lastWriteTs   = null;

// ── Initialization ────────────────────────────────────────────────────────────

function _ensureInit() {
  if (_initialized) return;
  _logsDir  = path.resolve(process.cwd(), "logs");
  _mainLog  = path.join(_logsDir, "forge.log");
  _errorLog = path.join(_logsDir, "forge.error.log");
  fs.mkdirSync(_logsDir, { recursive: true });
  _initialized = true;
}

// ── Rotation ──────────────────────────────────────────────────────────────────
//
// Policy: forge.log + forge.log.1 … forge.log.4 (MAX_ROTATIONS = 5 total files).
// When forge.log reaches MAX_BYTES:
//   1. Delete forge.log.4 (oldest rotated slot)  — unlinkSync (best-effort)
//   2. forge.log.3 → forge.log.4
//   3. forge.log.2 → forge.log.3
//   4. forge.log.1 → forge.log.2
//   5. forge.log   → forge.log.1
//   6. Next write starts a fresh forge.log.
// Same policy applied independently to forge.error.log.

function _rotate(filePath) {
  // Step 1: delete oldest rotated file (.4) — may not exist on fresh systems.
  // unlinkSync covered by §ARC-6 (integral part of rotation).
  const oldest = filePath + "." + (MAX_ROTATIONS - 1);   // forge.log.4
  try { fs.unlinkSync(oldest); } catch (_) {}

  // Step 2: shift .3→.4, .2→.3, .1→.2  (highest index first, avoids clobber)
  for (let i = MAX_ROTATIONS - 2; i >= 1; i--) {
    try { fs.renameSync(filePath + "." + i, filePath + "." + (i + 1)); } catch (_) {}
  }

  // Step 3: forge.log → forge.log.1
  try { fs.renameSync(filePath, filePath + ".1"); } catch (_) {}

  _rotationCount++;
}

function _rotateIfNeeded(filePath) {
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch (_) {
    return;  // file doesn't exist yet — no rotation needed
  }
  if (size >= MAX_BYTES) _rotate(filePath);
}

// ── Line formatting ───────────────────────────────────────────────────────────
//
// Format: <ISO-ts> | <LEVEL> | <message> | <JSON-context>
// Level is fixed-width 5 chars: "INFO " | "WARN " | "ERROR"

function _formatLine(level, message, context) {
  const ts  = new Date().toISOString();
  const lvl = level === "INFO" ? "INFO " : level === "WARN" ? "WARN " : "ERROR";
  const msg = String(message).replace(/\n/g, "\\n");
  const ctx = (context !== undefined && context !== null)
    ? JSON.stringify(context)
    : "{}";
  return ts + " | " + lvl + " | " + msg + " | " + ctx + "\n";
}

// ── Write helpers ─────────────────────────────────────────────────────────────

function _writeMain(line) {
  _rotateIfNeeded(_mainLog);
  fs.appendFileSync(_mainLog, line, "utf8");
  _lastWriteTs = new Date().toISOString();
}

function _writeError(line) {
  _rotateIfNeeded(_errorLog);
  fs.appendFileSync(_errorLog, line, "utf8");
}

// ── Public API ────────────────────────────────────────────────────────────────

function info(message, context) {
  _ensureInit();
  _writeMain(_formatLine("INFO", message, context));
}

function warn(message, context) {
  _ensureInit();
  const line = _formatLine("WARN", message, context);
  _writeMain(line);
  _writeError(line);
}

function error(message, context) {
  _ensureInit();
  const line = _formatLine("ERROR", message, context);
  _writeMain(line);
  _writeError(line);
}

function getStats() {
  if (!_initialized) {
    return { current_size_bytes: 0, rotation_count: _rotationCount, last_write_ts: null };
  }
  let size = 0;
  try { size = fs.statSync(_mainLog).size; } catch (_) {}
  return {
    current_size_bytes: size,
    rotation_count:     _rotationCount,
    last_write_ts:      _lastWriteTs
  };
}

// ── Test infrastructure (not production API) ─────────────────────────────────
//
// Allows test helpers to redirect log output to a temp directory so S201
// doesn't write to the real logs/ directory. Call before any log writes.

function _resetForTest(customLogsDir) {
  _initialized   = false;
  _rotationCount = 0;
  _lastWriteTs   = null;
  if (customLogsDir) {
    _logsDir   = path.resolve(customLogsDir);
    _mainLog   = path.join(_logsDir, "forge.log");
    _errorLog  = path.join(_logsDir, "forge.error.log");
    fs.mkdirSync(_logsDir, { recursive: true });
    _initialized = true;
  }
}

module.exports = { info, warn, error, getStats, _resetForTest };
