"use strict";

module.exports = {
  type: "response_contains",

  /**
   * Passes if result.output.response (string) includes assertion.substring.
   */
  run(assertion, result) {
    const response = (result.output && result.output.response) || "";
    const passed   = typeof response === "string" &&
                     response.includes(assertion.substring);
    return {
      passed,
      detail: passed
        ? "response contains '" + assertion.substring + "'"
        : "response does NOT contain '" + assertion.substring +
          "' (response: " + String(response).slice(0, 80) + ")"
    };
  }
};
