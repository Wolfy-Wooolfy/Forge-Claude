"use strict";

const fs   = require("fs");
const path = require("path");

const { checkArgvForForbidden, REQUIRED_BUILD_METHODS } = require("./_runtime_contract");

const RUNTIMES_DIR = path.join(__dirname, "runtimes");

let _cache    = null;
let _warnings = [];

// ── Registry load ─────────────────────────────────────────────────────────────

function _loadRuntimes() {
  const map   = new Map();
  const warns = [];

  let files;
  try {
    files = fs.readdirSync(RUNTIMES_DIR).filter(f => f.endsWith("_runtime.js"));
  } catch (err) {
    return { map, warns: ["runtimes dir not found: " + err.message] };
  }

  for (const file of files) {
    let adapter;
    try {
      adapter = require(path.join(RUNTIMES_DIR, file));
    } catch (err) {
      warns.push("failed to load runtime '" + file + "': " + err.message);
      continue;
    }

    if (!adapter || typeof adapter.id !== "string") {
      warns.push("runtime '" + file + "' missing id — skipped");
      continue;
    }
    if (typeof adapter.available !== "function") {
      warns.push("runtime '" + adapter.id + "' missing available() — skipped");
      continue;
    }

    // Validate all 12 build*Argv methods
    let valid = true;
    for (const method of REQUIRED_BUILD_METHODS) {
      if (typeof adapter[method] !== "function") {
        warns.push("runtime '" + adapter.id + "' missing " + method + " — skipped");
        valid = false;
        break;
      }
    }
    if (!valid) continue;

    // Registration-time privilege invariant: sample buildRunArgv must not contain forbidden tokens
    let sampleArgv;
    try {
      sampleArgv = adapter.buildRunArgv({ image: "test", name: "t" }, {});
    } catch (err) {
      warns.push("runtime '" + adapter.id + "' buildRunArgv threw on sample input: " + err.message + " — skipped");
      continue;
    }

    const guard = checkArgvForForbidden(sampleArgv);
    if (!guard.ok) {
      warns.push("runtime '" + adapter.id + "' failed privilege invariant: " + guard.reason + " — skipped");
      continue;
    }

    if (map.has(adapter.id)) {
      warns.push("duplicate runtime id '" + adapter.id + "' in '" + file + "' — skipped");
      continue;
    }

    map.set(adapter.id, adapter);
  }

  return { map, warns };
}

// ── Public API ────────────────────────────────────────────────────────────────

// Lazy-loaded: initializes on first call so tool registry is fully set up by then.
function getRuntimes() {
  if (!_cache) {
    const { map, warns } = _loadRuntimes();
    _cache    = map;
    _warnings = warns;
  }
  return _cache;
}

function getRuntime(id) {
  return getRuntimes().get(id) || null;
}

function getWarnings() {
  getRuntimes();
  return _warnings.slice();
}

function resetRuntimeCache() {
  _cache    = null;
  _warnings = [];
}

// Pick the best available runtime. Preference order: docker → podman.
// If ctx.runtime_id or input.runtime_id specified, use that explicitly.
// available() is async (calls env.probe_binary to verify daemon is functional).
async function pickRuntime(runtimeId, ctx) {
  const map = getRuntimes();
  if (!map.size) return null;

  const preferred = runtimeId || (ctx && ctx.runtime_id) || null;
  if (preferred) {
    const r = map.get(preferred);
    return (r && await r.available()) ? r : null;
  }

  // Auto-select: first available in insertion order (docker, then podman)
  for (const [, adapter] of map) {
    if (await adapter.available()) return adapter;
  }
  return null;
}

module.exports = { getRuntimes, getRuntime, getWarnings, resetRuntimeCache, pickRuntime };
