"use strict";

// C-5: Canonical Artifact Container Validator
// Per docs/05_artifacts/05_18_Artifact_Serialization_and_Embedded_JSON_Rule.md
//
// Stage C artifacts MUST be Markdown files containing an embedded JSON block.
// Pattern: ```json ... ``` inside the .md file.
// Pure .json artifacts at Stage B/C/D must have valid structure.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

// Artifacts that MUST be Markdown containers with embedded JSON
const CANONICAL_CONTAINER_ARTIFACTS = [
  "artifacts/stage_C/code_trace_matrix.md",
  "artifacts/stage_C/code_mismatch_report.md",
  "artifacts/stage_C/test_evidence.md",
  "artifacts/stage_B/spec_pack_manifest.md",
  "artifacts/stage_B/docs_gap_report.md",
  "artifacts/stage_D/verification_report.md"
];

// Artifacts that must be valid JSON (not Markdown)
const JSON_ONLY_ARTIFACTS = [
  "artifacts/verify/verification_results.json",
  "artifacts/verify/test_evidence.json",
  "artifacts/trace/trace_matrix.json",
  "artifacts/gap/gap_actions.json"
];

const EMBEDDED_JSON_BLOCK_PATTERN = /```json\s*\n[\s\S]+?\n```/;

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function checkMarkdownContainer(root, relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) {
    return { passed: true, note: `${relPath} — not yet generated, deferred`, deferred: true };
  }

  const content = fs.readFileSync(abs, "utf-8");

  if (!content.trim().startsWith("#")) {
    return {
      passed: false,
      violation: "NOT_MARKDOWN_CONTAINER",
      file: relPath,
      note: `${relPath} must start with a Markdown heading (#)`
    };
  }

  if (!EMBEDDED_JSON_BLOCK_PATTERN.test(content)) {
    return {
      passed: false,
      violation: "MISSING_EMBEDDED_JSON",
      file: relPath,
      note: `${relPath} must contain an embedded JSON block (\`\`\`json ... \`\`\`)`
    };
  }

  // Extract and validate the embedded JSON
  const match = content.match(/```json\s*\n([\s\S]+?)\n```/);
  if (match) {
    try {
      JSON.parse(match[1]);
    } catch (e) {
      return {
        passed: false,
        violation: "INVALID_EMBEDDED_JSON",
        file: relPath,
        note: `${relPath} embedded JSON block is not valid JSON: ${e.message}`
      };
    }
  }

  return { passed: true, note: `${relPath} — valid Markdown container with embedded JSON` };
}

function checkJsonOnlyArtifact(root, relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) {
    return { passed: true, note: `${relPath} — not yet generated, deferred`, deferred: true };
  }

  try {
    const content = fs.readFileSync(abs, "utf-8");
    JSON.parse(content);
    return { passed: true, note: `${relPath} — valid JSON` };
  } catch (e) {
    return {
      passed: false,
      violation: "INVALID_JSON_ARTIFACT",
      file: relPath,
      note: `${relPath} is not valid JSON: ${e.message}`
    };
  }
}

function runCanonicalArtifactValidator(options = {}) {
  const root = String(options.root || ROOT);
  const outputPath = path.join(root, "artifacts", "verify", "canonical_artifact_validation_report.json");

  const violations = [];
  const checks = [];

  for (const relPath of CANONICAL_CONTAINER_ARTIFACTS) {
    const result = checkMarkdownContainer(root, relPath);
    checks.push({ type: "MARKDOWN_CONTAINER", file: relPath, ...result });
    if (!result.passed && !result.deferred) violations.push(result);
  }

  for (const relPath of JSON_ONLY_ARTIFACTS) {
    const result = checkJsonOnlyArtifact(root, relPath);
    checks.push({ type: "JSON_ONLY", file: relPath, ...result });
    if (!result.passed && !result.deferred) violations.push(result);
  }

  const passed = violations.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    markdown_containers_checked: CANONICAL_CONTAINER_ARTIFACTS.length,
    json_artifacts_checked: JSON_ONLY_ARTIFACTS.length,
    violations_found: violations.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed
      ? "All artifact containers conform to canonical format rules"
      : `${violations.length} artifact container violation(s) — Markdown+JSON or JSON-only format not met`,
    checks,
    violations
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/canonical_artifact_validation_report.json",
    blocked: !passed,
    violations: violations.length,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Canonical Artifact Validator: PASS" }
      : { blocking_questions: violations.map((v) => `${v.violation}: ${v.note}`), next_step: "" }
  };
}

module.exports = { runCanonicalArtifactValidator, CANONICAL_CONTAINER_ARTIFACTS, JSON_ONLY_ARTIFACTS };
