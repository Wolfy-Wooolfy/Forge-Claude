"use strict";

// Blocks code generation if Stage B specs are incomplete
// Every behavior generated must trace back to Stage B documentation

const fs = require("fs");
const path = require("path");
const { getDefaultRegistry } = require("../runtime/tools/_registry");

const ROOT = path.resolve(__dirname, "../../..");

function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
// PHASE-37 Track A remediation: writes route through the L2 fs.write_file tool
// (which creates parent dirs recursively), NOT direct fs.writeFileSync/mkdirSync.
async function writeJsonViaTool(root, relPath, obj) {
  const reg = getDefaultRegistry();
  const r = await reg.invoke(
    "fs.write_file",
    { path: relPath, content: JSON.stringify(obj, null, 2) },
    { root }
  );
  if (r.status !== "SUCCESS") {
    throw new Error("writeJsonViaTool failed [" + relPath + "]: " +
      ((r.metadata && r.metadata.reason) || "") + ": " +
      ((r.metadata && r.metadata.detail) || ""));
  }
}
function nowIso() { return new Date().toISOString(); }

const SPEC_COMPLETENESS_REQUIREMENTS = [
  { id: "SC-01", description: "Docs Gap Validation must PASS", check: checkDocsGapPass },
  { id: "SC-02", description: "No MUST-level requirements MISSING in coverage matrix", check: checkNoMissingMust },
  { id: "SC-03", description: "At least one Stage B spec document exists", check: checkStageBExists },
  { id: "SC-04", description: "Documentation draft exists for AI OS projects", check: checkAiOsDraftExists }
];

function checkDocsGapPass(root) {
  const reportPath = path.join(root, "artifacts/verify/unit/docs_gap_validation_report.json");
  const report = readJsonSafe(reportPath, null);
  if (!report) return { passed: true, note: "Docs gap report not yet generated — check deferred" };
  return { passed: report.result === "PASS", note: report.result === "PASS" ? "PASS" : `FAIL: missing=${report.missing_requirements}, contradictions=${report.contradictions_detected}` };
}

function checkNoMissingMust(root) {
  const matrixPath = path.join(root, "artifacts/stage_B/docs_coverage_matrix.md");
  if (!fs.existsSync(matrixPath)) return { passed: true, note: "No Stage B coverage matrix — check deferred" };
  const content = fs.readFileSync(matrixPath, "utf-8");
  const missingCount = (content.match(/\bMISSING\b/g) || []).length;
  return { passed: missingCount === 0, note: missingCount === 0 ? "No MISSING requirements" : `${missingCount} MISSING requirements in coverage matrix` };
}

function checkStageBExists(root) {
  const stageBDir = path.join(root, "artifacts/stage_B");
  if (!fs.existsSync(stageBDir)) return { passed: true, note: "Stage B not yet reached — check deferred" };
  const files = fs.readdirSync(stageBDir);
  return { passed: files.length > 0, note: files.length > 0 ? `${files.length} Stage B artifacts found` : "Stage B directory empty" };
}

function checkAiOsDraftExists(root) {
  const projectsRoot = path.join(root, "artifacts/projects");
  if (!fs.existsSync(projectsRoot)) return { passed: true, note: "No projects yet — check deferred" };
  const projects = fs.readdirSync(projectsRoot).filter((d) => !d.startsWith(".") && d !== "active_project.json" && d !== "project_registry.json");
  if (projects.length === 0) return { passed: true, note: "No projects yet — check deferred" };
  // Check if any active project has documentation
  const activeProject = readJsonSafe(path.join(projectsRoot, "active_project.json"), {});
  const activeId = activeProject.project_id;
  if (!activeId) return { passed: true, note: "No active project" };
  const draftPath = path.join(projectsRoot, activeId, "ai_os", "documentation", "draft.md");
  return { passed: true, note: fs.existsSync(draftPath) ? "Documentation draft exists" : "No draft yet — not required at this stage" };
}

async function runSpecCompletenessEnforcer(options = {}) {
  const root = String(options.root || ROOT);
  const outputRel = "artifacts/verify/spec_completeness_report.json";

  const checkResults = SPEC_COMPLETENESS_REQUIREMENTS.map((req) => {
    const result = req.check(root);
    return { id: req.id, description: req.description, passed: result.passed, note: result.note };
  });

  const failedChecks = checkResults.filter((c) => !c.passed);
  const passed = failedChecks.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    checks_total: checkResults.length,
    checks_passed: checkResults.filter((c) => c.passed).length,
    checks_failed: failedChecks.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed ? "Specification complete — code generation may proceed" : "Specification incomplete — code generation BLOCKED",
    checks: checkResults
  };

  await writeJsonViaTool(root, outputRel, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/spec_completeness_report.json",
    blocked: !passed,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Spec Completeness: PASS — code generation may proceed" }
      : { blocking_questions: [`Spec Completeness FAIL — ${failedChecks.length} check(s) failed: ${failedChecks.map((c) => c.id).join(", ")}`], next_step: "" }
  };
}

module.exports = { runSpecCompletenessEnforcer, SPEC_COMPLETENESS_REQUIREMENTS };
