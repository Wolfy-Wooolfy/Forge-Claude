"use strict";

// SU12 — citation_validator.js unit test

const { validateCitations, CLAIM_PATTERNS } = require("../../../runtime/kb/citation_validator");

let passed = 0, failed_count = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail !== undefined ? ("| " + JSON.stringify(detail)) : ""); failed_count++; }
}

function run() {
  console.log("SU12 — citation_validator.js");

  // ── T1: no claims in artifact → PASS ────────────────────────────────────────

  const r1 = validateCitations("Hello world.\nGreetings from Forge.\nNo factual assertions here.", []);
  assert("T1: status = PASS",               r1.status === "PASS",               r1.status);
  assert("T1: uncited_claims_count = 0",    r1.uncited_claims_count === 0,       r1.uncited_claims_count);
  assert("T1: cited_claims_count = 0",      r1.cited_claims_count === 0,         r1.cited_claims_count);
  assert("T1: uncited_claims = []",         r1.uncited_claims.length === 0,      r1.uncited_claims.length);

  // ── T2: all claims cited → PASS ──────────────────────────────────────────────

  const doc2 = [
    "Introduction",                                                       // line 1 — no claim
    "The system must persist all session tokens in encrypted storage.",   // line 2 — P1 match
    "Response time must be under 200 ms for all API calls.",              // line 3 — P5 match
  ].join("\n");

  const r2 = validateCitations(doc2, [2, 3]);
  assert("T2: status = PASS",                  r2.status === "PASS",              r2.status);
  assert("T2: cited_claims_count = 2",         r2.cited_claims_count === 2,       r2.cited_claims_count);
  assert("T2: uncited_claims_count = 0",       r2.uncited_claims_count === 0,     r2.uncited_claims_count);

  // ── T3: uncited claim → FAIL_UNCITED ────────────────────────────────────────

  const doc3 = [
    "Introduction",
    "The system requires end-to-end encryption.",   // line 2 — claim, not cited
  ].join("\n");

  const r3 = validateCitations(doc3, []);
  assert("T3: status = FAIL_UNCITED",          r3.status === "FAIL_UNCITED",      r3.status);
  assert("T3: uncited_claims_count = 1",       r3.uncited_claims_count === 1,     r3.uncited_claims_count);
  assert("T3: uncited line = 2",               r3.uncited_claims[0] && r3.uncited_claims[0].line === 2, r3.uncited_claims[0] && r3.uncited_claims[0].line);

  // ── T4: Pattern 2 — version statement ────────────────────────────────────────

  const doc4 = "Compatible with Node.js v18.0 and later.";  // line 1 — P2 match
  const r4a  = validateCitations(doc4, []);
  const r4b  = validateCitations(doc4, [1]);

  assert("T4: version pattern detected uncited",  r4a.status === "FAIL_UNCITED", r4a.status);
  assert("T4: version pattern cited → PASS",      r4b.status === "PASS",         r4b.status);

  // ── T5: Pattern 3 — attribution anchor ───────────────────────────────────────

  const doc5 = "According to the specification, all writes must be atomic.";
  const r5   = validateCitations(doc5, []);
  assert("T5: attribution anchor detected", r5.status === "FAIL_UNCITED", r5.status);

  // ── T6: Pattern 5 — percentage assertion ─────────────────────────────────────

  const doc6 = "The cache hit rate must exceed 95% under peak load.";
  const r6   = validateCitations(doc6, []);
  assert("T6: percentage assertion detected", r6.status === "FAIL_UNCITED", r6.status);

  // ── T7: citedLineNumbers accepts Set<number> ──────────────────────────────────

  const doc7 = "The system must persist all session tokens in encrypted storage.";
  const r7   = validateCitations(doc7, new Set([1]));
  assert("T7: Set<number> accepted", r7.status === "PASS", r7.status);

  // ── T8: CLAIM_PATTERNS exported as array of 5 ────────────────────────────────

  assert("T8: 5 CLAIM_PATTERNS exported", Array.isArray(CLAIM_PATTERNS) && CLAIM_PATTERNS.length === 5, CLAIM_PATTERNS && CLAIM_PATTERNS.length);
  assert("T8: all patterns are RegExp",   CLAIM_PATTERNS.every(p => p instanceof RegExp), null);
}

run();
console.log("\nSU12:", passed, "passed,", failed_count, "failed");
process.exit(failed_count > 0 ? 1 : 0);
