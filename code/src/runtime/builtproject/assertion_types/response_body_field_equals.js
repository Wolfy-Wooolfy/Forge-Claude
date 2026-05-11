"use strict";

/**
 * Asserts that a field in the JSON response body equals the expected value.
 * Supports dot-notation for nested fields (e.g. "user.id").
 * @param {{ field: string, expected: * }} params
 * @param {{ response: { body: object } }} context
 */
async function assert(params, context) {
  const body = context.response && context.response.body;
  if (!body || typeof body !== "object") {
    return { pass: false, reason: "Response body is not a JSON object" };
  }

  const parts = params.field.split(".");
  let actual = body;
  for (const part of parts) {
    if (actual == null || typeof actual !== "object") {
      return { pass: false, reason: `Field "${params.field}" not found in response body` };
    }
    actual = actual[part];
  }

  if (actual === params.expected) {
    return { pass: true };
  }
  return {
    pass: false,
    reason: `Expected body.${params.field} to equal ${JSON.stringify(params.expected)}, got ${JSON.stringify(actual)}`
  };
}

module.exports = { assert };
