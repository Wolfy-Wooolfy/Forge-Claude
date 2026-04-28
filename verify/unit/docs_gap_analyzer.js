const fs = require("fs");
const path = require("path");

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function listFilesRecursive(rootAbs) {
  const out = [];
  const stack = [rootAbs];
  while (stack.length) {
    const cur = stack.pop();
    if (!fs.existsSync(cur)) continue;
    const st = fs.statSync(cur);
    if (st.isDirectory()) {
      const items = fs.readdirSync(cur).map((x) => path.join(cur, x));
      for (const it of items) stack.push(it);
    } else {
      out.push(cur);
    }
  }
  return out;
}

function normalizeRepoRelative(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replace(/\\/g, "/");
}

function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonBlocksFromMarkdown(md) {
  const blocks = [];
  const patterns = [
    /```json\s*([\s\S]*?)\s*```/gm,
    /~~~json\s*([\s\S]*?)\s*~~~/gm,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(md)) !== null) {
      if (m[1]) blocks.push(m[1]);
    }
  }
  const parsed = [];
  for (const b of blocks) {
    const j = safeJsonParse(b);
    if (j) parsed.push(j);
  }
  return parsed;
}

function setFromArray(arr) {
  const s = new Set();
  for (const x of arr) s.add(x);
  return s;
}

function main() {
  const repoRoot = path.resolve(__dirname, "../..");

  const docsRoot = path.resolve(repoRoot, "docs");
  const codeRoots = [
    path.resolve(repoRoot, "code"),
    path.resolve(repoRoot, "bin"),
    path.resolve(repoRoot, "tools"),
    path.resolve(repoRoot, "verify"),
  ];

  const outDir = path.resolve(repoRoot, "verify/unit");
  const outPath = path.resolve(outDir, "docs_gap_validation_report.json");

  const docsFilesAbs = listFilesRecursive(docsRoot).filter((p) => fs.statSync(p).isFile());
  const codeFilesAbs = [];
  for (const r of codeRoots) {
    const files = listFilesRecursive(r).filter((p) => fs.statSync(p).isFile());
    for (const f of files) codeFilesAbs.push(f);
  }

  const docsFiles = docsFilesAbs.map((p) => normalizeRepoRelative(repoRoot, p)).sort();
  const codeFiles = codeFilesAbs.map((p) => normalizeRepoRelative(repoRoot, p)).sort();

  const docsSet = setFromArray(docsFiles);
  const codeSet = setFromArray(codeFiles);

  const expectedVerifyOutputs = [
    "verify/unit/trace_validation_report.json",
    "verify/unit/docs_gap_validation_report.json",
    "verify/unit/cross_document_consistency_report.json",
    "verify/unit/mismatch_report.json",
    "verify/audit/audit_log.jsonl",
    "verify/smoke/local_command_log.jsonl",
    "verify/smoke/smoke_check.sh",
  ];

  const expectedSchemas = [
    "docs/09_verify/trace_matrix_schema_v1.json",
    "docs/09_verify/mismatch_report_schema_v1.json",
    "docs/09_verify/verification_evidence_schema_v1.json",
    "docs/09_verify/vision_coverage_matrix_schema_v1.json",
    "docs/09_verify/vision_gap_report_schema_v1.json",
  ];

  const docRequiredFiles = [];
  for (const p of expectedSchemas) {
    if (!docsSet.has(p)) docRequiredFiles.push(p);
  }

  const missingExpectedVerifyOutputs = [];
  for (const p of expectedVerifyOutputs) {
    if (!codeSet.has(p)) missingExpectedVerifyOutputs.push(p);
  }

  const runtimeCoveredDocs = [
    "docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md",
    "docs/08_audit/08_10_Docs_to_Code_Coverage_Map_Core_Runtime.md",
  ];

  const docsCoveragePresent = runtimeCoveredDocs.filter((p) => docsSet.has(p));

  const likelyUndocumentedCode = [];
  const coreCodeCandidates = [
    "bin/halo-autonomy-step.js",
    "bin/halo-run.js",
    "tools/pre_run_check.js",
    "tools/integrity.js",
    "code/src/orchestrator/runner.js",
    "code/src/orchestrator/stage_transitions.js",
    "code/src/orchestrator/status_writer.js",
    "code/src/execution/task_executor.js",
    "code/src/execution/task_registry.js",
    "verify/smoke/runner_smoke.js",
    "verify/smoke/runner_dry_run_smoke.js",
    "verify/smoke/stage_transitions_smoke.js",
    "verify/smoke/status_writer_smoke.js",
  ];

  const coverageMapDoc = docsSet.has("docs/08_audit/08_10_Docs_to_Code_Coverage_Map_Core_Runtime.md");
  if (!coverageMapDoc) {
    for (const p of coreCodeCandidates) {
      if (codeSet.has(p)) likelyUndocumentedCode.push(p);
    }
  }

  const report = {
    report_id: "DOCS_GAP_VALIDATION_REPORT_v1",
    generated_at: nowIso(),
    inputs: {
      docs_root: "docs",
      code_roots: ["code", "bin", "tools", "verify"],
    },
    summary: {
      docs_file_count: docsFiles.length,
      code_file_count: codeFiles.length,
      missing_expected_verify_outputs: missingExpectedVerifyOutputs.length,
      missing_required_verify_schemas_in_docs: docRequiredFiles.length,
      runtime_docs_coverage_files_present: docsCoveragePresent.length,
      likely_undocumented_code_count: likelyUndocumentedCode.length,
      must_issues: 0,
      should_issues: 0,
      info_issues: 0,
    },
    issues: [],
    docs: {
      missing_required_verify_schemas: docRequiredFiles,
      runtime_docs_coverage_files_present: docsCoveragePresent,
    },
    gaps: {
      docs_imply_but_code_missing: missingExpectedVerifyOutputs,
      code_present_but_docs_coverage_uncertain: likelyUndocumentedCode,
    },
  };

  for (const p of docRequiredFiles) {
    report.issues.push({
      severity: "MUST",
      code: "DOCS-MISSING-VERIFY-SCHEMA",
      message: `Missing required verify schema in docs: ${p}`,
    });
  }

  for (const p of missingExpectedVerifyOutputs) {
    report.issues.push({
      severity: "SHOULD",
      code: "VERIFY-EXPECTED-OUTPUT-MISSING",
      message: `Expected verify output not implemented as file: ${p}`,
    });
  }

  if (!docsSet.has("docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md")) {
    report.issues.push({
      severity: "SHOULD",
      code: "DOCS-MISSING-RUNTIME-ENTRYPOINTS",
      message: "Missing runtime entrypoints and tooling doc",
    });
  }

  if (!docsSet.has("docs/08_audit/08_10_Docs_to_Code_Coverage_Map_Core_Runtime.md")) {
    report.issues.push({
      severity: "SHOULD",
      code: "DOCS-MISSING-COVERAGE-MAP",
      message: "Missing docs-to-code coverage map doc",
    });
  }

  if (likelyUndocumentedCode.length > 0) {
    report.issues.push({
      severity: "INFO",
      code: "CODE-PRESENT-DOCS-COVERAGE-UNCERTAIN",
      message: "Some core code exists but coverage map doc is missing, coverage uncertain",
      files: likelyUndocumentedCode,
    });
  }

  for (const it of report.issues) {
    if (it.severity === "MUST") report.summary.must_issues += 1;
    else if (it.severity === "SHOULD") report.summary.should_issues += 1;
    else report.summary.info_issues += 1;
  }

  ensureDir(outDir);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  if (report.summary.must_issues > 0) process.exitCode = 1;
  else process.exitCode = 0;
}

main();