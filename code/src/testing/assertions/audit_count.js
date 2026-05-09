"use strict";

module.exports = {
  type: "audit_count",

  /**
   * Passes if result.audit.length >= assertion.min.
   */
  run(assertion, result) {
    const audit  = result.audit || [];
    const count  = audit.length;
    const passed = count >= assertion.min;
    return {
      passed,
      detail: passed
        ? "audit.length=" + count + " >= " + assertion.min
        : "audit.length=" + count + " < " + assertion.min + " (required)"
    };
  }
};
