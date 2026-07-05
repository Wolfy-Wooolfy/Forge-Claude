"use strict";

// Test helper for S350 (PHASE-50 W-3 — §8 citation-audit owner override).
// Needed because scenario_runner promotes metadata into assertable state only on
// FAILED/DENIED envelopes; §8.4 records citation_audit_override in the COMPLETION
// METADATA of a SUCCESS envelope, so it must be read from the envelope directly.
// Per §ARC convention, test helpers may use fs.*Sync directly (test infrastructure).

const fs   = require("fs");
const path = require("path");
const os   = require("os");

async function runS350CitationOverride() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s350-"));
  try {
    // Seed the draft artifact containing one uncited factual claim (Pattern 1).
    const projDir = path.join(tempDir, "artifacts", "projects", "test_s350");
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(
      path.join(projDir, "documentation_draft.md"),
      "# Documentation\nThe system must persist all session tokens in encrypted storage.\nEnd of document.\n",
      "utf8"
    );

    // Pre-test isolation (S215 precedent): fresh registry + policy.
    const { resetDefaultRegistry, getDefaultRegistry } = require("../../runtime/tools/_registry");
    const { resetDefaultPolicy } = require("../../runtime/permission/permissionPolicy");
    resetDefaultRegistry();
    resetDefaultPolicy();

    const env = await getDefaultRegistry().invoke("role.invoke", {
      role_id:     "documentation",
      project_id:  "test_s350",
      provider:    "mock",
      model:       "mock-doc-s350",
      scenario_id: "S350",
      input: {
        project_id:              "test_s350",
        spec:                    { title: "S350 spec" },
        design:                  { architecture: "S350 design" },
        artifact_path:           "artifacts/projects/test_s350/documentation_draft.md",
        citation_audit_override: true
      }
    }, { root: tempDir });

    const meta  = (env && env.metadata) || {};
    const audit = meta.citation_audit || null;
    return {
      status_success:      !!(env && env.status === "SUCCESS"),
      summary_present:     !!(env && env.output && typeof env.output.summary === "string" && env.output.summary.length > 0),
      override_recorded:   meta.citation_audit_override === true,
      audit_ran:           !!audit,
      audit_fail_uncited:  !!(audit && audit.status === "FAIL_UNCITED"),
      uncited_count_one:   !!(audit && audit.uncited_claims_count === 1)
    };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { runS350CitationOverride };
