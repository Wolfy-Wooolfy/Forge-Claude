"use strict";

// H-4: Codex Provider Input/Output Contract Validator
// Per docs/11_ai_layer/10_CODEX_PROVIDER_CONTRACT.md
//
// Input contract: { task_id, request, context, expected_output }
// Output contract: { task_id, status, output: { files: [{ path, content, diff }] }, metadata: { engine } }
// Codex has NO execution authority — it may only propose file changes.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const INPUT_REQUIRED_FIELDS = ["task_id", "request", "context", "expected_output"];
const OUTPUT_REQUIRED_FIELDS = ["task_id", "status", "output", "metadata"];
const OUTPUT_STATUSES = ["SUCCESS", "FAILED", "PARTIAL"];
const CODEX_FORBIDDEN_AUTHORITY = ["execute", "deploy", "commit", "push", "delete", "overwrite"];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function validateCodexInput(input) {
  const violations = [];
  if (!input || typeof input !== "object") {
    return [{ field: "input", violation: "NOT_OBJECT", note: "Codex input must be an object" }];
  }

  for (const field of INPUT_REQUIRED_FIELDS) {
    if (input[field] === undefined || input[field] === null) {
      violations.push({ field, violation: "MISSING_REQUIRED_FIELD", note: `Codex input missing required field: ${field}` });
    }
  }

  if (input.task_id !== undefined && (typeof input.task_id !== "string" || !input.task_id.trim())) {
    violations.push({ field: "task_id", violation: "INVALID_TASK_ID", note: "task_id must be a non-empty string" });
  }

  return violations;
}

function validateCodexOutput(output) {
  const violations = [];
  if (!output || typeof output !== "object") {
    return [{ field: "output", violation: "NOT_OBJECT", note: "Codex output must be an object" }];
  }

  for (const field of OUTPUT_REQUIRED_FIELDS) {
    if (output[field] === undefined || output[field] === null) {
      violations.push({ field, violation: "MISSING_REQUIRED_FIELD", note: `Codex output missing required field: ${field}` });
    }
  }

  if (output.status && !OUTPUT_STATUSES.includes(String(output.status).toUpperCase())) {
    violations.push({ field: "status", violation: "INVALID_STATUS", note: `Codex output status must be one of: ${OUTPUT_STATUSES.join(", ")}` });
  }

  if (output.output) {
    if (!Array.isArray(output.output.files)) {
      violations.push({ field: "output.files", violation: "FILES_NOT_ARRAY", note: "output.files must be an array" });
    } else {
      output.output.files.forEach((file, i) => {
        if (!file.path) violations.push({ field: `output.files[${i}].path`, violation: "MISSING_PATH", note: `File entry ${i} missing path` });
        if (!file.content && !file.diff) violations.push({ field: `output.files[${i}]`, violation: "MISSING_CONTENT_OR_DIFF", note: `File entry ${i} must have content or diff` });
      });
    }
  }

  if (output.metadata && !output.metadata.engine) {
    violations.push({ field: "metadata.engine", violation: "MISSING_ENGINE", note: "metadata.engine must be present" });
  }

  // Verify Codex has not claimed execution authority
  const outputStr = JSON.stringify(output || {}).toLowerCase();
  for (const forbidden of CODEX_FORBIDDEN_AUTHORITY) {
    if (new RegExp(`"action":\\s*"${forbidden}"`).test(outputStr)) {
      violations.push({ field: "authority", violation: "CODEX_AUTHORITY_VIOLATION", note: `Codex output claims execution action '${forbidden}' — Codex is a generation-only provider` });
    }
  }

  return violations;
}

function runCodexContractValidator(options = {}) {
  const root = String(options.root || ROOT);
  const outputPath = path.join(root, "artifacts", "verify", "codex_contract_report.json");

  // Scan codex interaction logs if they exist
  const logsDir = path.join(root, "artifacts", "llm");
  const logViolations = [];

  if (fs.existsSync(logsDir)) {
    fs.readdirSync(logsDir).forEach((f) => {
      if (!f.endsWith(".json")) return;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(logsDir, f), "utf-8"));
        if (data.provider !== "codex" && data.engine !== "codex") return;

        if (data.input) {
          const inputViolations = validateCodexInput(data.input);
          logViolations.push(...inputViolations.map((v) => ({ ...v, file: f, phase: "INPUT" })));
        }
        if (data.output) {
          const outputViolations = validateCodexOutput(data.output);
          logViolations.push(...outputViolations.map((v) => ({ ...v, file: f, phase: "OUTPUT" })));
        }
      } catch (_) { /* skip unreadable */ }
    });
  }

  // Validate codexProvider.js exists and has no autonomous execution
  const codexPath = path.join(root, "code/src/providers/codexProvider.js");
  if (fs.existsSync(codexPath)) {
    const src = fs.readFileSync(codexPath, "utf-8");
    const autonomousPatterns = [/\.exec\(.*--apply/i, /fs\.writeFileSync.*from.*codex/i];
    for (const pattern of autonomousPatterns) {
      if (pattern.test(src)) {
        logViolations.push({
          file: "code/src/providers/codexProvider.js",
          violation: "CODEX_AUTONOMOUS_EXECUTION",
          note: "codexProvider.js appears to apply changes autonomously",
          phase: "IMPLEMENTATION"
        });
      }
    }
  }

  const passed = logViolations.length === 0;
  const artifact = {
    timestamp_utc: nowIso(),
    violations_found: logViolations.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed ? "Codex contract validation PASS" : `${logViolations.length} Codex contract violation(s)`,
    violations: logViolations,
    input_required_fields: INPUT_REQUIRED_FIELDS,
    output_required_fields: OUTPUT_REQUIRED_FIELDS
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/codex_contract_report.json",
    blocked: !passed,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Codex Contract Validator: PASS" }
      : { blocking_questions: logViolations.map((v) => v.note), next_step: "" }
  };
}

module.exports = { runCodexContractValidator, validateCodexInput, validateCodexOutput };
