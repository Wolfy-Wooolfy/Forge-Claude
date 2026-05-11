"use strict";

/**
 * Asserts that stdout captured during scenario execution contains the expected substring.
 * @param {{ expected: string }} params
 * @param {{ stdout: string }} context
 */
async function assert(params, context) {
  const stdout = (context && context.stdout) || "";
  if (stdout.includes(params.expected)) {
    return { pass: true };
  }
  return {
    pass: false,
    reason: `Expected stdout to contain "${params.expected}". Actual stdout: ${stdout.slice(0, 200)}`
  };
}

module.exports = { assert };
