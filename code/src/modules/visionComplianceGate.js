"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const VISION_CLAUSES = [
  "IDEA_EVALUATION_LOOP",
  "DOCUMENTATION_AUTO_GENERATION",
  "CROSS_DOCUMENT_GAP_DETECTION",
  "ITERATIVE_DOCUMENTATION_REFINEMENT",
  "CODE_DOCS_CONSISTENCY_ENFORCEMENT",
  "AUTOMATIC_TEST_EVIDENCE",
  "FULL_COMPLETION_VERIFICATION"
];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

// ── Clause enforcement checks ──────────────────────────────────────────────

function checkClause1(root) {
  // IDEA_EVALUATION_LOOP: projectRuntime.intakeProject + assertRequirementDiscoveryComplete
  const runtimePath = path.join(root, "code/src/ai_os/projectRuntime.js");
  if (!fs.existsSync(runtimePath)) return { enforced: false, reason: "projectRuntime.js missing" };
  const src = fs.readFileSync(runtimePath, "utf-8");
  const hasIntake = src.includes("intakeProject");
  const hasGate = src.includes("assertRequirementDiscoveryComplete");
  return {
    enforced: hasIntake && hasGate,
    reason: hasIntake && hasGate ? "intakeProject + assertRequirementDiscoveryComplete found" : "Missing intake or gate"
  };
}

function checkClause2(root) {
  // DOCUMENTATION_AUTO_GENERATION: openAiDocumentationProvider + saveDocumentationDraft
  const docProv = path.join(root, "code/src/providers/openAiDocumentationProvider.js");
  const runtime = path.join(root, "code/src/ai_os/projectRuntime.js");
  const hasProvider = fs.existsSync(docProv);
  const hasRuntime = fs.existsSync(runtime) && fs.readFileSync(runtime, "utf-8").includes("saveDocumentationDraft");
  return {
    enforced: hasProvider && hasRuntime,
    reason: hasProvider && hasRuntime ? "Documentation provider + saveDocumentationDraft found" : "Missing documentation generation"
  };
}

function checkClause3(root) {
  // CROSS_DOCUMENT_GAP_DETECTION: crossDocConsistencyEngine
  const eng = path.join(root, "code/src/modules/crossDocConsistencyEngine.js");
  return {
    enforced: fs.existsSync(eng),
    reason: fs.existsSync(eng) ? "crossDocConsistencyEngine.js found" : "crossDocConsistencyEngine.js missing"
  };
}

function checkClause4(root) {
  // ITERATIVE_DOCUMENTATION_REFINEMENT: refinementLoopOrchestrator + loopTerminationValidator
  const orc = path.join(root, "code/src/ai_os/refinementLoopOrchestrator.js");
  const ltv = path.join(root, "code/src/modules/loopTerminationValidator.js");
  return {
    enforced: fs.existsSync(orc) && fs.existsSync(ltv),
    reason: (fs.existsSync(orc) && fs.existsSync(ltv)) ? "refinementLoopOrchestrator + loopTerminationValidator found" : "Missing loop orchestration"
  };
}

function checkClause5(root) {
  // CODE_DOCS_CONSISTENCY_ENFORCEMENT: traceEngine + codeToSpecTraceValidator
  const trace = path.join(root, "code/src/modules/traceEngine.js");
  const validator = path.join(root, "code/src/modules/codeToSpecTraceValidator.js");
  return {
    enforced: fs.existsSync(trace) && fs.existsSync(validator),
    reason: (fs.existsSync(trace) && fs.existsSync(validator)) ? "traceEngine + codeToSpecTraceValidator found" : "Missing trace/validator"
  };
}

function checkClause6(root) {
  // AUTOMATIC_TEST_EVIDENCE: verifyEngine has buildTestEvidence
  const ve = path.join(root, "code/src/modules/verifyEngine.js");
  if (!fs.existsSync(ve)) return { enforced: false, reason: "verifyEngine.js missing" };
  const src = fs.readFileSync(ve, "utf-8");
  const hasEvidence = src.includes("buildTestEvidence") && src.includes("test_evidence.json");
  return {
    enforced: hasEvidence,
    reason: hasEvidence ? "buildTestEvidence + test_evidence.json found in verifyEngine" : "Missing test evidence generation"
  };
}

function checkClause7(root) {
  // FULL_COMPLETION_VERIFICATION: verifyEngine closure_contract_ready
  const ve = path.join(root, "code/src/modules/verifyEngine.js");
  if (!fs.existsSync(ve)) return { enforced: false, reason: "verifyEngine.js missing" };
  const src = fs.readFileSync(ve, "utf-8");
  const hasClosure = src.includes("closure_contract_ready");
  return {
    enforced: hasClosure,
    reason: hasClosure ? "closure_contract_ready gate found in verifyEngine" : "Missing closure contract gate"
  };
}

const CLAUSE_CHECKERS = [
  checkClause1, checkClause2, checkClause3,
  checkClause4, checkClause5, checkClause6, checkClause7
];

function runVisionComplianceGate(options = {}) {
  const root = String(options.root || ROOT);
  const outputDir = path.join(root, "artifacts", "verify", "vision");
  ensureDir(outputDir);
  const artifactPath = path.join(outputDir, "vision_compliance_gate.json");

  const clauseResults = VISION_CLAUSES.map((clauseId, i) => {
    const check = CLAUSE_CHECKERS[i](root);
    return {
      clause_id: clauseId,
      enforced: check.enforced,
      gap_classification: check.enforced ? "NONE" : "PARTIAL",
      reason: check.reason
    };
  });

  const failedClauses = clauseResults.filter((c) => !c.enforced);
  const passed = failedClauses.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    total_clauses: VISION_CLAUSES.length,
    enforced_clauses: clauseResults.filter((c) => c.enforced).length,
    failed_clauses: failedClauses.length,
    result: passed ? "PASS" : "FAIL",
    clauses: clauseResults
  };

  writeJson(artifactPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/vision/vision_compliance_gate.json",
    failed_clauses: failedClauses.map((c) => c.clause_id),
    blocked: !passed,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Vision Compliance Gate: PASS" }
      : { blocking_questions: [`Vision Compliance Gate FAIL — ${failedClauses.length} clause(s) not enforced: ${failedClauses.map((c) => c.clause_id).join(", ")}`], next_step: "" }
  };
}

module.exports = { runVisionComplianceGate, VISION_CLAUSES };
