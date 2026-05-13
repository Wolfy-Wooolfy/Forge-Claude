"use strict";

const path = require("path");

// L3 rule: fires at Step 1.10 in permissionPolicy.authorize().
// Gate for builtproject.run_scenarios — analog to agent_budget_rule for agent.invoke.
//
// Checks:
//   A — Scope: project_root must reside inside artifacts/projects/<id>/
//   B — Vision lock: project must have vision_locked: true
//
// TEST mode bypass via getActiveMode callback (same pattern as research_host_rule).
// In TEST mode the scenario harness owns isolation — no vision file is required.
//
// Per DECISION-20260512-1430 §4.1.

/**
 * @param {{ root?: string, getActiveMode?: () => string }} options
 */
function createBuiltprojectVisionRule(options) {
  const opts         = options || {};
  const _root        = path.resolve((opts.root) || process.cwd());
  const _getActiveMode = opts.getActiveMode || (() => "WORKSPACE_WRITE");

  // ── Vision engine (lazy, same pattern as agent_budget_rule) ────────────────

  let _ve = null;
  function _visionEngine() {
    if (!_ve) {
      const { createVisionEngine } = require("../../../ai_os/visionEngine");
      _ve = createVisionEngine({ root: _root });
    }
    return _ve;
  }

  // ── check ───────────────────────────────────────────────────────────────────

  function check(tool, input /*, ctx */) {
    if (!tool || tool.name !== "builtproject.run_scenarios") return { denied: false };

    // TEST mode bypass: harness provides its own project isolation
    if (_getActiveMode() === "TEST") return { denied: false };

    const projectRoot = input && input.project_root ? String(input.project_root) : null;
    if (!projectRoot) {
      return { denied: true, reason: "PROJECT_ROOT_MISSING", detail: null };
    }

    // ── A: Scope — project_root must be inside artifacts/projects/ ──────────

    const normRoot      = projectRoot.replace(/\\/g, "/");
    const allowedPrefix = path.resolve(_root, "artifacts", "projects")
                              .replace(/\\/g, "/");

    if (!normRoot.startsWith(allowedPrefix)) {
      return {
        denied: true,
        reason: "PROJECT_ROOT_OUT_OF_SCOPE",
        detail:  "project_root must be inside artifacts/projects/<id>/"
      };
    }

    // ── B: Vision lock ──────────────────────────────────────────────────────

    const projectId = path.basename(normRoot);
    try {
      const frontmatter = _visionEngine().readVisionSync(projectId);
      if (!frontmatter) {
        return { denied: true, reason: "VISION_NOT_FOUND", detail: null };
      }
      if (!frontmatter.vision_locked) {
        return { denied: true, reason: "VISION_NOT_LOCKED", detail: null };
      }
    } catch {
      return { denied: true, reason: "VISION_NOT_FOUND", detail: null };
    }

    return { denied: false };
  }

  return { check };
}

module.exports = { createBuiltprojectVisionRule };
