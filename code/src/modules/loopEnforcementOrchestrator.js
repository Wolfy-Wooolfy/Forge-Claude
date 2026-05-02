"use strict";

// Implements docs/03_pipeline/03_16_Loop_Enforcement_Specification.md
// Governs Loop 1 (Idea→Spec), Loop 2 (Docs Refinement), Loop 3 (Code→Verify)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const STATE_PATH = path.resolve(ROOT, "artifacts", "gap", "loop_enforcement_state.json");

const LOOP_DEFINITIONS = {
  LOOP_1: {
    id: "LOOP_1",
    name: "Idea → Final Spec",
    entry_condition: "INTAKE_COMPLETE",
    closure_condition: "STAGE_A_ARTIFACTS_COMPLETE",
    required_closure_artifacts: [
      "artifacts/intake/intake_snapshot.json",
      "artifacts/intake/intake_context.json"
    ],
    max_iterations: 10
  },
  LOOP_2: {
    id: "LOOP_2",
    name: "Documentation Refinement",
    entry_condition: "STAGE_A_CLOSED",
    closure_condition: "ZERO_MUST_GAPS",
    required_closure_artifacts: [
      "artifacts/verify/unit/docs_gap_validation_report.json"
    ],
    max_iterations: 5
  },
  LOOP_3: {
    id: "LOOP_3",
    name: "Code → Verification",
    entry_condition: "STAGE_B_CLOSED",
    closure_condition: "VERIFY_PASS_AND_CLOSURE_READY",
    required_closure_artifacts: [
      "artifacts/verify/verification_results.json",
      "artifacts/verify/test_evidence.json",
      "artifacts/verify/unit/trace_validation_report.json"
    ],
    max_iterations: 5
  }
};

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function loadState() {
  return readJsonSafe(STATE_PATH, {
    loops: { LOOP_1: { iterations: 0, status: "NOT_STARTED", history: [] }, LOOP_2: { iterations: 0, status: "NOT_STARTED", history: [] }, LOOP_3: { iterations: 0, status: "NOT_STARTED", history: [] } }
  });
}

function saveState(state) {
  writeJson(STATE_PATH, state);
}

function checkClosureArtifacts(root, loopDef) {
  const missing = [];
  for (const artifactRel of loopDef.required_closure_artifacts) {
    const abs = path.join(root, artifactRel);
    if (!fs.existsSync(abs)) missing.push(artifactRel);
    else {
      // For JSON artifacts, check result field
      if (artifactRel.endsWith(".json")) {
        const data = readJsonSafe(abs, {});
        if (data.result === "FAIL" || data.blocked === true) {
          missing.push(`${artifactRel} (result=FAIL)`);
        }
      }
    }
  }
  return missing;
}

function enterLoop(loopId, options = {}) {
  const root = String(options.root || ROOT);
  const def = LOOP_DEFINITIONS[loopId];
  if (!def) return { ok: false, reason: `Unknown loop: ${loopId}` };

  const state = loadState();
  const loopState = state.loops[loopId];

  if (loopState.iterations >= def.max_iterations) {
    return {
      ok: false,
      blocked: true,
      reason: "LOOP_MAX_ITERATIONS_EXCEEDED",
      loop_id: loopId,
      iterations: loopState.iterations,
      max_iterations: def.max_iterations,
      status_patch: { blocking_questions: [`Loop ${loopId} exhausted after ${loopState.iterations} iterations — manual intervention required`], next_step: "" }
    };
  }

  loopState.iterations += 1;
  loopState.status = "IN_PROGRESS";
  loopState.history.push({ iteration: loopState.iterations, entered_at: nowIso() });
  saveState(state);

  return { ok: true, loop_id: loopId, iteration: loopState.iterations, max_iterations: def.max_iterations };
}

function closeLoop(loopId, options = {}) {
  const root = String(options.root || ROOT);
  const def = LOOP_DEFINITIONS[loopId];
  if (!def) return { ok: false, reason: `Unknown loop: ${loopId}` };

  const missingArtifacts = checkClosureArtifacts(root, def);

  if (missingArtifacts.length > 0) {
    return {
      ok: false,
      blocked: true,
      reason: "CLOSURE_ARTIFACTS_MISSING_OR_FAILED",
      loop_id: loopId,
      missing_artifacts: missingArtifacts,
      status_patch: { blocking_questions: [`Loop ${loopId} closure BLOCKED — missing/failed artifacts: ${missingArtifacts.join(", ")}`], next_step: "" }
    };
  }

  const state = loadState();
  const loopState = state.loops[loopId];
  loopState.status = "CLOSED";
  loopState.closed_at = nowIso();
  saveState(state);

  return {
    ok: true,
    loop_id: loopId,
    status: "CLOSED",
    iterations_completed: loopState.iterations,
    closure_artifacts_verified: def.required_closure_artifacts
  };
}

function getLoopStatus(loopId) {
  const state = loadState();
  const def = LOOP_DEFINITIONS[loopId];
  if (!def) return null;
  return { ...def, ...state.loops[loopId] };
}

function resetLoop(loopId) {
  const state = loadState();
  if (!state.loops[loopId]) return { ok: false, reason: "Unknown loop" };
  state.loops[loopId] = { iterations: 0, status: "NOT_STARTED", history: [] };
  saveState(state);
  return { ok: true, loop_id: loopId, reset_at: nowIso() };
}

function runFullLoopReport(options = {}) {
  const root = String(options.root || ROOT);
  const state = loadState();
  const report = {
    timestamp_utc: nowIso(),
    loops: Object.fromEntries(
      Object.entries(LOOP_DEFINITIONS).map(([id, def]) => {
        const loopState = state.loops[id] || {};
        const missingArtifacts = checkClosureArtifacts(root, def);
        return [id, {
          name: def.name,
          status: loopState.status || "NOT_STARTED",
          iterations: loopState.iterations || 0,
          max_iterations: def.max_iterations,
          closure_ready: missingArtifacts.length === 0,
          missing_closure_artifacts: missingArtifacts
        }];
      })
    )
  };

  const outputPath = path.join(root, "artifacts", "verify", "loop_enforcement_report.json");
  writeJson(outputPath, report);
  return { ok: true, report, artifact_path: "artifacts/verify/loop_enforcement_report.json" };
}

module.exports = {
  enterLoop,
  closeLoop,
  getLoopStatus,
  resetLoop,
  runFullLoopReport,
  LOOP_DEFINITIONS
};
