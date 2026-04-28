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

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractDocId(mdText) {
  const lines = mdText.split(/\r?\n/).slice(0, 30);
  for (const ln of lines) {
    const m = ln.match(/Document ID:\s*([A-Za-z0-9._-]+)/i);
    if (m) return m[1];
  }
  return null;
}

function main() {
  const repoRoot = path.resolve(__dirname, "../..");
  const docsRoot = path.resolve(repoRoot, "docs");

  const outDir = path.resolve(repoRoot, "verify/unit");
  const outPath = path.resolve(outDir, "cross_document_consistency_report.json");

  const report = {
    report_id: "CROSS_DOCUMENT_CONSISTENCY_REPORT_v1",
    generated_at: nowIso(),
    summary: {
      docs_scanned: 0,
      doc_id_found: 0,
      duplicate_doc_ids: 0,
      json_schema_files_scanned: 0,
      json_schema_parsed: 0,
      json_schema_parse_failures: 0,
      must_issues: 0,
      should_issues: 0,
      info_issues: 0,
    },
    issues: [],
    duplicates: [],
    json_schema_failures: [],
  };

  try {
    const allDocs = listFilesRecursive(docsRoot).filter((p) => fs.statSync(p).isFile());
    report.summary.docs_scanned = allDocs.length;

    const docIdMap = new Map(); // docId -> [file]
    for (const abs of allDocs) {
      const rel = normalizeRepoRelative(repoRoot, abs);

      if (rel.toLowerCase().endsWith(".md")) {
        const text = fs.readFileSync(abs, "utf8");
        const docId = extractDocId(text);
        if (docId) {
          report.summary.doc_id_found += 1;
          if (!docIdMap.has(docId)) docIdMap.set(docId, []);
          docIdMap.get(docId).push(rel);
        }
      }

      if (rel.toLowerCase().endsWith(".json")) {
        report.summary.json_schema_files_scanned += 1;
        const text = fs.readFileSync(abs, "utf8");
        const parsed = safeJsonParse(text);
        if (parsed) {
          report.summary.json_schema_parsed += 1;
        } else {
          report.summary.json_schema_parse_failures += 1;
          report.json_schema_failures.push(rel);
          report.issues.push({
            severity: "SHOULD",
            code: "JSON-SCHEMA-PARSE-FAILED",
            message: `JSON file could not be parsed (may be schema or data): ${rel}`,
          });
        }
      }
    }

    const duplicates = [];
    for (const [docId, files] of docIdMap.entries()) {
      if (files.length > 1) duplicates.push({ doc_id: docId, files: files.slice().sort() });
    }
    report.duplicates = duplicates;
    report.summary.duplicate_doc_ids = duplicates.length;

    for (const d of duplicates) {
      report.issues.push({
        severity: "MUST",
        code: "DOC-ID-DUPLICATE",
        message: `Duplicate Document ID detected: ${d.doc_id}`,
        files: d.files,
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
  } catch (e) {
    report.issues.push({
      severity: "MUST",
      code: "CROSS_DOC_CONSISTENCY_RUNTIME_ERROR",
      message: String(e && e.message ? e.message : e),
    });
    report.summary.must_issues += 1;

    ensureDir(outDir);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    process.exitCode = 1;
  }
}

main();