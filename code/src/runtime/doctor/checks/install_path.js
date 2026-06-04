"use strict";

const fs   = require("fs");
const path = require("path");

const CANONICAL_MARKERS = [
  "progress/status.json",
  "code/src/workspace/apiServer.js",
  "ecosystem.config.js"
];

const DEFAULT_STALE_PATH = "D:\\ForgeAI";

module.exports = {
  id:          "install_path",
  description: "Forge is running from a valid Forge root with no stale sibling copy at D:\\ForgeAI",
  fn(ctx) {
    const root = (ctx && ctx.root) || process.cwd();

    const missing = CANONICAL_MARKERS.filter((m) => !fs.existsSync(path.join(root, m)));
    if (missing.length > 0) {
      return {
        status: "FAIL",
        detail: "missing canonical markers in " + root + ": " + missing.join(", ")
      };
    }

    const staleCandidate = (ctx && ctx._test_stale_sibling_path) || DEFAULT_STALE_PATH;
    if (
      fs.existsSync(staleCandidate) &&
      path.resolve(staleCandidate) !== path.resolve(root)
    ) {
      return {
        status: "WARN",
        detail:
          "stale Forge copy detected. Running from: " + root +
          ". Stale copy at: " + staleCandidate +
          ". Ensure pm2 runs from the correct path (see INSTALL.md)."
      };
    }

    return {
      status: "PASS",
      detail: "Forge root valid. Running from: " + root
    };
  }
};
