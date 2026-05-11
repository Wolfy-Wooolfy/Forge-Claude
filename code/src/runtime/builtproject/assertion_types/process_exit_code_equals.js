"use strict";

/**
 * Asserts that the process exited with the expected exit code.
 * @param {{ expected: number }} params
 * @param {{ process: { exitCode: number } }} context
 */
async function assert(params, context) {
  const actual = context.process && context.process.exitCode;
  const expected = params.expected;
  if (actual === expected) {
    return { pass: true };
  }
  return { pass: false, reason: `Expected exit code ${expected}, got ${actual}` };
}

module.exports = { assert };
