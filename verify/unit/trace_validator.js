const fs = require("fs");
const path = require("path");

function nowIso() {
  return new Date().toISOString();
}

function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function extractEmbeddedJson(markdown) {
  const patterns = [
    /```json\s*([\s\S]*?)\s*```/m,
    /~~~json\s*([\s\S]*?)\s*~~~/m,
  ];
  for (const re of patterns) {
    const m = markdown.match(re);
    if (m && m[1]) return JSON.parse(m[1]);
  }
  throw new Error("Embedded JSON block not found (expected ```json ... ``` or ~~~json ... ~~~)");
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

function validateTraceMatrixShape(obj) {
  const issues = [];

  const requiredTop = ["trace_matrix_id", "generated_at", "source_docs", "codebase_root", "coverage_summary", "rows"];
  for (const k of requiredTop) {
    if (!(k in obj)) issues.push({ severity: "MUST", code: "TM-MISSING-TOP-KEY", message: `Missing top-level key: ${k}` });
  }

  if ("trace_matrix_id" in obj && !isNonEmptyString(obj.trace_matrix_id)) {
    issues.push({ severity: "MUST", code: "TM-BAD-ID", message: "trace_matrix_id must be non-empty string" });
  }

  if ("generated_at" in obj && !isNonEmptyString(obj.generated_at)) {
    issues.push({ severity: "SHOULD", code: "TM-BAD-GENERATED-AT", message: "generated_at should be non-empty string" });
  }

  if ("source_docs" in obj && !Array.isArray(obj.source_docs)) {
    issues.push({ severity: "MUST", code: "TM-BAD-SOURCE-DOCS", message: "source_docs must be array" });
  }

  if ("codebase_root" in obj && !isNonEmptyString(obj.codebase_root)) {
    issues.push({ severity: "MUST", code: "TM-BAD-CODEBASE-ROOT", message: "codebase_root must be non-empty string" });
  }

  if ("rows" in obj && !Array.isArray(obj.rows)) {
    issues.push({ severity: "MUST", code: "TM-BAD-ROWS", message: "rows must be array" });
  }

  if (Array.isArray(obj.rows)) {
    const requiredRow = [
      "requirement_id",
      "requirement_level",
      "requirement_text",
      "doc_refs",
      "code_refs",
      "verification_refs",
      "status",
    ];

    obj.rows.forEach((row, i) => {
      if (!row || typeof row !== "object") {
        issues.push({ severity: "MUST", code: "TM-BAD-ROW", message: `Row[${i}] must be object` });
        return;
      }

      for (const k of requiredRow) {
        if (!(k in row)) issues.push({ severity: "MUST", code: "TM-MISSING-ROW-KEY", message: `Row[${i}] missing key: ${k}` });
      }

      if ("requirement_id" in row && !isNonEmptyString(row.requirement_id)) {
        issues.push({ severity: "MUST", code: "TM-BAD-REQ-ID", message: `Row[${i}] requirement_id must be non-empty string` });
      }

      if ("doc_refs" in row && !Array.isArray(row.doc_refs)) {
        issues.push({ severity: "MUST", code: "TM-BAD-DOC-REFS", message: `Row[${i}] doc_refs must be array` });
      }

      if ("verification_refs" in row && !Array.isArray(row.verification_refs)) {
        issues.push({ severity: "MUST", code: "TM-BAD-VER-REFS", message: `Row[${i}] verification_refs must be array` });
      }

      if ("code_refs" in row && !Array.isArray(row.code_refs)) {
        issues.push({ severity: "MUST", code: "TM-BAD-CODE-REFS", message: `Row[${i}] code_refs must be array` });
      }
    });
  }

  return issues;
}

function normalizeRepoRelative(p) {
  return p.replace(/\\/g, "/");
}

function main() {
  const repoRoot = path.resolve(__dirname, "../..");
  const inputArtifact = path.resolve(repoRoot, "artifacts/stage_C/code_trace_matrix.md");
  const outDir = path.resolve(repoRoot, "verify/unit");
  const outPath = path.resolve(outDir, "trace_validation_report.json");

  const report = {
    report_id: "TRACE_VALIDATION_REPORT_v1",
    generated_at: nowIso(),
    input_artifact: normalizeRepoRelative(path.relative(repoRoot, inputArtifact)),
    output_artifact: normalizeRepoRelative(path.relative(repoRoot, outPath)),
    summary: {
      total_rows: 0,
      code_ref_entries: 0,
      code_files_checked: 0,
      missing_code_files: 0,
      must_issues: 0,
      should_issues: 0,
      info_issues: 0,
    },
    issues: [],
    missing_code_files: [],
  };

  try {
    const md = readUtf8(inputArtifact);
    const matrix = extractEmbeddedJson(md);

    const shapeIssues = validateTraceMatrixShape(matrix);
    report.issues.push(...shapeIssues);

    const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
    report.summary.total_rows = rows.length;

    const missingFilesSet = new Set();

    rows.forEach((row, i) => {
      const codeRefs = Array.isArray(row && row.code_refs) ? row.code_refs : [];
      report.summary.code_ref_entries += codeRefs.length;

      codeRefs.forEach((ref, j) => {
        if (!ref || typeof ref !== "object") return;
        const refPath = ref.path;
        if (!isNonEmptyString(refPath)) return;

        const abs = path.resolve(repoRoot, refPath);
        report.summary.code_files_checked += 1;

        if (!fs.existsSync(abs)) {
          missingFilesSet.add(normalizeRepoRelative(refPath));
          report.issues.push({
            severity: "MUST",
            code: "TM-MISSING-CODE-FILE",
            message: `Missing code file referenced by trace matrix: ${refPath}`,
            at: { row_index: i, code_ref_index: j, requirement_id: row.requirement_id || null },
          });
        }
      });
    });

    report.missing_code_files = Array.from(missingFilesSet).sort();
    report.summary.missing_code_files = report.missing_code_files.length;

    for (const it of report.issues) {
      if (it.severity === "MUST") report.summary.must_issues += 1;
      else if (it.severity === "SHOULD") report.summary.should_issues += 1;
      else report.summary.info_issues += 1;
    }

    ensureDir(outDir);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

    if (report.summary.must_issues > 0) {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (e) {
    report.issues.push({
      severity: "MUST",
      code: "TRACE_VALIDATOR_RUNTIME_ERROR",
      message: String(e && e.message ? e.message : e),
    });
    report.summary.must_issues += 1;

    ensureDir(outDir);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    process.exitCode = 1;
  }
}

main();