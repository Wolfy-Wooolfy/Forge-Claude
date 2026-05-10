"use strict";

module.exports = {
  type: "state_field_equals",

  /**
   * Passes if result.output.state[field] deep-equals assertion.expected.
   */
  run(assertion, result) {
    const state  = (result.output && result.output.state) || {};
    const parts  = String(assertion.field).replace(/\[(\d+)\]/g, ".$1").split(".");
    let   actual = state;
    for (const p of parts) {
      if (actual === null || actual === undefined || typeof actual !== "object") { actual = undefined; break; }
      actual = actual[p];
    }
    const passed = JSON.stringify(actual) === JSON.stringify(assertion.expected);
    return {
      passed,
      detail: passed
        ? "state." + assertion.field + " equals expected"
        : "state." + assertion.field + ": expected " +
          JSON.stringify(assertion.expected) + ", got " + JSON.stringify(actual)
    };
  }
};
