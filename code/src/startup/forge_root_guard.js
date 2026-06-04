"use strict";

const fs   = require("fs");
const path = require("path");

const CANONICAL_MARKERS = [
  "progress/status.json",
  "code/src/workspace/apiServer.js",
  "ecosystem.config.js"
];

const DEFAULT_STALE_PATH = "D:\\ForgeAI";

/**
 * Asserts that `dir` is a valid Forge root by checking canonical markers.
 * Hard-exits (process.exit(1)) if markers are missing — launched from wrong dir.
 * Warns (console.warn, no exit) if a stale sibling copy exists at staleSiblingPath.
 * Logs the absolute running path at boot.
 *
 * Exported so test helpers can call it in isolation (see §11.5 test-first discipline).
 *
 * @param {string} dir               Absolute path of the directory to validate.
 * @param {object} [options]
 * @param {string} [options.staleSiblingPath]  Override for stale-copy detection (default: D:\ForgeAI).
 */
function assertForgeRoot(dir, options) {
  const missing = CANONICAL_MARKERS.filter((m) => !fs.existsSync(path.join(dir, m)));

  if (missing.length > 0) {
    console.error("[FATAL] Forge startup guard: not running from a valid Forge root.");
    console.error("  Directory: " + dir);
    console.error("  Missing markers: " + missing.join(", "));
    console.error("  Ensure you start Forge from the correct repo root.");
    process.exit(1);
    return; // unreachable — satisfies static analysis
  }

  console.log("[Forge] Running from: " + dir);

  const staleCandidate = (options && options.staleSiblingPath) || DEFAULT_STALE_PATH;
  if (
    fs.existsSync(staleCandidate) &&
    path.resolve(staleCandidate) !== path.resolve(dir)
  ) {
    console.warn("[Forge] ⚠  WARNING: stale Forge copy detected.");
    console.warn("  Running from : " + dir);
    console.warn("  Stale copy at: " + staleCandidate);
    console.warn("  Ensure pm2 runs from the correct path (see INSTALL.md).");
  }
}

module.exports = { assertForgeRoot };
