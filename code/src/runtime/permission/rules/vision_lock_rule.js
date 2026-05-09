"use strict";

// ── Vision Lock Rule — L3 deny gate for docs writes ───────────────────────────
// Denies fs.write_file on docs paths when the project vision is not locked.
// Fires in permissionPolicy.authorize() Step 1.5 (after hard_deny, before scope).

function createVisionLockRule({ root }) {
  let _ve = null;

  function _engine() {
    if (!_ve) {
      const { createVisionEngine } = require("../../../ai_os/visionEngine");
      _ve = createVisionEngine({ root });
    }
    return _ve;
  }

  // Returns { denied: false } to pass, or { denied: true, reason: string } to block.
  function check(tool, input, ctx) {
    if (tool.name !== "fs.write_file") return { denied: false };

    const inputPath = (input && input.path) ? String(input.path).replace(/\\/g, "/") : "";
    let projectId = null;

    if (inputPath.startsWith("docs/")) {
      // Top-level Forge docs require a project_id in ctx
      projectId = (ctx && ctx.project_id) ? String(ctx.project_id) : null;
      if (!projectId) return { denied: false };
    } else {
      // Project-scoped docs: artifacts/projects/<id>/docs/
      const m = inputPath.match(/^artifacts\/projects\/([^/]+)\/docs\//);
      if (!m) return { denied: false };
      projectId = m[1];
    }

    const frontmatter = _engine().readVisionSync(projectId);
    if (!frontmatter) return { denied: true, reason: "VISION_NOT_FOUND" };
    if (!frontmatter.vision_locked) return { denied: true, reason: "VISION_NOT_LOCKED" };
    return { denied: false };
  }

  return { check };
}

module.exports = { createVisionLockRule };
