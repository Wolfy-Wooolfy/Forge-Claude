"use strict";

// Testing infrastructure for Stage 10.2 debate protocol scenarios.
// Not part of the production runtime — called exclusively by module_call scenarios.

function _debate() { return require("../../runtime/orchestration/debate_protocol"); }

// ── S142 helper — agree at PROPOSE ────────────────────────────────────────────
// Both debaters carry the same BLOCKER location → _blockersAgree returns true
// at PROPOSE → runDebate returns immediately with verdict=AGREE, debate_log.length=2.
// role_invoker throws if called — verifies no COUNTER round was entered.

async function runS142Sequence() {
  const { runDebate, validateDebateVerdict } = _debate();

  const sharedBlocker   = { severity: "BLOCKER", location: "src/auth.js:42", issue: "SQL injection" };
  const reviewerOutput  = { status: "SUCCESS", output: { findings: [sharedBlocker], summary: "Found one BLOCKER" } };
  const securityOutput  = { status: "SUCCESS", output: { findings: [sharedBlocker], summary: "Same BLOCKER found" } };

  const ctx = {
    project_id:   "test_s142",
    role_invoker: async function(role_id) {
      throw new Error("role_invoker called unexpectedly in S142: " + role_id);
    }
  };

  const result = await runDebate(reviewerOutput, securityOutput, ctx);
  const v      = validateDebateVerdict(result);

  return {
    verdict:                   result.verdict,
    debate_log_length:         result.debate_log.length,
    first_round_is_0:          result.debate_log[0].round === 0,
    second_round_is_0:         result.debate_log[1].round === 0,
    winning_position_nonempty: typeof result.winning_position === "string" && result.winning_position.length > 0,
    schema_valid:              v.valid
  };
}

// ── S143 helper — arbitrate after 3 COUNTER rounds ───────────────────────────
// Reviewer always reports BLOCKER at auth.js; security always reports BLOCKER
// at payment.js. Different locations → disagree at PROPOSE and every COUNTER round.
// After 3 COUNTER rounds quality_judge is invoked.
// Expected: verdict=ARBITRATED, debate_log.length=9 (2 + 6 + 1).

async function runS143Sequence() {
  const { runDebate, validateDebateVerdict } = _debate();

  const reviewerBlocker = { severity: "BLOCKER", location: "src/auth.js:42",     issue: "SQL injection" };
  const securityBlocker = { severity: "BLOCKER", location: "src/payment.js:100", vulnerability: "XSS" };

  const initialReviewer = { status: "SUCCESS", output: { findings: [reviewerBlocker], summary: "Auth BLOCKER" } };
  const initialSecurity = { status: "SUCCESS", output: { findings: [securityBlocker], summary: "Payment BLOCKER" } };

  const ctx = {
    project_id:   "test_s143",
    spec:         {},
    design:       {},
    role_invoker: async function(role_id) {
      if (role_id === "reviewer") {
        return { status: "SUCCESS", output: { findings: [reviewerBlocker], summary: "Still: Auth BLOCKER" } };
      }
      if (role_id === "security_auditor") {
        return { status: "SUCCESS", output: { findings: [securityBlocker], summary: "Still: Payment BLOCKER" } };
      }
      if (role_id === "quality_judge") {
        return { status: "SUCCESS", output: { verdict: "ARBITRATED", summary: "Security BLOCKER takes priority." } };
      }
      throw new Error("S143: unknown role_id: " + role_id);
    }
  };

  const result = await runDebate(initialReviewer, initialSecurity, ctx);
  const v      = validateDebateVerdict(result);

  const lastEntry = result.debate_log[result.debate_log.length - 1];

  return {
    verdict:                   result.verdict,
    debate_log_length:         result.debate_log.length,
    last_speaker_is_qj:        lastEntry && lastEntry.speaker === "quality_judge",
    winning_position_nonempty: typeof result.winning_position === "string" && result.winning_position.length > 0,
    schema_valid:              v.valid
  };
}

// ── S144 helper — validateDebateVerdict schema checks ─────────────────────────
// Tests validateDebateVerdict directly with:
//   (1) a fully valid verdict — expects valid:true, no errors
//   (2) missing basis field — expects valid:false
//   (3) bad verdict enum value — expects valid:false
// Also verifies VERDICT_ENUM contains exactly the expected values.

function runS144Sequence() {
  const { validateDebateVerdict, VERDICT_ENUM } = _debate();

  const good = validateDebateVerdict({
    verdict:          "AGREE",
    winning_position: "Agreed: no BLOCKER disagreement.",
    basis:            "Both agreed at PROPOSE.",
    debate_log: [
      { round: 0, speaker: "reviewer",         content: "No BLOCKER findings." },
      { round: 0, speaker: "security_auditor", content: "No BLOCKER findings." }
    ]
  });

  const missingBasis = validateDebateVerdict({
    verdict:          "AGREE",
    winning_position: "pos",
    debate_log:       []
  });

  const badVerdict = validateDebateVerdict({
    verdict:          "INVALID",
    winning_position: "pos",
    basis:            "b",
    debate_log:       []
  });

  return {
    schema_valid:                 good.valid,
    all_required_fields:          good.valid && good.errors.length === 0,
    log_items_valid:              good.valid,
    verdict_is_enum:              VERDICT_ENUM.includes("AGREE") &&
                                  VERDICT_ENUM.includes("ARBITRATED") &&
                                  !VERDICT_ENUM.includes("INVALID"),
    negative_missing_basis_fails: !missingBasis.valid,
    negative_bad_verdict_fails:   !badVerdict.valid
  };
}

module.exports = { runS142Sequence, runS143Sequence, runS144Sequence };
