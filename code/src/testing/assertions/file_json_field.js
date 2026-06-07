"use strict";

const path = require("path");
const fs   = require("fs");

module.exports = {
  type: "file_json_field",

  /**
   * Reads a JSON file at <root>/<assertion.path> and checks that
   * json[assertion.field] === assertion.expected (strict equality).
   */
  run(assertion, result, ctx) {
    const root     = ctx && ctx.root ? ctx.root : process.cwd();
    const fullPath = path.join(root, assertion.path);
    let actual;
    try {
      const content = fs.readFileSync(fullPath, "utf8");
      const json    = JSON.parse(content);
      actual = json[assertion.field];
    } catch (err) {
      return {
        passed: false,
        detail: "could not read/parse " + assertion.path + ": " + err.message
      };
    }
    const passed = actual === assertion.expected;
    return {
      passed,
      detail: passed
        ? assertion.path + "[" + assertion.field + "] === '" + assertion.expected + "'"
        : assertion.path + "[" + assertion.field + "]: expected '" + assertion.expected +
          "', got '" + String(actual) + "'"
    };
  }
};
