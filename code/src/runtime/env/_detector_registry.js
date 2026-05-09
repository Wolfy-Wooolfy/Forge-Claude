"use strict";

const path = require("path");
const fs   = require("fs");

const DETECTORS_DIR = path.join(__dirname, "detectors");

let _loaded = null;

/**
 * Returns a map of id → detector module.
 * Auto-discovers all *_detector.js files in the detectors/ subdirectory.
 * Cached after first load.
 */
function getDetectors() {
  if (_loaded) return _loaded;

  const map = new Map();
  let files;
  try {
    files = fs.readdirSync(DETECTORS_DIR).filter(
      (f) => f.endsWith("_detector.js") && !f.startsWith("_")
    );
  } catch {
    _loaded = map;
    return map;
  }

  for (const file of files) {
    try {
      const mod = require(path.join(DETECTORS_DIR, file));
      if (mod && typeof mod.id === "string" && typeof mod.detect === "function") {
        map.set(mod.id, mod);
      }
    } catch { /* skip broken detectors */ }
  }

  _loaded = map;
  return map;
}

function resetDetectorCache() {
  _loaded = null;
}

module.exports = { getDetectors, resetDetectorCache };
