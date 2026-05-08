"use strict";

const fs   = require("fs");
const path = require("path");

const WARN_BYTES = 50 * 1024 * 1024; // 50 MB

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
  id:          "trace_matrix_size",
  description: "artifacts/llm/ trace files < 50 MB",
  fn(ctx) {
    const llmDir = path.join(ctx.root, "artifacts", "llm");

    if (!fs.existsSync(llmDir)) {
      return { status: "PASS", detail: "artifacts/llm/ not yet created (fresh install)" };
    }

    const bytes = _dirSize(llmDir);
    const mb    = (bytes / (1024 * 1024)).toFixed(1);

    if (bytes > WARN_BYTES) {
      return {
        status: "WARN",
        detail: "artifacts/llm/ is " + mb + " MB (> 50 MB — consider rotation in PHASE-12)"
      };
    }

    return { status: "PASS", detail: "artifacts/llm/ is " + mb + " MB" };
  }
};
