"use strict";

// PHASE-45 A-1 — response_header_equals assertion-type unit coverage (S338–S339).
// Pure unit, mock-only, $0: requires the assertion evaluator and runs it against crafted
// contexts (mirrors the build_loopback S335 runTInvariance pure-unit pattern). No real calls,
// no fs, no tools — so this helper introduces no new §ARC surface.

const { assert } = require("../../runtime/builtproject/assertion_types/response_header_equals");

// Context shaped exactly like harness_runner builds it (harness_runner.js:94-100):
// context.response = { status, headers, body, raw }. Node lowercases response header names,
// so a Location redirect target lands under headers.location.
function _ctx(headers) {
  return {
    response: { status: 302, headers: headers, body: null, raw: "" },
    process: null,
    workspace_root: "/tmp",
    stdout: ""
  };
}

// ── S338 — positive: header present + value matches → PASS (incl. case-insensitive name) ──
async function runHeaderMatchPass() {
  // Scenario writes "Location"; the captured header key is the Node-lowercased "location".
  const exact = await assert(
    { type: "response_header_equals", header: "Location", expected: "http://example.org" },
    _ctx({ location: "http://example.org" })
  );
  // Mixed-case header name must also resolve (case-insensitive lookup).
  const mixed = await assert(
    { type: "response_header_equals", header: "LoCaTiOn", expected: "http://example.org" },
    _ctx({ location: "http://example.org" })
  );
  return {
    pass_true:        exact.pass === true,
    no_reason:        exact.reason === undefined || exact.reason === null,
    case_insensitive: mixed.pass === true
  };
}

// ── S339 — negative: header absent → FAIL; value mismatch → FAIL; no headers → FAIL ──
async function runHeaderMissingOrMismatchFail() {
  const missing = await assert(
    { type: "response_header_equals", header: "Location", expected: "http://example.org" },
    _ctx({ "content-type": "text/html" })
  );
  const mismatch = await assert(
    { type: "response_header_equals", header: "Location", expected: "http://example.org" },
    _ctx({ location: "http://wrong.example" })
  );
  const noHeaders = await assert(
    { type: "response_header_equals", header: "Location", expected: "http://example.org" },
    { response: { status: 302 } }
  );
  return {
    missing_fail:        missing.pass === false,
    missing_has_reason:  typeof missing.reason === "string" && missing.reason.length > 0,
    mismatch_fail:       mismatch.pass === false,
    mismatch_has_reason: typeof mismatch.reason === "string" && mismatch.reason.length > 0,
    no_headers_fail:     noHeaders.pass === false
  };
}

module.exports = { runHeaderMatchPass, runHeaderMissingOrMismatchFail };
