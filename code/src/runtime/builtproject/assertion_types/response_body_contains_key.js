"use strict";

/**
 * Asserts that the parsed JSON response body contains the specified key.
 * @param {{ key: string }} params
 * @param {{ response: { body: object } }} context
 */
async function assert(params, context) {
  const body = context.response && context.response.body;
  if (!body || typeof body !== "object") {
    return { pass: false, reason: "Response body is not a JSON object" };
  }
  if (Object.prototype.hasOwnProperty.call(body, params.key)) {
    return { pass: true };
  }
  return { pass: false, reason: `Expected key "${params.key}" not found in response body` };
}

module.exports = { assert };
