"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const OUTPUT_PATH = path.resolve(ROOT, "artifacts", "verify", "unit", "cross_document_consistency_report.json");

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

const MANDATORY_SCAN_DIRS = [
  "docs/03_pipeline",
  "docs/08_audit",
  "docs/09_verify"
];

function scanDocuments(root) {
  const files = [];
  for (const dir of MANDATORY_SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    fs.readdirSync(abs).forEach((f) => {
      if (f.endsWith(".md")) files.push(path.join(dir, f).replace(/\\/g, "/"));
    });
  }
  return files;
}

// ── 3.1 Authority Collision Detection ─────────────────────────────────────
function detectAuthorityCollisions(docs) {
  const collisions = [];
  // Multiple documents granting execution authority
  const execAuthDocs = docs.filter((d) => {
    const content = d.content || "";
    return /execution.{0,30}authority/i.test(content) && /MUST|MANDATORY/i.test(content);
  });
  if (execAuthDocs.length > 2) {
    collisions.push({ type: "AUTHORITY_COLLISION", files: execAuthDocs.slice(0, 3).map((d) => d.path), detail: "Multiple docs grant execution authority" });
  }
  return collisions;
}

// ── 3.2 Closure Rule Consistency ──────────────────────────────────────────
function detectClosureMismatches(docs) {
  const mismatches = [];
  const closureDocs = docs.filter((d) => /closure/i.test(d.content || ""));
  const closureTerms = new Set();
  for (const doc of closureDocs) {
    const terms = (doc.content || "").match(/closure_contract_ready|closure_artifact|closure_report/gi) || [];
    terms.forEach((t) => closureTerms.add(t.toLowerCase()));
  }
  // Check if closure conditions are referenced consistently across docs
  const inconsistentDocs = closureDocs.filter((d) => {
    const content = d.content || "";
    return /closure.*required/i.test(content) && !/artifact/i.test(content);
  });
  if (inconsistentDocs.length > 0) {
    mismatches.push({ type: "CLOSURE_MISMATCH", files: inconsistentDocs.map((d) => d.path), detail: "Closure required without artifact reference" });
  }
  return mismatches;
}

// ── 3.3 Schema Duplication Detection ─────────────────────────────────────
function detectSchemaDuplications(docs) {
  const duplications = [];
  const schemaSignatures = new Map();
  for (const doc of docs) {
    const content = doc.content || "";
    // Extract JSON-like field names from docs
    const fields = content.match(/- `?\w+`?\s*:/g) || [];
    const signature = fields.slice(0, 5).join("|");
    if (signature.length > 10) {
      if (schemaSignatures.has(signature)) {
        duplications.push({
          type: "SCHEMA_DUPLICATION",
          files: [schemaSignatures.get(signature), doc.path],
          detail: "Similar schema pattern detected in multiple documents"
        });
      } else {
        schemaSignatures.set(signature, doc.path);
      }
    }
  }
  return duplications;
}

// ── 3.4 Loop Termination Alignment ────────────────────────────────────────
function detectLoopAlignmentIssues(docs, root) {
  const issues = [];
  const hasLoopTerminationValidator = fs.existsSync(path.join(root, "code/src/modules/loopTerminationValidator.js"));
  const loopDocs = docs.filter((d) => /loop.*termination|iteration.*limit|max.*iteration/i.test(d.content || ""));
  if (loopDocs.length > 0 && !hasLoopTerminationValidator) {
    issues.push({ type: "LOOP_ALIGNMENT_MISSING", detail: "Docs define loop termination rules but loopTerminationValidator.js missing" });
  }
  return issues;
}

// ── 3.5 Authority Layer Separation ────────────────────────────────────────
function detectLayerSeparationViolations(docs, root) {
  const violations = [];
  // Check that AI OS files don't import execution modules
  const aiOsDir = path.join(root, "code/src/ai_os");
  if (fs.existsSync(aiOsDir)) {
    fs.readdirSync(aiOsDir).forEach((file) => {
      if (!file.endsWith(".js")) return;
      const src = readFileSafe(path.join(aiOsDir, file)) || "";
      if (src.includes("require('../execution/") || src.includes("require(\"../execution/")) {
        violations.push({ type: "LAYER_SEPARATION_VIOLATION", file: `code/src/ai_os/${file}`, detail: "AI OS module importing from execution layer" });
      }
    });
  }
  return violations;
}

// ── 3.6 Artifact Path Alignment ───────────────────────────────────────────
function detectOrphanArtifacts(docs, root) {
  const orphans = [];
  const artifactRefs = new Set();
  for (const doc of docs) {
    const matches = (doc.content || "").match(/artifacts\/[a-zA-Z0-9/_.-]+/g) || [];
    matches.forEach((m) => artifactRefs.add(m));
  }
  // Check a sample of referenced artifacts exist in code
  const codeRefs = new Set();
  const modulesDir = path.join(root, "code/src/modules");
  if (fs.existsSync(modulesDir)) {
    fs.readdirSync(modulesDir).forEach((f) => {
      if (!f.endsWith(".js")) return;
      const src = readFileSafe(path.join(modulesDir, f)) || "";
      const matches = src.match(/artifacts\/[a-zA-Z0-9/_.-]+/g) || [];
      matches.forEach((m) => codeRefs.add(m));
    });
  }
  // Artifact paths in docs but never referenced in code = potential orphans
  for (const ref of artifactRefs) {
    if (ref.includes(".json") || ref.includes(".md")) {
      if (!codeRefs.has(ref) && !ref.startsWith("artifacts/stage_")) {
        orphans.push({ type: "ORPHAN_ARTIFACT_REF", path: ref, detail: "Artifact path in docs not referenced in code" });
      }
    }
  }
  return orphans.slice(0, 10); // Cap at 10 to avoid noise
}

function runCrossDocConsistencyEngine(options = {}) {
  const root = String(options.root || ROOT);
  const docFiles = scanDocuments(root);

  if (docFiles.length === 0) {
    const result = { timestamp_utc: nowIso(), documents_scanned: [], authority_conflicts_detected: 0, schema_duplications_detected: 0, closure_mismatches_detected: 0, loop_alignment_issues: 0, layer_separation_violations: 0, orphan_artifacts_detected: 0, result: "FAIL", error: "No documents scanned — mandatory scan directories missing" };
    writeJson(OUTPUT_PATH, result);
    return { ok: false, result: "FAIL", blocked: true, artifact_path: "artifacts/verify/unit/cross_document_consistency_report.json", status_patch: { blocking_questions: ["Cross-Doc Consistency FAIL: no documents found"], next_step: "" } };
  }

  const docs = docFiles.map((filePath) => ({
    path: filePath,
    content: readFileSafe(path.join(root, filePath)) || ""
  }));

  const authorityCollisions = detectAuthorityCollisions(docs);
  const closureMismatches = detectClosureMismatches(docs);
  const schemaDuplications = detectSchemaDuplications(docs);
  const loopAlignmentIssues = detectLoopAlignmentIssues(docs, root);
  const layerViolations = detectLayerSeparationViolations(docs, root);
  const orphanArtifacts = detectOrphanArtifacts(docs, root);

  const passed =
    authorityCollisions.length === 0 &&
    closureMismatches.length === 0 &&
    loopAlignmentIssues.length === 0 &&
    layerViolations.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    documents_scanned: docFiles,
    authority_conflicts_detected: authorityCollisions.length,
    schema_duplications_detected: schemaDuplications.length,
    closure_mismatches_detected: closureMismatches.length,
    loop_alignment_issues: loopAlignmentIssues.length,
    layer_separation_violations: layerViolations.length,
    orphan_artifacts_detected: orphanArtifacts.length,
    result: passed ? "PASS" : "FAIL",
    details: { authorityCollisions, closureMismatches, schemaDuplications, loopAlignmentIssues, layerViolations, orphanArtifacts }
  };

  writeJson(OUTPUT_PATH, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/unit/cross_document_consistency_report.json",
    blocked: !passed,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Cross-Doc Consistency: PASS" }
      : { blocking_questions: ["Cross-Doc Consistency FAIL — see artifacts/verify/unit/cross_document_consistency_report.json"], next_step: "" }
  };
}

module.exports = { runCrossDocConsistencyEngine };
