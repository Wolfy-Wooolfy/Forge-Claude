"use strict";

// PHASE-47 W-4 meta-regression helper — S344 (reviewer_v6) + S345 (security_auditor_v7).
// Pure file/loader inspection — no LLM calls, no real OS APIs, no side effects.
// Mirrors the S208 / S340 / S341 pattern (file-inspection meta-regression).
// Per §ARC convention, test helpers may use fs.*Sync directly (test infrastructure).
//
// HONEST SCOPE (DECISION-2026-06-30-phase-47 §8): a mock-default eval CANNOT prove the
// real model now OBEYS the new discipline — the mock adapter returns a fixed verdict keyed
// by prompt prefix / scenario tag, independent of the prompt body. What these two scenarios
// DO prove deterministically ($0):
//   (a) the corrective INTERVENTION is installed — reviewer_v6 / security_auditor_v7 exist,
//       the roles point to them, and the new W-1 / W-2 anchor clauses are present;
//   (b) RECALL is retained — the prior true-positive discipline (missing-404 / this.changes
//       => BLOCKER; Example-B concatenated SQLi => BLOCKER; Example-A parameterized => WARN)
//       is still present, not deleted by the edit;
//   (c) the protected first-500-char prefix is byte-identical to the prior version, so the
//       S89/S90/S96-S99 mock prefix keys are preserved.
// Whether the model's VERDICT is actually corrected is proven only by the owner-gated real
// replay (scripts/spikes/phase47_fp_replay.js) per the decision §4 item 6.

const fs   = require("fs");
const path = require("path");

const ROOT = process.cwd();

// --- reviewer_v6 (W-1) anchors -------------------------------------------------
// New citation-discipline clauses — present in v6 ONLY (absent in reviewer_v5).
const REVIEWER_V6_NEW_ANCHORS = [
  "Citation discipline (reviewer_v6",
  "downgrade to WARN or omit it",
  "already returns 404 (or already checks affected rows) on the not-found path",
  "a behavior is covered by a PASSING test"
];
// Recall discipline that MUST survive from v5 (guard against deletion).
const REVIEWER_RECALL_ANCHORS = [
  "missing not-found (404) handling",
  "this.changes"
];

// --- security_auditor_v7 (W-2) anchors -----------------------------------------
// New no-sink clauses + worked Example D — present in v7 ONLY (absent in v6).
const SECURITY_V7_NEW_ANCHORS = [
  "Example D",
  "No-sink rule (security_auditor_v7",
  "Injection is IMPOSSIBLE because there is no sink",
  "Speculative future risk is explicitly out of scope"
];
// Recall + precision controls that MUST survive from v6 (the worked-example code).
const SECURITY_RECALL_ANCHORS = [
  "INSERT INTO items (label) VALUES (?)",           // Example A — parameterized => WARN
  "SELECT * FROM items WHERE label = '"             // Example B — concatenated => BLOCKER
];

function _roleSrcHasLoad(relRolePath, promptId) {
  try {
    const src = fs.readFileSync(path.join(ROOT, relRolePath), "utf8");
    return src.includes('loadPrompt("' + promptId + '")');
  } catch (_e) { return false; }
}

async function runS344ReviewerV6CitationDiscipline() {
  // Resolve via the SAME loader the roles use; reset first so the read reflects current
  // 18b on disk (order-independent within the suite).
  const { loadPrompt, resetPromptCache } =
    require("../../runtime/agents/_prompt_loader");
  resetPromptCache();

  // Requiring the role triggers loadPrompt("reviewer_v6") at module-load once W-3 lands;
  // until reviewer_v6 exists, the direct loadPrompt below throws => scenario RED.
  const reviewerRole = require("../../runtime/agents/roles/reviewer_role");

  const reviewer_v6 = loadPrompt("reviewer_v6");
  const reviewer_v5 = loadPrompt("reviewer_v5");

  return {
    reviewer_active_prompt_id_is_v6:
      reviewerRole.system_prompt_id === "reviewer_v6",
    reviewer_loads_v6_via_loader:
      _roleSrcHasLoad("code/src/runtime/agents/roles/reviewer_role.js", "reviewer_v6"),
    reviewer_v6_has_citation_anchors:
      REVIEWER_V6_NEW_ANCHORS.every((t) => reviewer_v6.includes(t)),
    reviewer_v6_preserves_recall:
      REVIEWER_RECALL_ANCHORS.every((t) => reviewer_v6.includes(t)),
    reviewer_v6_prefix_byte_identical_to_v5:
      reviewer_v6.slice(0, 500) === reviewer_v5.slice(0, 500)
  };
}

async function runS345SecurityV7NoSinkClause() {
  const { loadPrompt, resetPromptCache } =
    require("../../runtime/agents/_prompt_loader");
  resetPromptCache();

  const securityRole = require("../../runtime/agents/roles/security_auditor_role");

  const security_v7 = loadPrompt("security_auditor_v7");
  const security_v6 = loadPrompt("security_auditor_v6");

  return {
    security_active_prompt_id_is_v7:
      securityRole.system_prompt_id === "security_auditor_v7",
    security_loads_v7_via_loader:
      _roleSrcHasLoad("code/src/runtime/agents/roles/security_auditor_role.js", "security_auditor_v7"),
    security_v7_has_no_sink_anchors:
      SECURITY_V7_NEW_ANCHORS.every((t) => security_v7.includes(t)),
    security_v7_preserves_recall:
      SECURITY_RECALL_ANCHORS.every((t) => security_v7.includes(t)),
    security_v7_prefix_byte_identical_to_v6:
      security_v7.slice(0, 500) === security_v6.slice(0, 500)
  };
}

module.exports = {
  runS344ReviewerV6CitationDiscipline,
  runS345SecurityV7NoSinkClause
};
