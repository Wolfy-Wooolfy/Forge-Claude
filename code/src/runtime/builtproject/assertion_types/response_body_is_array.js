"use strict";

/**
 * Asserts that the JSON response body is an array.
 * Optionally asserts a minimum or exact length.
 * @param {{ min_length?: number, exact_length?: number }} params
 * @param {{ response: { body: * } }} context
 */
async function assert(params, context) {
  const body = context.response && context.response.body;
  if (!Array.isArray(body)) {
    return { pass: false, reason: `Expected response body to be an array, got ${typeof body}` };
  }
  if (params.exact_length !== undefined && body.length !== params.exact_length) {
    return { pass: false, reason: `Expected array length ${params.exact_length}, got ${body.length}` };
  }
  if (params.min_length !== undefined && body.length < params.min_length) {
    return { pass: false, reason: `Expected array length >= ${params.min_length}, got ${body.length}` };
  }
  return { pass: true };
}

module.exports = { assert };
