"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const PROVIDER_CONTRACT = {
  required_methods: ["executeTask"],
  required_return_fields: ["status", "output", "metadata"],
  allowed_statuses: ["SUCCESS", "FAILED"],
  forbidden_patterns: [/keyword.*match/i, /static.*domain.*template/i, /hardcoded.*requirement/i, /if.*===.*"domain"/i]
};

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readFileSafe(p) {
  try { return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null; }
  catch (_) { return null; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function auditProviderFile(filePath) {
  const src = readFileSafe(filePath);
  if (!src) return { file: filePath, violations: [{ rule: "FILE_MISSING", detail: "Provider file not found" }] };

  const violations = [];

  // Check required methods
  if (!src.includes("executeTask")) {
    violations.push({ rule: "MISSING_EXECUTE_TASK", detail: "Provider missing executeTask() method" });
  }

  // Check return structure
  if (!src.includes('"SUCCESS"') && !src.includes("'SUCCESS'")) {
    violations.push({ rule: "MISSING_SUCCESS_STATUS", detail: "Provider never returns status: SUCCESS" });
  }
  if (!src.includes("metadata")) {
    violations.push({ rule: "MISSING_METADATA", detail: "Provider return missing metadata field" });
  }

  // Check for forbidden patterns
  for (const pattern of PROVIDER_CONTRACT.forbidden_patterns) {
    if (pattern.test(src)) {
      violations.push({ rule: "FORBIDDEN_PATTERN", detail: `Forbidden pattern detected: ${pattern.toString()}` });
    }
  }

  // Check fail-closed: provider must handle API errors
  if (!src.includes("catch") && !src.includes("FAILED")) {
    violations.push({ rule: "MISSING_ERROR_HANDLING", detail: "Provider has no error handling / FAILED status path" });
  }

  return { file: filePath.replace(ROOT, "").replace(/\\/g, "/"), violations };
}

function runCognitiveLayerContractEnforcer(options = {}) {
  const root = String(options.root || ROOT);
  const providersDir = path.join(root, "code/src/providers");
  const outputPath = path.join(root, "artifacts", "verify", "cognitive_layer_contract_report.json");

  if (!fs.existsSync(providersDir)) {
    const result = { timestamp_utc: nowIso(), result: "FAIL", error: "providers directory missing", violations: [] };
    writeJson(outputPath, result);
    return { ok: false, result: "FAIL", blocked: true, artifact_path: "artifacts/verify/cognitive_layer_contract_report.json", status_patch: { blocking_questions: ["Cognitive Layer Contract FAIL: providers directory missing"], next_step: "" } };
  }

  const providerFiles = fs.readdirSync(providersDir)
    .filter((f) => f.endsWith(".js") && f !== "providerRouter.js")
    .map((f) => path.join(providersDir, f));

  const auditResults = providerFiles.map(auditProviderFile);
  const violatingProviders = auditResults.filter((r) => r.violations.length > 0);
  const totalViolations = violatingProviders.reduce((sum, r) => sum + r.violations.length, 0);

  // Only block on FORBIDDEN_PATTERN or FILE_MISSING — other violations are warnings
  const blockingViolations = violatingProviders.flatMap((r) =>
    r.violations.filter((v) => ["FORBIDDEN_PATTERN", "FILE_MISSING"].includes(v.rule))
  );
  const passed = blockingViolations.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    providers_audited: providerFiles.length,
    providers_with_violations: violatingProviders.length,
    total_violations: totalViolations,
    blocking_violations: blockingViolations.length,
    result: passed ? "PASS" : "FAIL",
    provider_audits: auditResults,
    contract_rules: PROVIDER_CONTRACT.required_methods
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/cognitive_layer_contract_report.json",
    blocked: !passed,
    providers_audited: providerFiles.length,
    violations: totalViolations,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Cognitive Layer Contract: PASS" }
      : { blocking_questions: [`Cognitive Layer Contract FAIL — ${blockingViolations.length} blocking violation(s) in providers`], next_step: "" }
  };
}

module.exports = { runCognitiveLayerContractEnforcer, PROVIDER_CONTRACT };
