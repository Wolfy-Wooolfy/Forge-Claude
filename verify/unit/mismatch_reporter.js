const fs = require("fs");
const path = require("path");

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function fileExists(repoRoot, rel) {
  const abs = path.resolve(repoRoot, rel);
  return fs.existsSync(abs);
}

function main() {
  const repoRoot = path.resolve(__dirname, "../..");
  const unitDir = path.resolve(repoRoot, "verify/unit");
  const outPath = path.resolve(unitDir, "mismatch_report.json");

  const traceMatrixRef = "artifacts/stage_C/code_trace_matrix.md";

  const docsGapReportPath = path.resolve(unitDir, "docs_gap_validation_report.json");
  if (!fs.existsSync(docsGapReportPath)) {
    throw new Error("Missing input: verify/unit/docs_gap_validation_report.json (run docs_gap_analyzer first)");
  }

  const docsGap = readJson(docsGapReportPath);

  const impliedMissing = Array.isArray(docsGap?.gaps?.docs_imply_but_code_missing)
    ? docsGap.gaps.docs_imply_but_code_missing
    : [];

  const mismatches = [];
  let idCounter = 1;

  for (const relPath of impliedMissing) {
    if (typeof relPath !== "string" || relPath.trim().length === 0) continue;

    if (relPath === "verify/unit/mismatch_report.json") continue;
    
    if (fileExists(repoRoot, relPath)) {
      continue;
    }

    const mismatchId = `MM-${String(idCounter).padStart(4, "0")}`;
    idCounter += 1;

    let docRefPath = "docs/09_verify/09_Build_and_Verify_Playbook_Local.md";
    let anchor = "verify";

    if (relPath.startsWith("verify/unit/")) {
      docRefPath = "docs/09_verify/09_18_Code_to_Spec_Trace_Validator_Contract.md";
      anchor = "unit";
    } else if (relPath.startsWith("verify/audit/")) {
      docRefPath = "docs/09_verify/09_17_Cross_Document_Consistency_Review_Contract.md";
      anchor = "audit";
    } else if (relPath.startsWith("verify/smoke/")) {
      docRefPath = "docs/09_verify/09_Build_and_Verify_Playbook_Local.md";
      anchor = "smoke";
    }

    let notes = "";
    if (relPath === "verify/smoke/smoke_check.sh" && fileExists(repoRoot, "verify/smoke/smoke_check.js")) {
      notes = "Windows runtime uses verify/smoke/smoke_check.js as a compatible replacement. Docs may still reference .sh.";
    }

    mismatches.push({
      mismatch_id: mismatchId,
      mismatch_type: "VERIFICATION_GAP",
      severity: "SHOULD",
      requirement_level: "SHOULD",
      description: `Docs imply verify output/script but it is missing from code/filesystem: ${relPath}`,
      doc_refs: [{ path: docRefPath, anchor }],
      code_refs: [],
      status: "OPEN",
      notes: notes || undefined,
    });
  }

  let must_missing_count = 0;
  let must_undocumented_count = 0;
  let should_missing_count = 0;
  let should_undocumented_count = 0;

  for (const m of mismatches) {
    if (m.status !== "OPEN") continue;

    if (m.severity === "MUST") {
      if (m.mismatch_type === "MISSING_IMPLEMENTATION" || m.mismatch_type === "VERIFICATION_GAP" || m.mismatch_type === "TRACE_GAP") {
        must_missing_count += 1;
      } else if (m.mismatch_type === "UNDOCUMENTED_BEHAVIOR") {
        must_undocumented_count += 1;
      }
    }

    if (m.severity === "SHOULD") {
      if (m.mismatch_type === "MISSING_IMPLEMENTATION" || m.mismatch_type === "VERIFICATION_GAP" || m.mismatch_type === "TRACE_GAP") {
        should_missing_count += 1;
      } else if (m.mismatch_type === "UNDOCUMENTED_BEHAVIOR") {
        should_undocumented_count += 1;
      }
    }
  }

  const unresolved_total =
    must_missing_count + must_undocumented_count + should_missing_count + should_undocumented_count;

  const report = {
    mismatch_report_id: "MISMATCH_REPORT_v1",
    generated_at: nowIso(),
    trace_matrix_ref: traceMatrixRef,
    summary: {
      must_missing_count,
      must_undocumented_count,
      should_missing_count,
      should_undocumented_count,
      unresolved_total,
      blocking: must_missing_count + must_undocumented_count > 0,
    },
    mismatches,
  };

  ensureDir(unitDir);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  process.exitCode = report.summary.blocking ? 1 : 0;
}

main();