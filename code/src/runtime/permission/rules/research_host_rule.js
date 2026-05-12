"use strict";

// L3 permission rule for research.* tools.
// Denies research.search_web in READ_ONLY mode with a named reason.
// (research.fetch_url is also WORKSPACE_WRITE; covered by Step 4 mode check.)
//
// This rule fires at Step 1.9 in permissionPolicy.authorize() — before the
// general mode comparison at Step 4. Its sole purpose is to produce a
// clearly-named deny event in the audit log rather than a generic mode mismatch.
//
// Note: research.search_web already has required_mode: "WORKSPACE_WRITE", so
// Step 4 would deny READ_ONLY mode anyway. This rule makes the denial explicit
// and auditable. Other permission modes (WORKSPACE_WRITE, DANGER_FULL_ACCESS,
// TEST) are allowed to proceed to Step 4's normal mode check.

/**
 * @param {{ getActiveMode: () => string }} options
 */
function createResearchHostRule(options) {
  const opts          = options || {};
  const _getActiveMode = opts.getActiveMode || (() => "READ_ONLY");

  return {
    check(tool /*, input, ctx */) {
      if (tool.name !== "research.search_web") return { denied: false };
      const mode = _getActiveMode();
      if (mode === "READ_ONLY") {
        return {
          denied: true,
          reason: "RESEARCH_SEARCH_DENIED_IN_READ_ONLY",
          detail: "research.search_web requires WORKSPACE_WRITE or higher; current mode is READ_ONLY"
        };
      }
      return { denied: false };
    }
  };
}

module.exports = { createResearchHostRule };
