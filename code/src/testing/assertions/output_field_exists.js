"use strict";

module.exports = {
  type: "output_field_exists",

  run(assertion, result) {
    const output = (result.output && result.output.state) || {};
    const parts  = String(assertion.field).replace(/\[(\d+)\]/g, ".$1").split(".");
    let   cur    = output;

    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== "object") {
        return { passed: false, detail: "output." + assertion.field + " not found (path broken at '" + p + "')" };
      }
      cur = cur[p];
    }

    const passed = cur !== undefined && cur !== null;
    return {
      passed,
      detail: passed
        ? "output." + assertion.field + " exists"
        : "output." + assertion.field + " is missing/null"
    };
  }
};
