"use strict";

// ── Mode constants ────────────────────────────────────────────────────────────

const ALL_MODES = [
  "READ_ONLY",
  "WORKSPACE_WRITE",
  "DANGER_FULL_ACCESS",
  "PROMPT",
  "TEST"
];

const DATA_MODE_ORDER = ["READ_ONLY", "WORKSPACE_WRITE", "DANGER_FULL_ACCESS"];
const CONTROL_MODES   = ["PROMPT", "TEST"];

// ── Predicates ────────────────────────────────────────────────────────────────

function isValid(mode) {
  return ALL_MODES.includes(String(mode));
}

function isDataMode(mode) {
  return DATA_MODE_ORDER.includes(String(mode));
}

function isControlMode(mode) {
  return CONTROL_MODES.includes(String(mode));
}

// ── Ordering helpers ──────────────────────────────────────────────────────────

function _dataIndex(mode) {
  const i = DATA_MODE_ORDER.indexOf(String(mode));
  if (i === -1) throw new TypeError("Not a data mode: " + mode);
  return i;
}

function compareDataModes(a, b) {
  const ia = _dataIndex(a);
  const ib = _dataIndex(b);
  if (ia < ib) return -1;
  if (ia > ib) return  1;
  return 0;
}

function dataModeSatisfies(active, required) {
  return _dataIndex(active) >= _dataIndex(required);
}

// ── Context resolution ────────────────────────────────────────────────────────

function resolveActiveContext(activeMode, options) {
  const opts = options || {};
  const mode = String(activeMode || "WORKSPACE_WRITE");

  if (isDataMode(mode)) {
    return { data_mode: mode, control_mode: null };
  }

  if (isControlMode(mode)) {
    const inherited = opts.inherited_data_mode;
    const data_mode = (inherited && isDataMode(inherited)) ? inherited : "WORKSPACE_WRITE";
    return { data_mode, control_mode: mode };
  }

  // Unknown mode — fail-closed to READ_ONLY
  return { data_mode: "READ_ONLY", control_mode: null };
}

// ── Environment reader (W-03: only FORGE_PERMISSION_MODE + FORGE_ALLOW_SELF_MODIFY) ──

function fromEnv(env) {
  const e = env || process.env;

  // W-03 enforcement: do NOT read FORGE_DECISION_OVERRIDE.
  // Only these two env vars are permitted by the L3 contract.
  const raw = String(e.FORGE_PERMISSION_MODE || "WORKSPACE_WRITE").toUpperCase().trim();
  if (!isValid(raw)) return "WORKSPACE_WRITE";

  // DANGER_FULL_ACCESS requires explicit opt-in
  if (raw === "DANGER_FULL_ACCESS" && String(e.FORGE_ALLOW_SELF_MODIFY || "") !== "1") {
    return "WORKSPACE_WRITE";
  }

  return raw;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  ALL_MODES,
  DATA_MODE_ORDER,
  CONTROL_MODES,
  isValid,
  isDataMode,
  isControlMode,
  compareDataModes,
  dataModeSatisfies,
  resolveActiveContext,
  fromEnv
};
