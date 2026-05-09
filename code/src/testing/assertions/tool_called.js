"use strict";

module.exports = {
  type: "tool_called",

  /**
   * Passes if result.output.tool_calls contains an entry with name === assertion.name.
   */
  run(assertion, result) {
    const calls = (result.output && result.output.tool_calls) || [];
    const found = calls.some((c) => c.name === assertion.name);
    return {
      passed: found,
      detail: found
        ? "tool '" + assertion.name + "' was called"
        : "tool '" + assertion.name + "' was NOT called (calls: " +
          calls.map((c) => c.name).join(", ") + ")"
    };
  }
};
