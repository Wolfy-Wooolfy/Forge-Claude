"use strict";

const path = require("path");

const guard = require("../../container/_privilege_guard");

// L3 rule: fires at Step 1.7 in permissionPolicy.authorize().
// Catches DENY-severity privilege violations (returns DENIED status)
// and container.build specific checks (workspace boundary + vision lock).
//
// NOTE: HARD_DENY violations are intentionally NOT caught here.
// They are handled inside execute() via §2-DL Phase-1 inspectInput
// and must return FAILED status (S59/S60/S61 are positive-FAILED expectations).

function createContainerPrivilegeRule({ root }) {
  const _root = path.resolve(root || process.cwd());
  let _ve = null;

  function _visionEngine() {
    if (!_ve) {
      const { createVisionEngine } = require(
        path.join(_root, "code", "src", "ai_os", "visionEngine")
      );
      _ve = createVisionEngine({ root: _root });
    }
    return _ve;
  }

  function _outsideRoot(absPath) {
    const resolved  = path.resolve(absPath);
    const rootAbs   = path.resolve(_root);
    return !resolved.startsWith(rootAbs + path.sep) && resolved !== rootAbs;
  }

  function check(tool, input, ctx) {
    if (!tool || !tool.name || !tool.name.startsWith("container.")) return { denied: false };

    // Step A: DENY-severity privilege violations → DENIED PROMPT_REQUIRED (e.g. S63 port 80)
    //         Use _root for workspace boundary context so volume checks are relative to workspace.
    const guardCtx = Object.assign({}, ctx || {}, { root: _root });
    const g = guard.inspectInput(input || {}, guardCtx);
    if (!g.ok && g.severity === "DENY") {
      return { denied: true, reason: "PROMPT_REQUIRED", detail: g.detail || null };
    }

    // Step B: container.build specific gates
    if (tool.name === "container.build") {
      // B1: dockerfile_path workspace boundary (S69)
      if (input && input.dockerfile_path) {
        const abs = path.resolve(_root, String(input.dockerfile_path));
        if (_outsideRoot(abs)) {
          return { denied: true, reason: "WORKSPACE_BOUNDARY_VIOLATION", detail: null };
        }
      }

      // B2: context_path workspace boundary
      if (input && input.context_path) {
        const abs = path.resolve(_root, String(input.context_path));
        if (_outsideRoot(abs)) {
          return { denied: true, reason: "WORKSPACE_BOUNDARY_VIOLATION", detail: null };
        }
      }

      // B3: vision lock — building creates persistent images, requires locked vision (S70)
      const projectId = input && input.project_id ? String(input.project_id) : null;
      if (projectId) {
        try {
          const frontmatter = _visionEngine().readVisionSync(projectId);
          if (!frontmatter) return { denied: true, reason: "VISION_NOT_FOUND",  detail: null };
          if (!frontmatter.vision_locked) return { denied: true, reason: "VISION_NOT_LOCKED", detail: null };
        } catch {
          return { denied: true, reason: "VISION_NOT_FOUND", detail: null };
        }
      }
    }

    return { denied: false };
  }

  return { check };
}

module.exports = { createContainerPrivilegeRule };
