"use strict";

// SU15 — research_role.js: L-KB-5 Research Role
// Tests: happy path, KNOWN-gate downgrade, budget exceeded, invalid input, empty KB

const path = require("path");

// ── Module mock paths ─────────────────────────────────────────────────────────

const BUDGET_GUARD_PATH = path.resolve(__dirname, "../../../runtime/kb/budget_guard.js");
const REGISTRY_PATH     = path.resolve(__dirname, "../../../runtime/tools/_registry.js");

let passed = 0, failed_count = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail !== undefined ? ("| " + JSON.stringify(detail)) : ""); failed_count++; }
}

// ── Mock: budget guard (mutable throw flag) ───────────────────────────────────

let _budgetShouldThrow = false;

require.cache[BUDGET_GUARD_PATH] = {
  id: BUDGET_GUARD_PATH, filename: BUDGET_GUARD_PATH, loaded: true,
  exports: {
    enforceBudget: () => {
      if (_budgetShouldThrow) {
        const err = Object.assign(new Error("BUDGET_EXCEEDED: project spent $1.55 of $1.50 budget"), { code: "BUDGET_EXCEEDED" });
        throw err;
      }
    },
    checkBudget: () => ({ status: "NORMAL", total_usd: 0, budget_usd: 1.50, ratio: 0 }),
    logWarnIfNeeded: () => {}
  }
};

// ── Mock: registry (mutable invoke delegate) ──────────────────────────────────

let _mockRetrieveResult = { status: "SUCCESS", output: { results: [] }, metadata: {} };
let _mockAgentResult    = null;

require.cache[REGISTRY_PATH] = {
  id: REGISTRY_PATH, filename: REGISTRY_PATH, loaded: true,
  exports: {
    getDefaultRegistry: () => ({
      invoke: async (tool) => {
        if (tool === "kb.retrieve")  return _mockRetrieveResult;
        if (tool === "agent.invoke") return _mockAgentResult;
        return { status: "FAILED", output: null, metadata: { reason: "UNKNOWN_TOOL" } };
      }
    }),
    createRegistry: () => ({ load: () => {}, has: () => true })
  }
};

// ── Load research role AFTER mocks ────────────────────────────────────────────

const role = require("../../../runtime/agents/roles/research_role.js");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_INPUT = {
  schema_version: "1.0.0",
  project_id:     "proj_su15",
  question:       "What are the authentication requirements for the system?"
};

function makeFindingsJson(overrides) {
  const base = {
    schema_version: "1.0.0",
    question:       BASE_INPUT.question,
    findings: [
      {
        id: "find_aabbccddeeff",
        claim: "The system must use OAuth 2.0 for authentication.",
        certainty: "KNOWN",
        supporting_citations: ["chk_aabbcc11_0"],
        contradicting_citations: []
      }
    ],
    scenarios: [
      {
        scenario: "OAuth 2.0 implementation succeeds on schedule.",
        probability: "HIGH",
        key_conditions: ["dev team has OAuth experience"]
      }
    ],
    recommendation: {
      conclusion: "Implement OAuth 2.0 as specified.",
      reasoning: "Evidence directly supports the OAuth 2.0 requirement.",
      alternatives: [
        { conclusion: "Use API key auth as fallback.", reasoning: "Simpler if OAuth proves complex." }
      ]
    },
    knowledge_gaps: [],
    confidence_level: "HIGH",
    metadata: {
      searches_performed: 0, sources_consulted: 0,
      sources_rejected_low_credibility: 0, total_cost_usd: 0
    }
  };
  return Object.assign({}, base, overrides);
}

const CHUNK = {
  chunk_id: "chk_aabbcc11_0", source_id: "src_aabbcc112233",
  text: "The system must use OAuth 2.0 for all user authentication flows.",
  relevance_score: 0.88, credibility_tier: "REPUTABLE"
};

// ── T1: Happy path ─────────────────────────────────────────────────────────────

async function run() {
  console.log("SU15 — research_role: L-KB-5 Research Role");

  _budgetShouldThrow = false;
  _mockRetrieveResult = { status: "SUCCESS", output: { results: [CHUNK] }, metadata: {} };
  _mockAgentResult    = { status: "SUCCESS", output: { text: JSON.stringify(makeFindingsJson()) }, metadata: {} };

  const r1 = await role.run(BASE_INPUT, { root: process.cwd() });

  assert("T1: envelope = SUCCESS",               r1.status === "SUCCESS",                                         r1.status);
  assert("T1: output.question matches",          r1.output && r1.output.question === BASE_INPUT.question,         r1.output && r1.output.question);
  assert("T1: findings array non-empty",         r1.output && Array.isArray(r1.output.findings) && r1.output.findings.length > 0, r1.output && r1.output.findings);
  assert("T1: finding[0].certainty = KNOWN",     r1.output && r1.output.findings[0].certainty === "KNOWN",        r1.output && r1.output.findings[0] && r1.output.findings[0].certainty);
  assert("T1: finding id format find_<12hex>",   r1.output && /^find_[a-f0-9]{12}$/.test(r1.output.findings[0].id), r1.output && r1.output.findings[0] && r1.output.findings[0].id);
  assert("T1: metadata.sources_consulted = 1",   r1.output && r1.output.metadata.sources_consulted === 1,         r1.output && r1.output.metadata.sources_consulted);
  assert("T1: metadata.searches_performed = 3",  r1.output && r1.output.metadata.searches_performed === 3,        r1.output && r1.output.metadata.searches_performed);
  assert("T1: confidence_level = HIGH",          r1.output && r1.output.confidence_level === "HIGH",              r1.output && r1.output.confidence_level);

  // ── T2: KNOWN-gate — downgrade KNOWN→ESTIMATED when supporting_citations empty ──

  const knownGateFindings = makeFindingsJson({
    findings: [
      {
        id: "find_001122334455",
        claim: "The system requires 256-bit AES encryption for all stored tokens.",
        certainty: "KNOWN",
        supporting_citations: [],   // empty — must be downgraded
        contradicting_citations: []
      }
    ],
    confidence_level: "MEDIUM"
  });

  _mockRetrieveResult = { status: "SUCCESS", output: { results: [CHUNK] }, metadata: {} };
  _mockAgentResult    = { status: "SUCCESS", output: { text: JSON.stringify(knownGateFindings) }, metadata: {} };

  const r2 = await role.run(BASE_INPUT, { root: process.cwd() });

  assert("T2: envelope = SUCCESS",                        r2.status === "SUCCESS",                                          r2.status);
  assert("T2: KNOWN-gate → certainty downgraded to ESTIMATED",
    r2.output && r2.output.findings[0].certainty === "ESTIMATED",
    r2.output && r2.output.findings[0] && r2.output.findings[0].certainty);

  // ── T3: BUDGET_EXCEEDED ────────────────────────────────────────────────────────

  _budgetShouldThrow = true;

  const r3 = await role.run(BASE_INPUT, { root: process.cwd() });

  assert("T3: BUDGET_EXCEEDED → FAILED",          r3.status === "FAILED",                                          r3.status);
  assert("T3: reason = BUDGET_EXCEEDED",          r3.metadata && r3.metadata.reason === "BUDGET_EXCEEDED",         r3.metadata && r3.metadata.reason);

  _budgetShouldThrow = false;

  // ── T4: INVALID_INPUT — missing required field ────────────────────────────────

  const r4 = await role.run({ schema_version: "1.0.0", project_id: "proj_su15" }, { root: process.cwd() });

  assert("T4: missing question → FAILED",         r4.status === "FAILED",                                          r4.status);
  assert("T4: reason = INVALID_INPUT",            r4.metadata && r4.metadata.reason === "INVALID_INPUT",           r4.metadata && r4.metadata.reason);

  // ── T5: Empty KB — 0 chunks, LLM returns UNCERTAIN, knowledge_gaps filled ────

  const uncertainFindings = makeFindingsJson({
    findings: [
      {
        id: "find_aabbccddeeff",
        claim: "It is unclear whether the system supports SSO.",
        certainty: "UNCERTAIN",
        supporting_citations: [],
        contradicting_citations: []
      }
    ],
    knowledge_gaps: [],   // empty — role should auto-fill from UNCERTAIN finding
    confidence_level: "LOW"
  });

  _mockRetrieveResult = { status: "SUCCESS", output: { results: [] }, metadata: {} };
  _mockAgentResult    = { status: "SUCCESS", output: { text: JSON.stringify(uncertainFindings) }, metadata: {} };

  const r5 = await role.run(BASE_INPUT, { root: process.cwd() });

  assert("T5: envelope = SUCCESS",                r5.status === "SUCCESS",                                          r5.status);
  assert("T5: finding certainty = UNCERTAIN",     r5.output && r5.output.findings[0].certainty === "UNCERTAIN",    r5.output && r5.output.findings[0] && r5.output.findings[0].certainty);
  assert("T5: knowledge_gaps auto-filled",        r5.output && Array.isArray(r5.output.knowledge_gaps) && r5.output.knowledge_gaps.length > 0, r5.output && r5.output.knowledge_gaps);
  assert("T5: metadata.sources_consulted = 0",    r5.output && r5.output.metadata.sources_consulted === 0,         r5.output && r5.output.metadata.sources_consulted);
  assert("T5: confidence_level = LOW",            r5.output && r5.output.confidence_level === "LOW",               r5.output && r5.output.confidence_level);
}

run().then(() => {
  console.log("\nSU15:", passed, "passed,", failed_count, "failed");
  process.exit(failed_count > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU15 ERROR:", err.message, err.stack);
  process.exit(1);
});
