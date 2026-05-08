"use strict";

const fs   = require("fs");
const path = require("path");

const WARN_BYTES = 100 * 1024 * 1024; // 100 MB

function _dirSize(dirPath) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dirPath);
  } catch (_) { return 0; }

  for (const entry of entries) {
    const full = path.join(dirPath, entry);
    let stat;
    try { stat = fs.statSync(full); } catch (_) { continue; }
    if (stat.isDirectory()) {
      total += _dirSize(full);
    } else {
      total += stat.size;
    }
  }
  return total;
}

module.exports = {
  id:          "disk_space",
  description: "artifacts/ directory size < 100 MB",
  fn(ctx) {
    const artifactsDir = path.join(ctx.root, "artifacts");

    if (!fs.existsSync(artifactsDir)) {
      return { status: "PASS", detail: "artifacts/ not yet created (fresh install)" };
    }

    const bytes = _dirSize(artifactsDir);
    const mb    = (bytes / (1024 * 1024)).toFixed(1);

    if (bytes > WARN_BYTES) {
      return {
        status: "WARN",
        detail: "artifacts/ is " + mb + " MB (> 100 MB — consider archival)"
      };
    }

    return { status: "PASS", detail: "artifacts/ is " + mb + " MB" };
  }
};
