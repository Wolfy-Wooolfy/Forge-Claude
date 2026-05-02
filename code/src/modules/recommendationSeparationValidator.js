"use strict";

// H-3: Recommendation-Decision Separation Validator
// Recommendation artifacts (proposals before decision) must be separate from Decision artifacts.
// A Recommendation MUST NOT contain decision_status=ACCEPTED or equivalent.
// A Decision MUST NOT be used as a Recommendation substitute.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const RECOMMENDATION_FIELDS = ["recommendation_id", "recommended_option", "recommendation_rationale"];
const DECISION_FIELDS = ["decision_id", "decision_status", "selected_option", "authority"];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function classifyArtifact(data) {
  if (!data || typeof data !== "object") return "UNKNOWN";
  const hasDecisionFields = DECISION_FIELDS.filter((f) => data[f] !== undefined).length;
  const hasRecommendationFields = RECOMMENDATION_FIELDS.filter((f) => data[f] !== undefined).length;
  if (hasDecisionFields >= 2) return "DECISION";
  if (hasRecommendationFields >= 2) return "RECOMMENDATION";
  return "UNKNOWN";
}

function checkRecommendationArtifact(filePath, data) {
  const violations = [];
  const kind = classifyArtifact(data);

  if (kind === "RECOMMENDATION") {
    const hasDecisionStatus = !!(data.decision_status || data.status === "ACCEPTED");
    if (hasDecisionStatus) {
      violations.push({
        violation: "RECOMMENDATION_CONTAINS_DECISION_STATUS",
        file: filePath,
        note: "Recommendation artifact must not contain decision_status or status=ACCEPTED"
      });
    }
    const hasAuthority = !!(data.authority || data.decision_authority);
    if (hasAuthority) {
      violations.push({
        violation: "RECOMMENDATION_CLAIMS_AUTHORITY",
        file: filePath,
        note: "Recommendation artifact must not claim decision authority"
      });
    }
  }

  if (kind === "DECISION") {
    const hasRecommendationOnlyField = RECOMMENDATION_FIELDS.some((f) => data[f] !== undefined);
    if (hasRecommendationOnlyField) {
      violations.push({
        violation: "DECISION_CONTAINS_RECOMMENDATION_FIELDS",
        file: filePath,
        note: "Decision artifact contains recommendation-only fields — they must be in a separate Recommendation artifact"
      });
    }
  }

  return violations;
}

function scanDirectory(root, dir) {
  const violations = [];
  if (!fs.existsSync(dir)) return violations;

  function walk(d) {
    fs.readdirSync(d).forEach((entry) => {
      if (entry.startsWith(".")) return;
      const abs = path.join(d, entry);
      if (fs.statSync(abs).isDirectory()) { walk(abs); return; }
      if (!abs.endsWith(".json")) return;
      const data = readJsonSafe(abs, null);
      if (!data) return;
      const fileViolations = checkRecommendationArtifact(abs, data);
      violations.push(...fileViolations);
    });
  }
  walk(dir);
  return violations;
}

function runRecommendationSeparationValidator(options = {}) {
  const root = String(options.root || ROOT);
  const outputPath = path.join(root, "artifacts", "verify", "recommendation_separation_report.json");

  const decisionsViolations = scanDirectory(root, path.join(root, "artifacts", "decisions"));
  const projectsViolations = scanDirectory(root, path.join(root, "artifacts", "projects"));
  const allViolations = [...decisionsViolations, ...projectsViolations];
  const passed = allViolations.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    violations_found: allViolations.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed
      ? "Recommendation-Decision separation maintained"
      : `${allViolations.length} separation violation(s) — Recommendations and Decisions are mixed`,
    violations: allViolations
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/recommendation_separation_report.json",
    blocked: !passed,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Recommendation Separation: PASS" }
      : { blocking_questions: allViolations.map((v) => v.note), next_step: "" }
  };
}

module.exports = { runRecommendationSeparationValidator, classifyArtifact };
