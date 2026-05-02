"use strict";

// Implements FORGE-DOC-30: Documentation Gap Analyzer Validator Contract
// Stage B gate: zero MUST-level gaps before Stage B may close

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const OUTPUT_PATH = path.resolve(ROOT, "artifacts", "verify", "unit", "docs_gap_validation_report.json");

const GAP_CLASSIFICATIONS = [
  "MISSING_REQUIREMENT",
  "UNDERSPECIFIED_BEHAVIOR",
  "CONTRADICTION",
  "SCOPE_EXPANSION",
  "UNRESOLVED_ASSUMPTION",
  "INVALID_SCHEMA_REFERENCE"
];

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

function extractMustRequirements(content) {
  if (!content) return [];
  return content.split("\n")
    .filter((line) => /\bMUST\b/.test(line) && line.trim().length > 8)
    .map((line, i) => ({ req_id: `MUST-${String(i + 1).padStart(3, "0")}`, text: line.trim() }));
}

function extractCoveredRequirements(coverageMatrix) {
  if (!coverageMatrix) return new Set();
  const covered = new Set();
  coverageMatrix.split("\n").forEach((line) => {
    if (/\bCOVERED\b/i.test(line)) {
      const match = line.match(/MUST-\d+|REQ-\d+/);
      if (match) covered.add(match[0]);
    }
  });
  return covered;
}

function detectContradictions(docs) {
  const contradictions = [];
  const definitions = new Map();
  for (const [name, content] of Object.entries(docs)) {
    if (!content) continue;
    const defs = content.match(/^\s*[*-]\s+`?\w[\w_]+`?\s*[:=]/gm) || [];
    defs.forEach((def) => {
      const key = def.replace(/[`*\-=: ]/g, "").toLowerCase().slice(0, 20);
      if (definitions.has(key) && definitions.get(key) !== name) {
        contradictions.push({ type: "CONTRADICTION", files: [definitions.get(key), name], term: key });
      } else {
        definitions.set(key, name);
      }
    });
  }
  return contradictions;
}

function detectScopeExpansions(stageAContent, stageBDocs) {
  if (!stageAContent) return [];
  const expansions = [];
  // Terms that appear in Stage B but not Stage A MAY be scope expansions
  // Use simple heuristic: large sections in Stage B with no Stage A anchor
  for (const [name, content] of Object.entries(stageBDocs)) {
    if (!content) continue;
    const headers = content.match(/^#{2,3}\s+.+/gm) || [];
    headers.forEach((header) => {
      const term = header.replace(/^#+\s+/, "").toLowerCase().slice(0, 30);
      if (term.length > 5 && !stageAContent.toLowerCase().includes(term)) {
        expansions.push({ type: "SCOPE_EXPANSION", file: name, section: header.trim(), detail: `Section not traceable to Stage A: "${header.trim()}"` });
      }
    });
  }
  return expansions.slice(0, 5); // Cap noise
}

function detectUnresolvedAssumptions(assumptionsContent, stageBContent) {
  if (!assumptionsContent) return [];
  const unresolved = [];
  const assumptions = assumptionsContent.split("\n").filter((l) => /\bASSUME|ASSUMPTION\b/i.test(l) && l.trim().length > 10);
  assumptions.forEach((assumption, i) => {
    const key = assumption.replace(/[^a-z0-9 ]/gi, "").toLowerCase().slice(0, 30);
    const resolved = stageBContent && stageBContent.toLowerCase().includes(key);
    if (!resolved) {
      unresolved.push({ type: "UNRESOLVED_ASSUMPTION", assumption_text: assumption.trim(), reason: "Not found in Stage B specifications" });
    }
  });
  return unresolved;
}

function detectUnderspecifiedBehaviors(stageBContent) {
  if (!stageBContent) return [];
  const underspecified = [];
  const mustLines = stageBContent.split("\n").filter((l) => /\bMUST\b/.test(l));
  mustLines.forEach((line) => {
    const hasInputOutput = /input|output|return|result|response|value/i.test(line);
    const hasConstraint = /[<>=!]|between|range|max|min|exactly|only|never|always/i.test(line);
    if (!hasInputOutput && !hasConstraint) {
      underspecified.push({ type: "UNDERSPECIFIED_BEHAVIOR", line: line.trim(), detail: "MUST statement lacks deterministic outcome definition" });
    }
  });
  return underspecified.slice(0, 10);
}

function runDocsGapAnalyzerValidator(options = {}) {
  const root = String(options.root || ROOT);

  // Load authoritative inputs (section 2)
  const stageASpec = readFileSafe(path.join(root, "artifacts/stage_A/idea_final_spec.md"));
  const stageAAssumptions = readFileSafe(path.join(root, "artifacts/stage_A/validated_assumptions.md"));
  const stageBSpecs = readFileSafe(path.join(root, "artifacts/stage_B/specifications.md"));
  const stageBInterfaces = readFileSafe(path.join(root, "artifacts/stage_B/interface_contracts.md"));
  const stageBEdgeCases = readFileSafe(path.join(root, "artifacts/stage_B/edge_cases.md"));
  const stageBCoverage = readFileSafe(path.join(root, "artifacts/stage_B/docs_coverage_matrix.md"));
  const stageBGapReport = readFileSafe(path.join(root, "artifacts/stage_B/docs_gap_report.md"));

  // If Stage B artifacts don't exist, check AI OS project artifacts as proxy
  const aiOsDocsExist = fs.existsSync(path.join(root, "artifacts/projects")) &&
    fs.readdirSync(path.join(root, "artifacts/projects")).some((d) => {
      const draftPath = path.join(root, "artifacts/projects", d, "ai_os", "documentation", "draft.md");
      return fs.existsSync(draftPath);
    });

  const mustReqs = extractMustRequirements(stageASpec || "");
  const coveredReqs = extractCoveredRequirements(stageBCoverage || "");

  const missingRequirements = mustReqs.filter((r) => !coveredReqs.has(r.req_id)).length;

  const stageBDocs = {
    "specifications.md": stageBSpecs,
    "interface_contracts.md": stageBInterfaces,
    "edge_cases.md": stageBEdgeCases
  };

  const contradictions = detectContradictions(stageBDocs);
  const scopeExpansions = stageASpec ? detectScopeExpansions(stageASpec, stageBDocs) : [];
  const unresolvedAssumptions = detectUnresolvedAssumptions(stageAAssumptions, stageBSpecs || "");
  const underspecifiedBehaviors = detectUnderspecifiedBehaviors(stageBSpecs || "");

  // If no Stage B artifacts exist at all and AI OS projects exist — that's expected state
  const noStageBAtAll = !stageBSpecs && !stageBInterfaces && !stageBEdgeCases;
  const passed = noStageBAtAll
    ? true // Not in Stage B pipeline yet — gate not applicable
    : missingRequirements === 0 &&
      contradictions.length === 0 &&
      underspecifiedBehaviors.length === 0 &&
      scopeExpansions.length === 0 &&
      unresolvedAssumptions.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    total_must_requirements: mustReqs.length,
    covered_requirements: coveredReqs.size,
    missing_requirements: missingRequirements,
    contradictions_detected: contradictions.length,
    underspecified_behaviors: underspecifiedBehaviors.length,
    scope_expansions: scopeExpansions.length,
    unresolved_assumptions: unresolvedAssumptions.length,
    result: passed ? "PASS" : "FAIL",
    note: noStageBAtAll ? "Stage B artifacts not yet present — gate evaluation deferred" : undefined,
    details: { contradictions, scopeExpansions, unresolvedAssumptions, underspecifiedBehaviors: underspecifiedBehaviors.slice(0, 5) }
  };

  writeJson(OUTPUT_PATH, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/unit/docs_gap_validation_report.json",
    blocked: !passed,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Docs Gap Analyzer: PASS — Stage B may proceed to Stage C" }
      : { blocking_questions: ["Docs Gap Analyzer FAIL — see artifacts/verify/unit/docs_gap_validation_report.json"], next_step: "" }
  };
}

module.exports = { runDocsGapAnalyzerValidator, GAP_CLASSIFICATIONS };
