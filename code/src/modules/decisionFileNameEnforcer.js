"use strict";

// C-1: Decision File Naming & Immutability Enforcement
// Per docs/07_decisions/07_Decision_Logging_and_Change_Traceability_Specification.md
//
// Rules enforced:
//   - Decision files MUST match pattern: DEC-YYYYMMDD-NNN.json or DEC-YYYYMMDD-NNN.md
//   - Decision files MUST reside under artifacts/decisions/ (never at root)
//   - Once status=ACCEPTED, no field may change (immutability)
//   - SUPERSEDED decisions must reference their successor

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const DECISION_NAMING_PATTERN = /^DEC-\d{8}-\d{3}\.(json|md)$/;
const ACCEPTED_STATUSES = ["ACCEPTED", "SUPERSEDED", "REJECTED"];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function findDecisionFiles(root) {
  const dir = path.join(root, "artifacts", "decisions");
  if (!fs.existsSync(dir)) return [];
  const files = [];
  function walk(d) {
    fs.readdirSync(d).forEach((entry) => {
      const abs = path.join(d, entry);
      if (fs.statSync(abs).isDirectory()) { walk(abs); }
      else if (entry.endsWith(".json") || entry.endsWith(".md")) { files.push(abs); }
    });
  }
  walk(dir);
  return files;
}

function checkNamingConvention(filePath) {
  const name = path.basename(filePath);
  if (!DECISION_NAMING_PATTERN.test(name)) {
    return { passed: false, violation: "INVALID_NAMING", file: filePath, note: `Filename '${name}' must match DEC-YYYYMMDD-NNN.(json|md)` };
  }
  return { passed: true };
}

function checkLocationConstraint(root, filePath) {
  const rel = filePath.replace(root, "").replace(/\\/g, "/").replace(/^\//, "");
  const allowed = rel.startsWith("artifacts/decisions/");
  if (!allowed) {
    return { passed: false, violation: "INVALID_LOCATION", file: filePath, note: `Decision file must be under artifacts/decisions/, found at: ${rel}` };
  }
  return { passed: true };
}

function checkImmutabilityViolation(root, filePath) {
  if (!filePath.endsWith(".json")) return { passed: true };
  const data = readJsonSafe(filePath, null);
  if (!data) return { passed: true };

  const status = String(data.status || data.decision_status || "").toUpperCase();
  if (!ACCEPTED_STATUSES.includes(status)) return { passed: true };

  // Check immutability snapshot
  const immutabilityDir = path.join(root, "artifacts", "decisions", ".snapshots");
  const snapshotPath = path.join(immutabilityDir, path.basename(filePath) + ".snapshot.json");

  if (!fs.existsSync(snapshotPath)) {
    // First time: record snapshot
    writeJson(snapshotPath, { snapshotted_at: nowIso(), hash: simpleHash(JSON.stringify(data)), status });
    return { passed: true, note: "Snapshot created" };
  }

  const snapshot = readJsonSafe(snapshotPath, {});
  const currentHash = simpleHash(JSON.stringify(data));
  if (snapshot.hash && snapshot.hash !== currentHash) {
    return {
      passed: false,
      violation: "IMMUTABILITY_VIOLATION",
      file: filePath,
      note: `Decision with status=${status} was modified after acceptance. Hash mismatch.`
    };
  }
  return { passed: true };
}

function checkSupersededHasSuccessor(filePath) {
  if (!filePath.endsWith(".json")) return { passed: true };
  const data = readJsonSafe(filePath, null);
  if (!data) return { passed: true };
  const status = String(data.status || data.decision_status || "").toUpperCase();
  if (status !== "SUPERSEDED") return { passed: true };

  const hasSuccessor = !!(data.superseded_by || data.successor_decision_id);
  if (!hasSuccessor) {
    return {
      passed: false,
      violation: "SUPERSEDED_MISSING_SUCCESSOR",
      file: filePath,
      note: "SUPERSEDED decision must reference successor via superseded_by field"
    };
  }
  return { passed: true };
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return String(Math.abs(hash));
}

function recordImmutabilitySnapshot(root, decisionId, data) {
  const fileName = `${decisionId}.json`;
  const filePath = path.join(root, "artifacts", "decisions", fileName);
  const snapshotDir = path.join(root, "artifacts", "decisions", ".snapshots");
  const snapshotPath = path.join(snapshotDir, fileName + ".snapshot.json");
  writeJson(snapshotPath, {
    snapshotted_at: nowIso(),
    decision_id: decisionId,
    hash: simpleHash(JSON.stringify(data)),
    status: data.status || data.decision_status || "UNKNOWN",
    file_path: filePath
  });
  return { ok: true, snapshot_path: snapshotPath };
}

function runDecisionFileNameEnforcer(options = {}) {
  const root = String(options.root || ROOT);
  const outputPath = path.join(root, "artifacts", "verify", "decision_naming_enforcement_report.json");

  const files = findDecisionFiles(root);
  const violations = [];

  for (const filePath of files) {
    const naming = checkNamingConvention(filePath);
    if (!naming.passed) violations.push(naming);

    const location = checkLocationConstraint(root, filePath);
    if (!location.passed) violations.push(location);

    const immutability = checkImmutabilityViolation(root, filePath);
    if (!immutability.passed) violations.push(immutability);

    const superseded = checkSupersededHasSuccessor(filePath);
    if (!superseded.passed) violations.push(superseded);
  }

  const passed = violations.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    files_scanned: files.length,
    violations_found: violations.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed
      ? "All decision files conform to naming, location, and immutability rules"
      : `${violations.length} decision governance violation(s) detected`,
    violations
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/decision_naming_enforcement_report.json",
    blocked: !passed,
    violations: violations.length,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Decision Naming Enforcer: PASS" }
      : { blocking_questions: violations.map((v) => `${v.violation}: ${v.note}`), next_step: "" }
  };
}

module.exports = { runDecisionFileNameEnforcer, recordImmutabilitySnapshot, DECISION_NAMING_PATTERN };
