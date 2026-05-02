"use strict";

// H-2: Fork Detection Engine
// Per docs/07_decisions/EXECUTION_FORK_DETECTION_RULES.md (FORGE-DOC-28)
//
// Detects execution forks and transitions to Design Exploration Mode.
// Fork conditions: multiple valid implementations, missing deterministic rule,
// conflicting objectives, architecture-level change, external strategy impact.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const FORK_CONDITIONS = [
  { id: "FC-01", name: "MULTIPLE_VALID_IMPLEMENTATIONS", description: "Multiple valid implementations exist with no dominant choice" },
  { id: "FC-02", name: "MISSING_DETERMINISTIC_RULE", description: "Execution requires a value or structure not defined by documentation or schema" },
  { id: "FC-03", name: "CONFLICTING_OBJECTIVES", description: "Multiple objectives conflict with no priority authority" },
  { id: "FC-04", name: "ARCHITECTURE_LEVEL_CHANGE", description: "An option alters system architecture, module boundaries, artifact flow, or pipeline behavior" },
  { id: "FC-05", name: "EXTERNAL_STRATEGY_IMPACT", description: "A decision affects product strategy, project scope, or governance boundaries" }
];

// These conditions NEVER trigger a fork (per §4)
const NON_FORK_CONDITIONS = [
  "DETERMINISTIC_RULE_EXISTS",
  "OPTION_VIOLATES_CONSTRAINTS",
  "IMPLEMENTATION_DETAIL_ONLY"
];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function generateForkId(stage) {
  const ts = Date.now();
  return `FORK-${stage}-${ts}`;
}

function declareFork(options = {}) {
  const root = String(options.root || ROOT);
  const stage = String(options.stage || "UNKNOWN").toUpperCase();
  const conditionId = String(options.condition || "FC-01");
  const context = options.context || {};
  const alternatives = Array.isArray(options.alternatives) ? options.alternatives : [];

  const condition = FORK_CONDITIONS.find((c) => c.id === conditionId || c.name === conditionId);
  if (!condition) {
    return {
      ok: false,
      reason: `Unknown fork condition: ${conditionId}. Valid: ${FORK_CONDITIONS.map((c) => c.id).join(", ")}`,
      blocked: false
    };
  }

  const forkId = generateForkId(stage);
  const forkRecord = {
    fork_id: forkId,
    declared_at: nowIso(),
    stage,
    condition: condition.name,
    condition_id: condition.id,
    description: condition.description,
    context,
    alternatives,
    status: "OPEN",
    resolution: null,
    resolved_at: null
  };

  const forksDir = path.join(root, "artifacts", "decisions", "forks");
  const forkPath = path.join(forksDir, `${forkId}.json`);
  writeJson(forkPath, forkRecord);

  const forkLogPath = path.join(root, "artifacts", "decisions", "fork_log.json");
  const forkLog = readJsonSafe(forkLogPath, []);
  forkLog.push({ fork_id: forkId, stage, condition: condition.name, declared_at: forkRecord.declared_at, status: "OPEN" });
  writeJson(forkLogPath, forkLog);

  return {
    ok: true,
    mode: "DESIGN_EXPLORATION_MODE",
    fork_id: forkId,
    stage,
    condition: condition.name,
    blocked: true,
    artifact_path: `artifacts/decisions/forks/${forkId}.json`,
    status_patch: {
      blocking_questions: [
        `Fork declared: ${condition.name} at Stage ${stage}. ${condition.description}. Alternatives: ${alternatives.length}. Human decision required before execution may resume.`
      ],
      next_step: ""
    }
  };
}

function resolveFork(options = {}) {
  const root = String(options.root || ROOT);
  const forkId = String(options.fork_id || "");
  const selectedAlternative = options.selected_alternative;
  const resolvedBy = String(options.resolved_by || "HUMAN");

  if (!forkId) return { ok: false, reason: "fork_id required" };

  const forkPath = path.join(root, "artifacts", "decisions", "forks", `${forkId}.json`);
  if (!fs.existsSync(forkPath)) return { ok: false, reason: `Fork ${forkId} not found` };

  const forkRecord = readJsonSafe(forkPath, null);
  if (!forkRecord) return { ok: false, reason: "Fork record unreadable" };

  if (forkRecord.status === "RESOLVED") return { ok: false, reason: `Fork ${forkId} already resolved` };

  forkRecord.status = "RESOLVED";
  forkRecord.resolution = selectedAlternative;
  forkRecord.resolved_by = resolvedBy;
  forkRecord.resolved_at = nowIso();
  writeJson(forkPath, forkRecord);

  const forkLogPath = path.join(root, "artifacts", "decisions", "fork_log.json");
  const forkLog = readJsonSafe(forkLogPath, []);
  const entry = forkLog.find((e) => e.fork_id === forkId);
  if (entry) { entry.status = "RESOLVED"; entry.resolved_at = forkRecord.resolved_at; }
  writeJson(forkLogPath, forkLog);

  return {
    ok: true,
    fork_id: forkId,
    status: "RESOLVED",
    selected_alternative: selectedAlternative,
    resolved_at: forkRecord.resolved_at
  };
}

function getOpenForks(root = ROOT) {
  const forksDir = path.join(root, "artifacts", "decisions", "forks");
  if (!fs.existsSync(forksDir)) return [];
  return fs.readdirSync(forksDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJsonSafe(path.join(forksDir, f), null))
    .filter((d) => d && d.status === "OPEN");
}

function runForkDetectionReport(options = {}) {
  const root = String(options.root || ROOT);
  const outputPath = path.join(root, "artifacts", "verify", "fork_detection_report.json");

  const openForks = getOpenForks(root);
  const forkLog = readJsonSafe(path.join(root, "artifacts", "decisions", "fork_log.json"), []);

  const artifact = {
    timestamp_utc: nowIso(),
    total_forks_declared: forkLog.length,
    open_forks: openForks.length,
    resolved_forks: forkLog.filter((f) => f.status === "RESOLVED").length,
    result: openForks.length === 0 ? "PASS" : "BLOCKED",
    verdict: openForks.length === 0
      ? "No open execution forks — execution may proceed"
      : `${openForks.length} open fork(s) require human resolution before execution continues`,
    open_fork_ids: openForks.map((f) => f.fork_id)
  };

  writeJson(outputPath, artifact);

  return {
    ok: openForks.length === 0,
    result: openForks.length === 0 ? "PASS" : "BLOCKED",
    open_forks: openForks.length,
    artifact_path: "artifacts/verify/fork_detection_report.json",
    status_patch: openForks.length === 0
      ? { blocking_questions: [], next_step: "Fork Detection: no open forks" }
      : { blocking_questions: openForks.map((f) => `Open fork: ${f.fork_id} (${f.condition}) at stage ${f.stage}`), next_step: "" }
  };
}

module.exports = {
  declareFork,
  resolveFork,
  getOpenForks,
  runForkDetectionReport,
  FORK_CONDITIONS,
  NON_FORK_CONDITIONS
};
