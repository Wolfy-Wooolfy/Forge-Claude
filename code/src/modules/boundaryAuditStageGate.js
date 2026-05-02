"use strict";

// Records audit PASS per stage exit; enforces boundary audit before stage transition
// Artifact: artifacts/verify/audit/AUDIT-<date>-<stage>.json

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const STAGE_AUDIT_REQUIREMENTS = {
  STAGE_A: {
    required_artifacts: ["artifacts/intake/intake_snapshot.json", "artifacts/intake/intake_context.json"],
    description: "Intake and ideation closed"
  },
  STAGE_B: {
    required_artifacts: [
      "artifacts/stage_B/docs_coverage_matrix.md",
      "artifacts/verify/unit/docs_gap_validation_report.json"
    ],
    description: "Documentation spec closed with zero MUST gaps"
  },
  STAGE_C: {
    required_artifacts: [
      "artifacts/verify/unit/trace_validation_report.json",
      "artifacts/execute/execute_plan.json"
    ],
    description: "Code-to-spec trace validated"
  },
  STAGE_D: {
    required_artifacts: [
      "artifacts/verify/verification_results.json",
      "artifacts/verify/test_evidence.json"
    ],
    description: "Verification and test evidence complete"
  }
};

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }
function dateStamp() { return new Date().toISOString().slice(0, 10).replace(/-/g, ""); }

function checkStageBoundary(root, stageName) {
  const stageDef = STAGE_AUDIT_REQUIREMENTS[stageName];
  if (!stageDef) return { passed: false, reason: `Unknown stage: ${stageName}`, missing: [] };

  const missing = stageDef.required_artifacts.filter((rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return true;
    if (rel.endsWith(".json")) {
      const data = readJsonSafe(abs, {});
      return data.result === "FAIL" || data.blocked === true;
    }
    return false;
  });

  return { passed: missing.length === 0, missing, description: stageDef.description };
}

function runBoundaryAuditStageGate(options = {}) {
  const root = String(options.root || ROOT);
  const stageName = String(options.stage || "").toUpperCase();

  if (!STAGE_AUDIT_REQUIREMENTS[stageName]) {
    return {
      ok: false,
      result: "FAIL",
      blocked: true,
      reason: `Unknown stage: ${stageName}. Valid: ${Object.keys(STAGE_AUDIT_REQUIREMENTS).join(", ")}`,
      status_patch: {
        blocking_questions: [`Boundary Audit: unknown stage '${stageName}'`],
        next_step: ""
      }
    };
  }

  const check = checkStageBoundary(root, stageName);
  const auditDir = path.join(root, "artifacts", "verify", "audit");
  const artifactName = `AUDIT-${dateStamp()}-${stageName}.json`;
  const outputPath = path.join(auditDir, artifactName);

  const artifact = {
    timestamp_utc: nowIso(),
    stage: stageName,
    description: check.description,
    result: check.passed ? "PASS" : "FAIL",
    verdict: check.passed
      ? `${stageName} boundary audit PASS — stage exit allowed`
      : `${stageName} boundary audit FAIL — missing or failed artifacts: ${check.missing.join(", ")}`,
    missing_or_failed_artifacts: check.missing,
    required_artifacts: STAGE_AUDIT_REQUIREMENTS[stageName].required_artifacts
  };

  writeJson(outputPath, artifact);

  return {
    ok: check.passed,
    result: check.passed ? "PASS" : "FAIL",
    stage: stageName,
    artifact_path: `artifacts/verify/audit/${artifactName}`,
    blocked: !check.passed,
    status_patch: check.passed
      ? { blocking_questions: [], next_step: `Boundary Audit ${stageName}: PASS — stage exit allowed` }
      : { blocking_questions: [`Boundary Audit ${stageName} FAIL — missing artifacts: ${check.missing.join(", ")}`], next_step: "" }
  };
}

function auditAllStages(options = {}) {
  const root = String(options.root || ROOT);
  const results = {};
  for (const stageName of Object.keys(STAGE_AUDIT_REQUIREMENTS)) {
    results[stageName] = runBoundaryAuditStageGate({ root, stage: stageName });
  }
  return results;
}

module.exports = { runBoundaryAuditStageGate, auditAllStages, STAGE_AUDIT_REQUIREMENTS };
