"use strict";

module.exports = {
  type: "status_equals",

  /**
   * Passes if result.status === assertion.expected.
   */
  run(assertion, result) {
    const actual = result && result.status ? String(result.status) : "(no status)";
    const passed = actual === assertion.expected;
    return {
      passed,
      detail: passed
        ? "status === '" + assertion.expected + "'"
        : "status: expected '" + assertion.expected + "', got '" + actual + "'"
    };
  }
};
