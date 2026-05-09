"use strict";

const path = require("path");

// L3 deny rule: shell commands targeting a project workspace are blocked
// when the project vision is not locked. Fires at Step 1.6 in permissionPolicy.authorize().

function createShellVisionLockRule({ root }) {
  const _root = path.resolve(root || process.cwd());
  let _ve = null;

  function _engine() {
    if (!_ve) {
      const { createVisionEngine } = require(
        path.join(_root, "code", "src", "ai_os", "visionEngine")
      );
      _ve = createVisionEngine({ root: _root });
    }
    return _ve;
  }

  function check(tool, input, ctx) {
    const name = tool && tool.name;

    // shell.run_in_workspace: project_id is explicit in input
    if (name === "shell.run_in_workspace") {
      const projectId = input && input.project_id ? String(input.project_id) : null;
      if (!projectId) return { denied: false };
      return _checkProjectId(projectId);
    }

    // shell.run / shell.run_with_prompt: scan argv for artifacts/projects/<id>/ path
    if (name === "shell.run" || name === "shell.run_with_prompt") {
      const argv = Array.isArray(input && input.argv) ? input.argv : [];
      for (const arg of argv) {
        const normalized = String(arg).replace(/\\/g, "/");
        const m = normalized.match(/(?:^|\/)artifacts\/projects\/([^/]+)\//);
        if (m) return _checkProjectId(m[1]);
      }
      return { denied: false };
    }

    return { denied: false };
  }

  function _checkProjectId(projectId) {
    const frontmatter = _engine().readVisionSync(projectId);
    if (!frontmatter) return { denied: true, reason: "VISION_NOT_FOUND" };
    if (!frontmatter.vision_locked) return { denied: true, reason: "VISION_NOT_LOCKED" };
    return { denied: false };
  }

  return { check };
}

module.exports = { createShellVisionLockRule };
