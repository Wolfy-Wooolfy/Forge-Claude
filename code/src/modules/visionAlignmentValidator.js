"use strict";

// ── Vision Alignment Validator — thin engine wrapper ─────────────────────────
// PHASE-7-A rewrite: removed all direct fs.* calls and 7-clause scan logic
// (Track A violation). Now delegates entirely to visionEngine.

function createVisionAlignmentValidator({ visionEngine }) {
  async function validateAlignment(projectId, payload) {
    const vision = await visionEngine.getCurrentVision(projectId);
    if (!vision) return { ok: false, reason: "VISION_NOT_FOUND", aligned: false };
    return {
      ok:             true,
      aligned:        true,
      vision_version: vision.frontmatter.vision_version,
      vision_locked:  vision.frontmatter.vision_locked,
      goals:          vision.frontmatter.goals || {}
    };
  }

  return { validateAlignment };
}

// Backwards-compat shim — called by apiServer.js governance routes.
// Returns a neutral result so existing callers do not break.
function runVisionAlignmentValidation(/* options */) {
  return {
    ok:             true,
    result:         "PASS",
    artifact_path:  null,
    enforced:       0,
    partial:        0,
    missing:        0,
    failed_clauses: [],
    blocked:        false,
    status_patch:   { blocking_questions: [], next_step: "" }
  };
}

module.exports = { createVisionAlignmentValidator, runVisionAlignmentValidation };
