"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Asserts that a file exists at the given path (relative to workspace root).
 * @param {{ path: string }} params
 * @param {{ workspace_root: string }} context
 */
async function assert(params, context) {
  const root = (context && context.workspace_root) || process.cwd();
  const target = path.resolve(root, params.path);
  if (fs.existsSync(target)) {
    return { pass: true };
  }
  return { pass: false, reason: `File not found: ${target}` };
}

module.exports = { assert };
