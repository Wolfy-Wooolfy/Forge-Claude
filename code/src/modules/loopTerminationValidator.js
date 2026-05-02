"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const LOOP_HISTORY_PATH = path.resolve(ROOT, "artifacts", "gap", "loop_history.json");
const DEFAULT_MAX_ITERATIONS = 5;

function ensureDir(abs) {
  fs.mkdirSync(abs, { recursive: true });
}

function readJsonSafe(absPath, fallback) {
  try {
    if (!fs.existsSync(absPath)) return fallback;
    return JSON.parse(fs.readFileSync(absPath, "utf-8"));
  } catch (_) {
    return fallback;
  }
}

function writeJson(absPath, obj) {
  ensureDir(path.dirname(absPath));
  fs.writeFileSync(absPath, JSON.stringify(obj, null, 2), "utf-8");
}

function loadHistory() {
  return readJsonSafe(LOOP_HISTORY_PATH, {
    iterations: [],
    total_count: 0,
    last_reset_at: null
  });
}

function recordIteration(gapCount, criticalCount) {
  const history = loadHistory();
  const entry = {
    iteration: history.total_count + 1,
    recorded_at: new Date().toISOString(),
    gap_count: Number(gapCount || 0),
    critical_count: Number(criticalCount || 0)
  };

  history.iterations.push(entry);
  history.total_count = history.iterations.length;
  history.last_iteration_at = entry.recorded_at;

  writeJson(LOOP_HISTORY_PATH, history);
  return history;
}

function resetHistory() {
  const fresh = {
    iterations: [],
    total_count: 0,
    last_reset_at: new Date().toISOString()
  };
  writeJson(LOOP_HISTORY_PATH, fresh);
  return fresh;
}

/**
 * Checks if the gap resolution loop has been exhausted without progress.
 * Returns { exhausted: false } if OK to proceed, or
 * { exhausted: true, reason, iteration_count, max_iterations } if loop is stuck.
 */
function assertLoopNotExhausted(maxIterations) {
  const limit = Number(maxIterations || DEFAULT_MAX_ITERATIONS);
  const history = loadHistory();
  const count = history.total_count || 0;

  if (count < limit) {
    return { exhausted: false, iteration_count: count, max_iterations: limit };
  }

  // Check if the last N iterations show no improvement (gap_count unchanged or increasing)
  const recent = history.iterations.slice(-limit);
  const allSameCritical =
    recent.length >= 2 &&
    recent.every((e) => e.critical_count === recent[0].critical_count);

  const isStuck = allSameCritical;

  if (count >= limit && isStuck) {
    return {
      exhausted: true,
      reason: "LOOP_EXHAUSTED_NO_PROGRESS",
      iteration_count: count,
      max_iterations: limit,
      last_critical_count: recent[recent.length - 1].critical_count,
      recommendation: "Manual intervention required — critical gaps have not been resolved after maximum iterations."
    };
  }

  // Past the limit but showing progress — allow to continue with a warning
  return {
    exhausted: false,
    warning: "LOOP_PAST_MAX_BUT_PROGRESSING",
    iteration_count: count,
    max_iterations: limit
  };
}

/**
 * Gate function: call at the start of each gap cycle.
 * Returns null if OK, or a blocked result object if exhausted.
 */
function checkLoopGate(options = {}) {
  const maxIterations = Number(options.max_iterations || DEFAULT_MAX_ITERATIONS);
  const result = assertLoopNotExhausted(maxIterations);

  if (result.exhausted) {
    return {
      blocked: true,
      artifact: "artifacts/gap/loop_history.json",
      status_patch: {
        blocking_questions: [
          `Gap loop exhausted after ${result.iteration_count} iterations with no progress. Critical gaps: ${result.last_critical_count}. Manual intervention required.`
        ],
        next_step: ""
      },
      loop_termination: result
    };
  }

  return null;
}

module.exports = {
  recordIteration,
  resetHistory,
  assertLoopNotExhausted,
  checkLoopGate,
  loadHistory,
  DEFAULT_MAX_ITERATIONS
};
