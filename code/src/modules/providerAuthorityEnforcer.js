"use strict";

// Enforces docs/12_ai_os/13_AI_PROVIDER_ROLE.md — No Provider → No Discovery
// Scans all AI OS + modules for forbidden local logic replacing provider calls

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const FORBIDDEN_PATTERNS = [
  { id: "KEYWORD_MATCHING", pattern: /\.includes\(['"]\w{3,}\s*(domain|type|category)/i, description: "Keyword-based domain/type matching" },
  { id: "STATIC_DOMAIN_TEMPLATE", pattern: /const\s+\w*(domain|template|type)\w*\s*=\s*\{[^}]{20,}/i, description: "Static domain template object" },
  { id: "HARDCODED_REQUIREMENT_FLOW", pattern: /if\s*\(\s*\w*domain\w*\s*===?\s*['"][a-z]/i, description: "Hardcoded requirement flow by domain string" },
  { id: "RULE_BASED_INFERENCE", pattern: /inferProjectType|inferDomain|detectDomain|classifyByKeyword/i, description: "Rule-based inference function" },
  { id: "MANUAL_QUESTION_GEN", pattern: /questions\.push|clarificationQuestions\.push.*if\s*\(/i, description: "Manual clarification question generation" },
  { id: "FALLBACK_TO_LOCAL", pattern: /fallback.*local|localFallback|useLocalLogic/i, description: "Explicit fallback to local logic" }
];

const SCAN_DIRS = ["code/src/ai_os", "code/src/modules", "code/src/workspace"];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function scanFile(filePath, root) {
  let src;
  try { src = fs.readFileSync(filePath, "utf-8"); }
  catch (_) { return []; }

  const relPath = filePath.replace(root, "").replace(/\\/g, "/").replace(/^\//, "");
  const findings = [];

  for (const { id, pattern, description } of FORBIDDEN_PATTERNS) {
    if (pattern.test(src)) {
      // Find line number
      const lines = src.split("\n");
      const lineNum = lines.findIndex((l) => pattern.test(l)) + 1;
      findings.push({ violation_id: id, file: relPath, line: lineNum, description, severity: "CRITICAL" });
    }
  }

  return findings;
}

function runProviderAuthorityEnforcer(options = {}) {
  const root = String(options.root || ROOT);
  const outputPath = path.join(root, "artifacts", "verify", "provider_authority_report.json");

  const allViolations = [];
  const scannedFiles = [];

  for (const dir of SCAN_DIRS) {
    const absDir = path.join(root, dir);
    if (!fs.existsSync(absDir)) continue;
    fs.readdirSync(absDir).forEach((file) => {
      if (!file.endsWith(".js")) return;
      const absFile = path.join(absDir, file);
      scannedFiles.push(`${dir}/${file}`);
      const findings = scanFile(absFile, root);
      allViolations.push(...findings);
    });
  }

  const passed = allViolations.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    files_scanned: scannedFiles.length,
    violations_found: allViolations.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed ? "No forbidden local logic detected — Provider Authority intact" : "INVALID_AI_USAGE — forbidden patterns detected",
    violations: allViolations
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/provider_authority_report.json",
    blocked: !passed,
    files_scanned: scannedFiles.length,
    violations: allViolations.length,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Provider Authority Enforcer: PASS — No forbidden local logic" }
      : { blocking_questions: [`INVALID_AI_USAGE — ${allViolations.length} forbidden pattern(s) detected. See artifacts/verify/provider_authority_report.json`], next_step: "" }
  };
}

module.exports = { runProviderAuthorityEnforcer, FORBIDDEN_PATTERNS };
