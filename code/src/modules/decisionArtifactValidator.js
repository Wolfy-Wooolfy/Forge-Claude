"use strict";

// Validates all mandatory fields in every decision artifact
// Per docs/07_decisions/DECISION_ARTIFACT_SCHEMA.md
// Mandatory fields: id, triggering_artifact, stage, fork, options, summary,
//   recommendation, decision, authority, timestamp_utc, impact, directive

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const MANDATORY_FIELDS = [
  { field: "id", type: "string", description: "Unique decision identifier" },
  { field: "triggering_artifact", type: "string", description: "Artifact that triggered this decision" },
  { field: "stage", type: "string", description: "Pipeline stage (A/B/C/D)" },
  { field: "fork", type: "string", description: "Fork type (e.g., OPTION_SELECT, BLOCK_OVERRIDE)" },
  { field: "options", type: "array", description: "Array of decision options presented" },
  { field: "summary", type: "string", description: "Summary of the decision context" },
  { field: "recommendation", type: "string", description: "Recommended path" },
  { field: "decision", type: "string", description: "The actual decision made" },
  { field: "authority", type: "string", description: "Who/what made the decision (HUMAN/SYSTEM/AI)" },
  { field: "timestamp_utc", type: "string", description: "ISO timestamp of decision" },
  { field: "impact", type: "string", description: "Impact description" },
  { field: "directive", type: "string", description: "Resulting directive / next action" }
];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function validateDecisionObject(decision, sourceFile) {
  const violations = [];

  for (const { field, type, description } of MANDATORY_FIELDS) {
    const value = decision[field];

    if (value === undefined || value === null) {
      violations.push({ field, violation: "MISSING", description, source: sourceFile });
      continue;
    }

    if (type === "string" && (typeof value !== "string" || value.trim() === "")) {
      violations.push({ field, violation: "EMPTY_STRING", description, source: sourceFile });
      continue;
    }

    if (type === "array" && !Array.isArray(value)) {
      violations.push({ field, violation: "NOT_ARRAY", description, source: sourceFile });
      continue;
    }

    if (type === "array" && Array.isArray(value) && value.length === 0) {
      violations.push({ field, violation: "EMPTY_ARRAY", description, source: sourceFile });
    }
  }

  return violations;
}

function findDecisionFiles(root) {
  const decisionsDir = path.join(root, "artifacts", "decisions");
  if (!fs.existsSync(decisionsDir)) return [];

  const files = [];
  function scanDir(dir) {
    fs.readdirSync(dir).forEach((entry) => {
      const abs = path.join(dir, entry);
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        scanDir(abs);
      } else if (entry.endsWith(".json")) {
        files.push(abs);
      }
    });
  }
  scanDir(decisionsDir);
  return files;
}

function runDecisionArtifactValidator(options = {}) {
  const root = String(options.root || ROOT);
  const outputPath = path.join(root, "artifacts", "verify", "decision_artifact_validation_report.json");

  const decisionFiles = findDecisionFiles(root);
  const allViolations = [];
  const validatedDecisions = [];
  let totalDecisions = 0;

  for (const filePath of decisionFiles) {
    const relPath = filePath.replace(root, "").replace(/\\/g, "/").replace(/^\//, "");
    const data = readJsonSafe(filePath, null);
    if (data === null) continue;

    const decisions = Array.isArray(data) ? data : [data];

    for (const decision of decisions) {
      if (typeof decision !== "object" || decision === null) continue;
      totalDecisions++;
      const violations = validateDecisionObject(decision, relPath);
      if (violations.length > 0) {
        allViolations.push(...violations);
        validatedDecisions.push({ id: decision.id || "(no id)", file: relPath, valid: false, violations: violations.length });
      } else {
        validatedDecisions.push({ id: decision.id || "(no id)", file: relPath, valid: true, violations: 0 });
      }
    }
  }

  const passed = allViolations.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    files_scanned: decisionFiles.length,
    total_decisions: totalDecisions,
    valid_decisions: validatedDecisions.filter((d) => d.valid).length,
    invalid_decisions: validatedDecisions.filter((d) => !d.valid).length,
    total_violations: allViolations.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed
      ? "All decision artifacts conform to schema"
      : `${allViolations.length} schema violation(s) across ${validatedDecisions.filter((d) => !d.valid).length} decision(s)`,
    violations: allViolations,
    decisions: validatedDecisions
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/decision_artifact_validation_report.json",
    blocked: !passed,
    total_decisions: totalDecisions,
    violations: allViolations.length,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Decision Artifact Validator: PASS — all decision schemas valid" }
      : { blocking_questions: [`Decision Schema FAIL — ${allViolations.length} violation(s) in decision artifacts`], next_step: "" }
  };
}

module.exports = { runDecisionArtifactValidator, MANDATORY_FIELDS, validateDecisionObject };
