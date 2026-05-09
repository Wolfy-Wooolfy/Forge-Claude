"use strict";

module.exports = {
  type: "state_field_exists",

  /**
   * Passes if the field (dot-separated path) exists and is not null/undefined.
   * Example: "fingerprint.os" → state["fingerprint"]["os"]
   */
  run(assertion, result) {
    const state  = (result.output && result.output.state) || {};
    const parts  = String(assertion.field).split(".");
    let   cur    = state;

    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== "object") {
        return { passed: false, detail: "state." + assertion.field + " not found (path broken at '" + p + "')" };
      }
      cur = cur[p];
    }

    const passed = cur !== undefined && cur !== null;
    return {
      passed,
      detail: passed
        ? "state." + assertion.field + " exists"
        : "state." + assertion.field + " is missing/null"
    };
  }
};
