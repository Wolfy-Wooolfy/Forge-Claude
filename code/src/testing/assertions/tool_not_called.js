"use strict";

module.exports = {
  type: "tool_not_called",

  /**
   * Passes if result.output.tool_calls has no entry with name === assertion.name.
   */
  run(assertion, result) {
    const calls = (result.output && result.output.tool_calls) || [];
    const found = calls.some((c) => c.name === assertion.name);
    return {
      passed: !found,
      detail: !found
        ? "tool '" + assertion.name + "' was correctly NOT called"
        : "tool '" + assertion.name + "' was unexpectedly called"
    };
  }
};
