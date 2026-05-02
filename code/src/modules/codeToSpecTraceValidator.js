"use strict";

// Implements FORGE-DOC-29: Code-to-Spec Trace Validator Contract
// Stage C gate: 1:1 mapping between Stage B specs and Stage C code

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const OUTPUT_PATH = path.resolve(ROOT, "artifacts", "verify", "unit", "trace_validation_report.json");

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

// ── Mismatch types (section 7) ─────────────────────────────────────────────
const MISMATCH_TYPES = [
  "MISSING_IMPLEMENTATION",
  "UNDOCUMENTED_BEHAVIOR",
  "INTERFACE_CONFLICT",
  "SCHEMA_MISMATCH",
  "EDGE_CASE_MISSING",
  "TEST_COVERAGE_MISSING"
];

function extractMustRequirements(specContent) {
  if (!specContent) return [];
  const lines = specContent.split("\n");
  const reqs = [];
  lines.forEach((line, i) => {
    if (/\bMUST\b/.test(line) && line.trim().length > 10) {
      reqs.push({ req_id: `REQ-${String(i + 1).padStart(4, "0")}`, text: line.trim() });
    }
  });
  return reqs;
}

function extractCodeExports(root) {
  const exports = [];
  const dirs = ["code/src/ai_os", "code/src/modules", "code/src/providers", "code/src/orchestrator"];
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    fs.readdirSync(abs).forEach((file) => {
      if (!file.endsWith(".js")) return;
      const src = readFileSafe(path.join(abs, file)) || "";
      const funcNames = [...src.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]);
      const moduleExports = [...src.matchAll(/module\.exports\s*=\s*\{([^}]+)\}/s)].flatMap((m) => m[1].match(/\w+/g) || []);
      const all = [...new Set([...funcNames, ...moduleExports])].filter((n) => n.length > 3 && !/^(function|require|module|exports|const|let|var)$/.test(n));
      all.forEach((name) => exports.push({ symbol: name, file: `${dir}/${file}` }));
    });
  }
  return exports;
}

function extractTraceMatrix(root) {
  const tracePath = path.join(root, "artifacts/trace/trace_matrix.json");
  if (!fs.existsSync(tracePath)) return null;
  try { return JSON.parse(fs.readFileSync(tracePath, "utf-8")); }
  catch (_) { return null; }
}

function extractTestFiles(root) {
  const testDir = path.join(root, "code/tests");
  if (!fs.existsSync(testDir)) return [];
  const tests = [];
  function scan(dir) {
    fs.readdirSync(dir).forEach((f) => {
      const abs = path.join(dir, f);
      if (fs.statSync(abs).isDirectory()) { scan(abs); return; }
      if (f.endsWith(".test.js") || f.endsWith(".spec.js") || f.endsWith(".test.ts")) {
        tests.push(abs.replace(root, "").replace(/\\/g, "/").replace(/^\//, ""));
      }
    });
  }
  try { scan(testDir); } catch (_) {}
  return tests;
}

function runCodeToSpecTraceValidator(options = {}) {
  const root = String(options.root || ROOT);

  // Load authoritative inputs (section 2)
  const stageBSpecs = readFileSafe(path.join(root, "artifacts/stage_B/specifications.md"));
  const stageBInterfaces = readFileSafe(path.join(root, "artifacts/stage_B/interface_contracts.md"));
  const stageBEdgeCases = readFileSafe(path.join(root, "artifacts/stage_B/edge_cases.md"));
  const codeTraceMatrix = readFileSafe(path.join(root, "artifacts/stage_C/code_trace_matrix.md"));
  const traceJson = extractTraceMatrix(root);

  // If Stage B artifacts don't exist yet, use AI OS state as proxy
  const hasStageB = stageBSpecs || stageBInterfaces;
  const mustRequirements = extractMustRequirements(stageBSpecs || "");

  const codeExports = extractCodeExports(root);
  const testFiles = extractTestFiles(root);

  const mismatches = [];
  let unmappedRequirements = 0;
  let undocumentedCodeSections = 0;
  let edgeCasesMissing = 0;
  let testCoverageMissing = 0;

  // Check trace matrix coverage
  if (traceJson && Array.isArray(traceJson.mappings)) {
    const mappedReqIds = new Set(traceJson.mappings.map((m) => String(m.requirement_id || "")));
    const orphanCode = Array.isArray(traceJson.orphan_code_units) ? traceJson.orphan_code_units : [];
    const orphanReqs = Array.isArray(traceJson.orphan_requirements) ? traceJson.orphan_requirements : [];

    unmappedRequirements = orphanReqs.length;
    undocumentedCodeSections = orphanCode.length;

    orphanReqs.forEach((r) => mismatches.push({ type: "MISSING_IMPLEMENTATION", detail: `Requirement ${r} has no mapped code` }));
    orphanCode.forEach((c) => mismatches.push({ type: "UNDOCUMENTED_BEHAVIOR", detail: `Code unit ${c} not mapped to any requirement` }));
  } else if (hasStageB) {
    // No trace matrix yet — report as unmapped
    unmappedRequirements = mustRequirements.length;
    if (unmappedRequirements > 0) {
      mismatches.push({ type: "MISSING_IMPLEMENTATION", detail: `${unmappedRequirements} MUST requirements found in Stage B specs with no trace matrix` });
    }
  }

  // Test coverage check (section 6)
  if (testFiles.length === 0 && codeExports.length > 0) {
    testCoverageMissing = Math.min(codeExports.length, 5);
    mismatches.push({ type: "TEST_COVERAGE_MISSING", detail: `No test files found — ${codeExports.length} exported symbols have no tests` });
  }

  // Edge cases check (section 5)
  if (stageBEdgeCases && !codeTraceMatrix) {
    edgeCasesMissing = 1;
    mismatches.push({ type: "EDGE_CASE_MISSING", detail: "Stage B edge_cases.md exists but no code_trace_matrix.md maps their implementation" });
  }

  const totalRequirements = Math.max(mustRequirements.length, traceJson ? (traceJson.mappings || []).length : 0);
  const mappedRequirements = totalRequirements - unmappedRequirements;

  // PASS only if all counters are zero (section 8)
  const passed =
    unmappedRequirements === 0 &&
    undocumentedCodeSections === 0 &&
    edgeCasesMissing === 0 &&
    testCoverageMissing === 0 &&
    mismatches.filter((m) => m.type !== "TEST_COVERAGE_MISSING").length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    total_requirements: totalRequirements,
    mapped_requirements: mappedRequirements,
    unmapped_requirements: unmappedRequirements,
    undocumented_code_sections: undocumentedCodeSections,
    edge_cases_missing: edgeCasesMissing,
    test_coverage_missing: testCoverageMissing,
    mismatches_detected: mismatches.length,
    result: passed ? "PASS" : "FAIL",
    mismatches
  };

  writeJson(OUTPUT_PATH, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/unit/trace_validation_report.json",
    blocked: !passed,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Code-to-Spec Trace Validator: PASS — Stage C may proceed" }
      : { blocking_questions: ["Trace Validator FAIL — see artifacts/verify/unit/trace_validation_report.json"], next_step: "" }
  };
}

module.exports = { runCodeToSpecTraceValidator, MISMATCH_TYPES };
