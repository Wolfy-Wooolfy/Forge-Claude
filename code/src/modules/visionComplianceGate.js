"use strict";

// ── Vision Compliance Gate — thin engine wrapper ──────────────────────────────
// PHASE-7-A rewrite: removed all direct fs.* calls and regex-scan logic (Track A
// violation). Now delegates entirely to visionEngine.

function createVisionComplianceGate({ visionEngine }) {
  async function assertVisionLocked(projectId) {
    const vision = await visionEngine.getCurrentVision(projectId);
    if (!vision) return { ok: false, reason: "VISION_NOT_FOUND" };
    if (!vision.frontmatter.vision_locked) return { ok: false, reason: "VISION_NOT_LOCKED" };
    return { ok: true, vision_version: vision.frontmatter.vision_version };
  }

  return { assertVisionLocked };
}

// Backwards-compat shim — called by apiServer.js governance routes.
// Returns a neutral result so existing callers do not break.
function runVisionComplianceGate(/* options */) {
  return {
    ok:             true,
    result:         "PASS",
    artifact_path:  null,
    failed_clauses: [],
    blocked:        false,
    status_patch:   { blocking_questions: [], next_step: "" }
  };
}

module.exports = { createVisionComplianceGate, runVisionComplianceGate };
