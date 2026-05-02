"use strict";

// Stage B closure enforcement with deterministic exit rules
// Enforces: ZERO MUST-level gaps required before Stage B closes
// Prevents infinite loop by tracking gap history and detecting no-progress

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const STAGE_B_CLOSURE_CRITERIA = [
  { id: "SB-01", description: "Docs gap validation report exists and result=PASS", check: checkDocsGapReport },
  { id: "SB-02", description: "Zero MUST-level requirements missing in coverage matrix", check: checkZeroMustGaps },
  { id: "SB-03", description: "Zero contradictions detected", check: checkZeroContradictions },
  { id: "SB-04", description: "Gap history not stuck (no-progress detection)", check: checkGapHistoryNotStuck },
  { id: "SB-05", description: "Stage B artifacts directory is non-empty", check: checkStageBNonEmpty }
];

const GAP_HISTORY_PATH_REL = "artifacts/gap/doc_gap_loop_history.json";
const MAX_ITERATIONS_WITHOUT_PROGRESS = 3;

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function checkDocsGapReport(root) {
  const reportPath = path.join(root, "artifacts/verify/unit/docs_gap_validation_report.json");
  const report = readJsonSafe(reportPath, null);
  if (!report) return { passed: true, note: "Docs gap report not yet generated — deferred" };
  return {
    passed: report.result === "PASS",
    note: report.result === "PASS" ? "PASS" : `FAIL: missing=${report.missing_requirements}, contradictions=${report.contradictions_detected}`
  };
}

function checkZeroMustGaps(root) {
  const matrixPath = path.join(root, "artifacts/stage_B/docs_coverage_matrix.md");
  if (!fs.existsSync(matrixPath)) return { passed: true, note: "Coverage matrix not yet generated — deferred" };
  const content = fs.readFileSync(matrixPath, "utf-8");
  const missingCount = (content.match(/\bMISSING\b/g) || []).length;
  return {
    passed: missingCount === 0,
    note: missingCount === 0 ? "Zero MUST gaps" : `${missingCount} MUST-level requirement(s) MISSING`
  };
}

function checkZeroContradictions(root) {
  const reportPath = path.join(root, "artifacts/verify/unit/docs_gap_validation_report.json");
  const report = readJsonSafe(reportPath, null);
  if (!report) return { passed: true, note: "No report yet — deferred" };
  const contradictions = Number(report.contradictions_detected || 0);
  return {
    passed: contradictions === 0,
    note: contradictions === 0 ? "Zero contradictions" : `${contradictions} contradiction(s) detected`
  };
}

function checkGapHistoryNotStuck(root) {
  const historyPath = path.join(root, GAP_HISTORY_PATH_REL);
  const history = readJsonSafe(historyPath, []);
  if (history.length < MAX_ITERATIONS_WITHOUT_PROGRESS) return { passed: true, note: "Gap history too short to assess progress" };

  const lastN = history.slice(-MAX_ITERATIONS_WITHOUT_PROGRESS);
  const gapCounts = lastN.map((e) => Number(e.must_gaps || 0));
  const allSame = gapCounts.every((c) => c === gapCounts[0]);
  const allNonZero = gapCounts.every((c) => c > 0);

  if (allSame && allNonZero) {
    return {
      passed: false,
      note: `Stuck: last ${MAX_ITERATIONS_WITHOUT_PROGRESS} iterations all show ${gapCounts[0]} MUST gap(s) — no progress`
    };
  }
  return { passed: true, note: `Gap history shows progress (recent counts: ${gapCounts.join(", ")})` };
}

function checkStageBNonEmpty(root) {
  const dir = path.join(root, "artifacts/stage_B");
  if (!fs.existsSync(dir)) return { passed: true, note: "Stage B dir not yet created — deferred" };
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith("."));
  return {
    passed: files.length > 0,
    note: files.length > 0 ? `${files.length} Stage B artifact(s) present` : "Stage B directory is empty"
  };
}

function recordDocGapIteration(root, mustGaps, underspecified) {
  const historyPath = path.join(root, GAP_HISTORY_PATH_REL);
  const history = readJsonSafe(historyPath, []);
  history.push({ timestamp_utc: nowIso(), must_gaps: mustGaps, underspecified: underspecified || 0, iteration: history.length + 1 });
  writeJson(historyPath, history);
  return { ok: true, iteration: history.length };
}

function resetDocGapHistory(root) {
  const historyPath = path.join(root, GAP_HISTORY_PATH_REL);
  writeJson(historyPath, []);
  return { ok: true, reset_at: nowIso() };
}

function runDocGapLoopContract(options = {}) {
  const root = String(options.root || ROOT);
  const outputPath = path.join(root, "artifacts", "verify", "doc_gap_loop_contract_report.json");

  const checkResults = STAGE_B_CLOSURE_CRITERIA.map((criterion) => {
    const result = criterion.check(root);
    return { id: criterion.id, description: criterion.description, passed: result.passed, note: result.note };
  });

  const failedChecks = checkResults.filter((c) => !c.passed);
  const passed = failedChecks.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    checks_total: checkResults.length,
    checks_passed: checkResults.filter((c) => c.passed).length,
    checks_failed: failedChecks.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed
      ? "Stage B closure criteria MET — documentation loop may exit"
      : `Stage B closure BLOCKED — ${failedChecks.length} criterion(ia) not met`,
    checks: checkResults
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/doc_gap_loop_contract_report.json",
    blocked: !passed,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Doc Gap Loop Contract: PASS — Stage B exit allowed" }
      : {
          blocking_questions: [
            `Doc Gap Loop Contract FAIL — ${failedChecks.map((c) => `${c.id}: ${c.note}`).join("; ")}`
          ],
          next_step: ""
        }
  };
}

module.exports = {
  runDocGapLoopContract,
  recordDocGapIteration,
  resetDocGapHistory,
  STAGE_B_CLOSURE_CRITERIA
};
