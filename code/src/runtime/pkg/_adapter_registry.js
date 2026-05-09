"use strict";

const fs   = require("fs");
const path = require("path");

const { checkPrivilegeInvariant } = require("./_adapter_contract");

const ADAPTERS_DIR = path.join(__dirname, "adapters");

let _cache     = null;
let _warnings  = [];

// ── Registry load ─────────────────────────────────────────────────────────────

function _loadAdapters() {
  const map  = new Map();
  const warns = [];

  let files;
  try {
    files = fs.readdirSync(ADAPTERS_DIR).filter(f => f.endsWith("_adapter.js"));
  } catch (err) {
    return { map, warns: ["adapter dir not found: " + err.message] };
  }

  for (const file of files) {
    let adapter;
    try {
      adapter = require(path.join(ADAPTERS_DIR, file));
    } catch (err) {
      warns.push("failed to load adapter '" + file + "': " + err.message);
      continue;
    }

    // Validate required fields
    if (!adapter || typeof adapter.id !== "string" || typeof adapter.tier !== "number") {
      warns.push("adapter '" + file + "' missing id or tier — skipped");
      continue;
    }
    if (typeof adapter.install !== "function" || typeof adapter.remove !== "function" ||
        typeof adapter.list    !== "function" || typeof adapter.audit  !== "function") {
      warns.push("adapter '" + adapter.id + "' missing required methods — skipped");
      continue;
    }

    // Privilege guard (Tier-3 invariant)
    const guard = checkPrivilegeInvariant(adapter);
    if (!guard.ok) {
      warns.push(guard.reason + " — skipped");
      continue;
    }

    if (map.has(adapter.id)) {
      warns.push("duplicate adapter id '" + adapter.id + "' in '" + file + "' — skipped");
      continue;
    }

    map.set(adapter.id, adapter);
  }

  return { map, warns };
}

// ── Public API ────────────────────────────────────────────────────────────────

function getAdapters() {
  if (!_cache) {
    const { map, warns } = _loadAdapters();
    _cache    = map;
    _warnings = warns;
  }
  return _cache;
}

function getAdapter(id) {
  return getAdapters().get(id) || null;
}

function getWarnings() {
  getAdapters(); // ensure loaded
  return _warnings.slice();
}

function resetAdapterCache() {
  _cache    = null;
  _warnings = [];
}

module.exports = { getAdapters, getAdapter, getWarnings, resetAdapterCache };
