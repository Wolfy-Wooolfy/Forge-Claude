"use strict";

const path = require("path");
const fs   = require("fs");

module.exports = {
  type: "artifact_exists",

  /**
   * Passes if the file at <root>/<assertion.path> exists.
   */
  run(assertion, result, ctx) {
    const root       = ctx && ctx.root ? ctx.root : process.cwd();
    const fullPath   = path.join(root, assertion.path);
    const exists     = fs.existsSync(fullPath);
    const shouldExist = assertion.expected !== false;
    const passed      = shouldExist ? exists : !exists;
    return {
      passed,
      detail: passed
        ? (shouldExist ? "file exists: " + assertion.path : "file correctly absent: " + assertion.path)
        : (shouldExist ? "file NOT found: " + assertion.path : "file unexpectedly exists: " + assertion.path)
    };
  }
};
