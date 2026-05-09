"use strict";

module.exports = {
  type: "state_field_equals",

  /**
   * Passes if result.output.state[field] deep-equals assertion.expected.
   */
  run(assertion, result) {
    const state  = (result.output && result.output.state) || {};
    const actual = state[assertion.field];
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
