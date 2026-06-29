"use strict";

/**
 * Asserts that a response HEADER equals the expected value.
 *
 * Header lookup is case-insensitive: Node's http client lowercases response header
 * names, so a scenario written as { header: "Location" } resolves against the captured
 * `headers.location`. This is the only way to test header-carried behaviour — notably an
 * HTTP redirect (3xx), whose target lives in the Location HEADER and which has no JSON body
 * (so response_body_field_equals cannot verify it). harness_runner already captures
 * response.headers and does not auto-follow redirects, so the 3xx + Location are available.
 *
 * @param {{ header: string, expected: string }} params
 * @param {{ response: { headers: object } }} context
 */
async function assert(params, context) {
  const headers = context.response && context.response.headers;
  if (!headers || typeof headers !== "object") {
    return { pass: false, reason: "No response headers captured" };
  }

  const name = String(params.header).toLowerCase();
  const actual = headers[name];
  if (actual === undefined) {
    return { pass: false, reason: `Response header "${params.header}" not found` };
  }

  if (actual === params.expected) {
    return { pass: true };
  }
  return {
    pass: false,
    reason: `Expected header ${params.header} to equal ${JSON.stringify(params.expected)}, got ${JSON.stringify(actual)}`
  };
}

module.exports = { assert };
