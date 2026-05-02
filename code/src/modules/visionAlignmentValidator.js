"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

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

// ── 7 Vision Clauses mapped per docs/08_audit/09_Vision_Alignment_Contract.md ──

const VISION_CLAUSE_MAP = [
  {
    clause_id: "CLAUSE_1",
    name: "Idea → Evaluation → Finalization Loop",
    mapped_contracts: ["docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md", "docs/12_ai_os/06_DISCUSSION_AND_IDEATION_LOOP.md"],
    enforcement_check(root) {
      const runtime = path.join(root, "code/src/ai_os/projectRuntime.js");
      const ideation = path.join(root, "code/src/ai_os/ideationEngine.js");
      const exists = fs.existsSync(runtime) && fs.existsSync(ideation);
      if (!exists) return { status: "MISSING", reason: "projectRuntime.js or ideationEngine.js missing" };
      const src = fs.readFileSync(runtime, "utf-8");
      if (src.includes("intakeProject") && src.includes("assertRequirementDiscoveryComplete")) {
        return { status: "PARTIAL", reason: "Intake + gate exist but no formal Idea Evaluation Contract artifact" };
      }
      return { status: "MISSING", reason: "intakeProject or assertRequirementDiscoveryComplete not found" };
    }
  },
  {
    clause_id: "CLAUSE_2",
    name: "Documentation Auto-Generation from Approved Idea",
    mapped_contracts: ["docs/12_ai_os/08_DOCUMENTATION_BUILD_LOOP.md", "docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md"],
    enforcement_check(root) {
      const prov = path.join(root, "code/src/providers/openAiDocumentationProvider.js");
      const loop = path.join(root, "code/src/ai_os/documentationBuildLoop.js");
      if (!fs.existsSync(prov)) return { status: "PARTIAL", reason: "openAiDocumentationProvider exists but documentationBuildLoop missing" };
      if (!fs.existsSync(loop)) return { status: "PARTIAL", reason: "Provider exists but 7-stage build loop not formalized" };
      return { status: "ENFORCED", reason: "Provider + DocumentationBuildLoop found" };
    }
  },
  {
    clause_id: "CLAUSE_3",
    name: "Cross-Document Gap Detection",
    mapped_contracts: ["docs/09_verify/09_17_Cross_Document_Consistency_Review_Contract.md"],
    enforcement_check(root) {
      const eng = path.join(root, "code/src/modules/crossDocConsistencyEngine.js");
      if (!fs.existsSync(eng)) return { status: "MISSING", reason: "crossDocConsistencyEngine.js missing" };
      return { status: "ENFORCED", reason: "crossDocConsistencyEngine.js found" };
    }
  },
  {
    clause_id: "CLAUSE_4",
    name: "Iterative Documentation Refinement Until Ideal State",
    mapped_contracts: ["docs/12_ai_os/08_DOCUMENTATION_BUILD_LOOP.md", "docs/03_pipeline/03_16_Loop_Enforcement_Specification.md"],
    enforcement_check(root) {
      const orc = path.join(root, "code/src/ai_os/refinementLoopOrchestrator.js");
      const ltv = path.join(root, "code/src/modules/loopTerminationValidator.js");
      const leo = path.join(root, "code/src/modules/loopEnforcementOrchestrator.js");
      if (!fs.existsSync(orc) || !fs.existsSync(ltv)) return { status: "MISSING", reason: "refinementLoopOrchestrator or loopTerminationValidator missing" };
      if (!fs.existsSync(leo)) return { status: "PARTIAL", reason: "Refinement loop exists but formal Loop Enforcement Orchestrator missing" };
      return { status: "ENFORCED", reason: "refinementLoopOrchestrator + loopTerminationValidator + loopEnforcementOrchestrator found" };
    }
  },
  {
    clause_id: "CLAUSE_5",
    name: "Code ↔ Documentation Consistency Enforcement",
    mapped_contracts: ["docs/09_verify/09_18_Code_to_Spec_Trace_Validator_Contract.md"],
    enforcement_check(root) {
      const trace = path.join(root, "code/src/modules/traceEngine.js");
      const validator = path.join(root, "code/src/modules/codeToSpecTraceValidator.js");
      if (!fs.existsSync(trace)) return { status: "MISSING", reason: "traceEngine.js missing" };
      if (!fs.existsSync(validator)) return { status: "PARTIAL", reason: "traceEngine exists but codeToSpecTraceValidator missing" };
      return { status: "ENFORCED", reason: "traceEngine + codeToSpecTraceValidator found" };
    }
  },
  {
    clause_id: "CLAUSE_6",
    name: "Automatic Test Evidence Requirement",
    mapped_contracts: ["docs/09_verify/09_18_Code_to_Spec_Trace_Validator_Contract.md"],
    enforcement_check(root) {
      const ve = path.join(root, "code/src/modules/verifyEngine.js");
      if (!fs.existsSync(ve)) return { status: "MISSING", reason: "verifyEngine.js missing" };
      const src = fs.readFileSync(ve, "utf-8");
      const ok = src.includes("buildTestEvidence") && src.includes("test_evidence.json") && src.includes("test_evidence_present");
      return ok
        ? { status: "ENFORCED", reason: "buildTestEvidence + test_evidence_present gate found" }
        : { status: "PARTIAL", reason: "verifyEngine exists but test evidence not fully enforced" };
    }
  },
  {
    clause_id: "CLAUSE_7",
    name: "Full Completion Only When Deterministically Verified",
    mapped_contracts: ["docs/08_audit/08_Forge_Boundary_Audit_Rules_Fail-Closed_Pack.md"],
    enforcement_check(root) {
      const audit = path.join(root, "code/src/modules/auditEngine.js");
      const verify = path.join(root, "code/src/modules/verifyEngine.js");
      const runner = path.join(root, "code/src/orchestrator/runner.js");
      const allExist = [audit, verify, runner].every((p) => fs.existsSync(p));
      if (!allExist) return { status: "MISSING", reason: "auditEngine, verifyEngine, or runner missing" };
      const runnerSrc = fs.readFileSync(runner, "utf-8");
      const hasFail = runnerSrc.includes("AUDIT BLOCKED") || runnerSrc.includes("BLOCKED");
      return hasFail
        ? { status: "ENFORCED", reason: "auditEngine + verifyEngine + fail-closed runner found" }
        : { status: "PARTIAL", reason: "Modules exist but fail-closed enforcement not verified in runner" };
    }
  }
];

function runVisionAlignmentValidator(options = {}) {
  const root = String(options.root || ROOT);
  const outputDir = path.join(root, "artifacts", "verify", "vision");
  ensureDir(outputDir);
  const artifactPath = path.join(outputDir, "vision_alignment_report.json");

  const clauseResults = VISION_CLAUSE_MAP.map((clause) => {
    const check = clause.enforcement_check(root);
    return {
      clause_id: clause.clause_id,
      name: clause.name,
      mapped_contracts: clause.mapped_contracts,
      enforcement_status: check.status,
      gap_classification: check.status === "ENFORCED" ? "NONE" : check.status === "PARTIAL" ? "PARTIAL" : "MISSING",
      reason: check.reason
    };
  });

  const enforced = clauseResults.filter((c) => c.enforcement_status === "ENFORCED").length;
  const partial = clauseResults.filter((c) => c.enforcement_status === "PARTIAL").length;
  const missing = clauseResults.filter((c) => c.enforcement_status === "MISSING").length;
  const passed = missing === 0 && partial === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    total_clauses: VISION_CLAUSE_MAP.length,
    enforced: enforced,
    partial: partial,
    missing: missing,
    result: passed ? "PASS" : "FAIL",
    gap_summary: { NONE: enforced, PARTIAL: partial, MISSING: missing },
    clauses: clauseResults
  };

  writeJson(artifactPath, artifact);

  const failedClauses = clauseResults.filter((c) => c.enforcement_status !== "ENFORCED");

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/vision/vision_alignment_report.json",
    enforced,
    partial,
    missing,
    failed_clauses: failedClauses.map((c) => ({ id: c.clause_id, status: c.enforcement_status, reason: c.reason })),
    blocked: !passed,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Vision Alignment Validator: PASS" }
      : { blocking_questions: [`Vision Alignment Validator FAIL — ${failedClauses.length} clause(s) not fully enforced`], next_step: "" }
  };
}

module.exports = { runVisionAlignmentValidator, VISION_CLAUSE_MAP };
