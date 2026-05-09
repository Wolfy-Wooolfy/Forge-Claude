"use strict";

module.exports = {
  type: "active_state",

  /**
   * Passes if result.output.state.active === assertion.expected.
   */
  run(assertion, result) {
    const state  = (result.output && result.output.state) || {};
    const actual = state.active;
    const passed = actual === assertion.expected;
    return {
      passed,
      detail: passed
        ? "state.active === '" + assertion.expected + "'"
        : "state.active: expected '" + assertion.expected + "', got '" + actual + "'"
    };
  }
};
