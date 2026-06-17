"use strict";

const path = require("path");

// ── Shared path-containment helper for L3 permission rules (PHASE-36 C1) ───────
// Resolves rawPath against the workspace root, then derives the root-relative
// path (forward-slash). Mirrors fs_tools.safeResolve and container_privilege_rule's
// correct approach so that "artifacts/../code/x.js" collapses to "code/x.js" and is
// prefix-matched against its REAL zone — closing the raw-string traversal gap where
// checkScope used to match the un-resolved string ("artifacts/.." startsWith
// "artifacts/" → wrongly allowed in WORKSPACE_WRITE).
//
// Returns:
//   resolved     — absolute resolved path
//   relative     — root-relative, forward-slash ("../"-prefixed if it escapes root)
//   escapes_root — true when the resolved path lands outside the workspace root
function resolveWithinRoot(root, rawPath) {
  const rootAbs  = path.resolve(root || process.cwd());
  const resolved = path.resolve(rootAbs, String(rawPath == null ? "" : rawPath));
  const escapes_root =
    resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep);
  const relative = path.relative(rootAbs, resolved).replace(/\\/g, "/");
  return { resolved, relative, escapes_root };
}

module.exports = { resolveWithinRoot };
