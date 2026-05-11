"use strict";

/**
 * Asserts that the HTTP response status code equals the expected value.
 * @param {{ expected: number }} params
 * @param {{ response: { status: number } }} context
 */
async function assert(params, context) {
  const actual = context.response && context.response.status;
  const expected = params.expected;
  if (actual === expected) {
    return { pass: true };
  }
  return { pass: false, reason: `Expected HTTP ${expected}, got ${actual}` };
}

module.exports = { assert };
