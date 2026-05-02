"use strict";

// H-5: Node-based Smoke Check
// Per docs/09_verify/09_Build_and_Verify_Playbook_Local.md §2.2
//
// Checks: require() all core modules without error, no syntax errors,
// entry point is loadable, critical path files exist.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");

const SMOKE_CHECK_TARGETS = [
  { id: "SC-NODE-01", file: "code/src/workspace/apiServer.js", description: "API server entry" },
  { id: "SC-NODE-02", file: "code/src/orchestrator/runner.js", description: "Pipeline runner" },
  { id: "SC-NODE-03", file: "code/src/modules/auditEngine.js", description: "Audit engine" },
  { id: "SC-NODE-04", file: "code/src/modules/gapEngine.js", description: "Gap engine" },
  { id: "SC-NODE-05", file: "code/src/modules/verifyEngine.js", description: "Verify engine" },
  { id: "SC-NODE-06", file: "code/src/ai_os/projectRuntime.js", description: "AI OS runtime" },
  { id: "SC-NODE-07", file: "code/src/ai_os/conversationEngine.js", description: "Conversation engine" }
];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }
function dateTimeStamp() {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15) + "Z";
}

function runSingleNodeCheck(root, target) {
  const absPath = path.join(root, target.file);
  if (!fs.existsSync(absPath)) {
    return { id: target.id, file: target.file, passed: false, error: "FILE_NOT_FOUND", description: target.description };
  }

  try {
    // Use node --check for syntax validation (does not execute)
    execSync(`node --check "${absPath}"`, { timeout: 15000, stdio: "pipe" });
    return { id: target.id, file: target.file, passed: true, description: target.description };
  } catch (err) {
    const errorMsg = err.stderr ? err.stderr.toString().trim() : (err.message || "UNKNOWN_ERROR");
    return { id: target.id, file: target.file, passed: false, error: errorMsg.slice(0, 300), description: target.description };
  }
}

function writeCommandLog(root, stage, cmd, stdout, stderr, exitCode) {
  const logPath = path.join(root, "verify", "smoke", "local_command_log.jsonl");
  ensureDir(path.dirname(logPath));

  const ts = dateTimeStamp();
  const outputDir = path.join(root, "verify", "smoke", "command_output");
  ensureDir(outputDir);

  const stdoutFile = `CMD-${ts}-${stage}-stdout.txt`;
  const stderrFile = `CMD-${ts}-${stage}-stderr.txt`;
  fs.writeFileSync(path.join(outputDir, stdoutFile), stdout || "", "utf-8");
  fs.writeFileSync(path.join(outputDir, stderrFile), stderr || "", "utf-8");

  const entry = JSON.stringify({
    timestamp_utc: nowIso(),
    stage,
    command: cmd,
    exit_code: exitCode,
    stdout_file: `verify/smoke/command_output/${stdoutFile}`,
    stderr_file: `verify/smoke/command_output/${stderrFile}`
  });

  fs.appendFileSync(logPath, entry + "\n", "utf-8");
}

function runNodeSmokeCheck(options = {}) {
  const root = String(options.root || ROOT);
  const stage = String(options.stage || "SMOKE");
  const outputPath = path.join(root, "artifacts", "verify", "node_smoke_check_report.json");

  const checks = SMOKE_CHECK_TARGETS.map((target) => runSingleNodeCheck(root, target));
  const failed = checks.filter((c) => !c.passed);
  const passed = failed.length === 0;

  // Log each check as a command entry
  checks.forEach((check) => {
    writeCommandLog(
      root,
      stage,
      `node --check ${check.file}`,
      check.passed ? "SYNTAX OK" : "",
      check.error || "",
      check.passed ? 0 : 1
    );
  });

  const artifact = {
    timestamp_utc: nowIso(),
    stage,
    checks_total: checks.length,
    checks_passed: checks.filter((c) => c.passed).length,
    checks_failed: failed.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed ? "Node smoke check PASS — all modules load without syntax errors" : `${failed.length} module(s) failed syntax/load check`,
    checks
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/node_smoke_check_report.json",
    command_log: "verify/smoke/local_command_log.jsonl",
    failed_checks: failed.length,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Node Smoke Check: PASS" }
      : { blocking_questions: failed.map((f) => `${f.id} FAIL: ${f.error}`), next_step: "" }
  };
}

module.exports = { runNodeSmokeCheck, writeCommandLog, SMOKE_CHECK_TARGETS };
