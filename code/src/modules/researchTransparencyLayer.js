"use strict";

// H-8: Research Transparency Layer
// Per docs/12_ai_os/15_SEARCH_AND_EXTERNAL_RESEARCH.md
// Research results must be classified: KNOWN_FACT | ESTIMATED | UNCERTAIN | EXTERNAL_SOURCE
// System must not assert uncertain knowledge as certain.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const KNOWLEDGE_TYPES = ["KNOWN_FACT", "ESTIMATED", "UNCERTAIN", "EXTERNAL_SOURCE"];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function createResearchTransparencyLayer(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const projectsRoot = path.resolve(root, "artifacts/projects");

  function normalizeProjectId(v) {
    return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
  }

  function wrapResearchResult(projectId, rawResult, sourceType) {
    const id = normalizeProjectId(projectId);
    const knowledgeType = KNOWLEDGE_TYPES.includes(sourceType) ? sourceType : "UNCERTAIN";

    const wrapped = {
      research_id: `RES-${Date.now()}`,
      project_id: id,
      knowledge_type: knowledgeType,
      source_type: sourceType || "UNKNOWN",
      content: rawResult,
      transparency_note: getTransparencyNote(knowledgeType),
      generated_at: nowIso()
    };

    const logPath = path.join(projectsRoot, id, "ai_os", "research_log.json");
    const log = readJsonSafe(logPath, []);
    log.push(wrapped);
    writeJson(logPath, log);

    return wrapped;
  }

  function getTransparencyNote(knowledgeType) {
    switch (knowledgeType) {
      case "KNOWN_FACT": return "This is a documented fact from the project specification.";
      case "ESTIMATED": return "This is an estimate based on available information — verify before acting.";
      case "UNCERTAIN": return "This information is uncertain. Do not act on it without verification.";
      case "EXTERNAL_SOURCE": return "This information comes from an external source. Accuracy is not guaranteed.";
      default: return "Knowledge type unknown — treat as uncertain.";
    }
  }

  function validateResearchTransparency(projectId) {
    const id = normalizeProjectId(projectId);
    const logPath = path.join(projectsRoot, id, "ai_os", "research_log.json");
    const log = readJsonSafe(logPath, []);

    const violations = [];
    log.forEach((entry, i) => {
      if (!entry.knowledge_type) {
        violations.push({ index: i, violation: "MISSING_KNOWLEDGE_TYPE", note: `Research entry ${i} has no knowledge_type` });
      }
      if (!KNOWLEDGE_TYPES.includes(entry.knowledge_type)) {
        violations.push({ index: i, violation: "INVALID_KNOWLEDGE_TYPE", note: `Research entry ${i} has invalid knowledge_type: ${entry.knowledge_type}` });
      }
      if (!entry.transparency_note) {
        violations.push({ index: i, violation: "MISSING_TRANSPARENCY_NOTE", note: `Research entry ${i} missing transparency_note` });
      }
    });

    const reportPath = path.join(projectsRoot, id, "ai_os", "research_transparency_report.json");
    writeJson(reportPath, {
      timestamp_utc: nowIso(),
      project_id: id,
      total_entries: log.length,
      violations_found: violations.length,
      result: violations.length === 0 ? "PASS" : "FAIL",
      violations
    });

    return { ok: violations.length === 0, violations, total_entries: log.length };
  }

  return { wrapResearchResult, validateResearchTransparency, KNOWLEDGE_TYPES, getTransparencyNote };
}

// Global runner for governance report
function runResearchTransparencyReport(options = {}) {
  const root = String(options.root || ROOT);
  const projectsRoot = path.join(root, "artifacts", "projects");
  const outputPath = path.join(root, "artifacts", "verify", "research_transparency_report.json");

  let totalEntries = 0;
  let totalViolations = 0;
  const projectReports = [];

  if (fs.existsSync(projectsRoot)) {
    fs.readdirSync(projectsRoot).forEach((entry) => {
      if (entry.startsWith(".") || entry.endsWith(".json")) return;
      const logPath = path.join(projectsRoot, entry, "ai_os", "research_log.json");
      const log = readJsonSafe(logPath, []);
      if (!log.length) return;

      const violations = log.filter((e) => !KNOWLEDGE_TYPES.includes(e.knowledge_type));
      totalEntries += log.length;
      totalViolations += violations.length;
      projectReports.push({ project: entry, entries: log.length, violations: violations.length });
    });
  }

  const passed = totalViolations === 0;
  const artifact = {
    timestamp_utc: nowIso(),
    total_research_entries: totalEntries,
    total_violations: totalViolations,
    result: passed ? "PASS" : "FAIL",
    verdict: passed ? "Research transparency PASS — all entries classified" : `${totalViolations} entries missing knowledge classification`,
    project_reports: projectReports
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/research_transparency_report.json"
  };
}

function readJsonSafeStatic(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}

module.exports = { createResearchTransparencyLayer, runResearchTransparencyReport, KNOWLEDGE_TYPES };
