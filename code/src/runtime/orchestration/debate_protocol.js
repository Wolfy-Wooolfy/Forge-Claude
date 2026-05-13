"use strict";

// ── ROUND NUMBERING CONVENTION (contract §5.1, binding) ───────────────────────
// PROPOSE entries:          round = 0  (2 entries, one per debater)
// COUNTER round 1:          round = 1  (2 entries, one per debater)
// COUNTER round 2:          round = 2  (2 entries)
// COUNTER round 3:          round = 3  (2 entries)
// ARBITRATE (quality_judge): round = MAX_COUNTER_ROUNDS + 1 = 4 (1 entry)
//
// S142 (agree at PROPOSE):  debate_log.length === 2
// S143 (arbitrate after 3): debate_log.length === 9  (2 + 6 + 1)
// Early AGREE at COUNTER N: debate_log.length === 2 + (N * 2)
//
// ── BLOCKER COMPARISON RULE (contract §5.1 — "disagree on any BLOCKER finding") ─
// AGREE iff the set of `location` strings for BLOCKER-severity findings is equal
// across both debaters.
//   reviewer_locs  = Set(reviewer.output.findings.filter(BLOCKER).map(location))
//   security_locs  = Set(security.output.findings.filter(BLOCKER).map(location))
//   agree = setsEqual(reviewer_locs, security_locs)
// Justification: `location` is required in both role output schemas and is the
// canonical anchor for "which file/line is at issue". Same-location-different-fix
// is treated as AGREE in Stage 10.2 (per CTO Q2 resolution; amend if Stage 10.5
// surfaces a counter-case).
//
// ── CTX.ROLE_INVOKER CONVENTION ───────────────────────────────────────────────
// Production: ctx has no role_invoker → getDefaultRegistry().invoke("role.invoke")
// Tests:      ctx.role_invoker is an async (role_id, input, roleCtx) → result
//             function that returns scripted per-role outputs.
// Track A:    grep "role_invoker" in runtime/ outside this file → 0.

const { getDefaultRegistry } = require("../tools/_registry");

// ── Constants ─────────────────────────────────────────────────────────────────

const DEBATE_STATES      = Object.freeze(["PROPOSE", "COUNTER", "ARBITRATE", "RESOLVED"]);
const VERDICT_ENUM       = Object.freeze(["AGREE", "DISAGREE", "ARBITRATED"]);
const MAX_COUNTER_ROUNDS = 3;   // literal constant per §5.1; checked strict-equal at boot (Stage 10.3)

// ── Pure helpers (no I/O) ─────────────────────────────────────────────────────

function _extractBlockerLocations(roleOutput) {
  const findings = (roleOutput && roleOutput.output &&
                    Array.isArray(roleOutput.output.findings))
    ? roleOutput.output.findings
    : [];
  return new Set(
    findings
      .filter(f => f && f.severity === "BLOCKER")
      .map(f => typeof f.location === "string" ? f.location : "")
  );
}

function _setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function _blockersAgree(reviewerOutput, securityOutput) {
  const rLocs = _extractBlockerLocations(reviewerOutput);
  const sLocs = _extractBlockerLocations(securityOutput);
  return _setsEqual(rLocs, sLocs);
}

// ── DebateVerdict validator (contract §5.2 schema — hand-coded predicates) ────

function validateDebateVerdict(verdict) {
  const errors = [];
  if (!verdict || typeof verdict !== "object" || Array.isArray(verdict)) {
    return { valid: false, errors: ["verdict must be a plain object"] };
  }

  const required = ["verdict", "winning_position", "basis", "debate_log"];
  for (const f of required) {
    if (!(f in verdict)) errors.push("missing required field: " + f);
  }
  if (errors.length > 0) return { valid: false, errors };

  if (!VERDICT_ENUM.includes(verdict.verdict)) {
    errors.push("verdict must be one of: " + VERDICT_ENUM.join(", "));
  }
  if (typeof verdict.winning_position !== "string" || !verdict.winning_position) {
    errors.push("winning_position must be a non-empty string");
  }
  if (typeof verdict.basis !== "string" || !verdict.basis) {
    errors.push("basis must be a non-empty string");
  }

  if (!Array.isArray(verdict.debate_log)) {
    errors.push("debate_log must be an array");
  } else {
    verdict.debate_log.forEach(function(entry, i) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push("debate_log[" + i + "] must be a plain object"); return;
      }
      if (typeof entry.round !== "number" ||
          !Number.isInteger(entry.round) ||
          entry.round < 0) {
        errors.push("debate_log[" + i + "].round must be a non-negative integer");
      }
      if (typeof entry.speaker !== "string" || !entry.speaker) {
        errors.push("debate_log[" + i + "].speaker must be a non-empty string");
      }
      if (typeof entry.content !== "string") {
        errors.push("debate_log[" + i + "].content must be a string");
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _getInvoker(ctx) {
  if (ctx && typeof ctx.role_invoker === "function") {
    return ctx.role_invoker;
  }
  return async function(role_id, input, roleCtx) {
    const reg = getDefaultRegistry();
    return await reg.invoke("role.invoke", { role_id, input }, roleCtx || ctx || {});
  };
}

function _summariseOutput(roleOutput) {
  if (!roleOutput || !roleOutput.output) return "(no output)";
  const out      = roleOutput.output;
  const blockers = Array.isArray(out.findings)
    ? out.findings.filter(function(f) { return f && f.severity === "BLOCKER"; })
    : [];
  if (blockers.length === 0) {
    return "No BLOCKER findings. " + (out.summary || "");
  }
  const issues = blockers
    .map(function(f) { return f.location + ": " + (f.issue || f.vulnerability || "BLOCKER"); })
    .join("; ");
  return "BLOCKER findings: " + issues + ". " + (out.summary || "");
}

function _summariseQualityJudge(qjResult) {
  if (!qjResult || !qjResult.output) return "(no quality_judge output)";
  const out = qjResult.output;
  return "Verdict: " + (out.verdict || "?") + ". " + (out.summary || "");
}

function _buildWinningPosition(reviewerOutput, securityOutput, qjResult) {
  if (qjResult) {
    const qjOut = qjResult.output || {};
    return qjOut.summary || "Quality Judge arbitrated. See debate_log for details.";
  }
  const rSum = (reviewerOutput.output && reviewerOutput.output.summary) || "";
  const sSum = (securityOutput.output && securityOutput.output.summary) || "";
  const base = "Agreed: no unresolved BLOCKER findings.";
  return (rSum || sSum) ? base + " Reviewer: " + rSum + " | Security Auditor: " + sSum : base;
}

function _assertValid(result) {
  const v = validateDebateVerdict(result);
  if (!v.valid) {
    throw new Error("runDebate produced invalid DebateVerdict: " + v.errors.join("; "));
  }
}

// ── runDebate ─────────────────────────────────────────────────────────────────
// async (reviewerOutput, securityOutput, ctx) → DebateVerdict
//
// reviewerOutput: full role.invoke result envelope from reviewer role
// securityOutput: full role.invoke result envelope from security_auditor role
// ctx: passed to all invokeRole calls; may contain:
//   - ctx.project_id  (used in quality_judge arbitration input)
//   - ctx.spec / ctx.design (passed to COUNTER + ARBITRATE role inputs)
//   - ctx.role_invoker  (test injection — see convention block at top)

async function runDebate(reviewerOutput, securityOutput, ctx) {
  const invokeRole = _getInvoker(ctx);
  const debateLog  = [];

  // ── PROPOSE state ──────────────────────────────────────────────────────────
  debateLog.push({ round: 0, speaker: "reviewer",         content: _summariseOutput(reviewerOutput) });
  debateLog.push({ round: 0, speaker: "security_auditor", content: _summariseOutput(securityOutput) });

  if (_blockersAgree(reviewerOutput, securityOutput)) {
    const result = {
      verdict:          "AGREE",
      winning_position: _buildWinningPosition(reviewerOutput, securityOutput, null),
      basis:            "Both debaters agreed at PROPOSE: no BLOCKER location disagreement.",
      debate_log:       debateLog
    };
    _assertValid(result);
    return result;
  }

  // ── COUNTER state ──────────────────────────────────────────────────────────
  let currentReviewer = reviewerOutput;
  let currentSecurity = securityOutput;

  for (var round = 1; round <= MAX_COUNTER_ROUNDS; round++) {
    const counterCtx = Object.assign({}, ctx || {}, { debate_round: round });

    const revInput = {
      project_id: (ctx && ctx.project_id) || "debate",
      phase:      "B",
      spec:       (ctx && ctx.spec)   || {},
      design:     (ctx && ctx.design) || {},
      code:       { debate_counter: round, opponent_findings: currentSecurity.output }
    };
    const newReviewer = await invokeRole("reviewer", revInput, counterCtx);
    if (!newReviewer || newReviewer.status !== "SUCCESS") {
      throw new Error("runDebate: reviewer failed in COUNTER round " + round);
    }

    const secInput = {
      project_id: (ctx && ctx.project_id) || "debate",
      phase:      "CODE",
      spec:       (ctx && ctx.spec)   || {},
      design:     (ctx && ctx.design) || {},
      code:       { debate_counter: round, opponent_findings: currentReviewer.output }
    };
    const newSecurity = await invokeRole("security_auditor", secInput, counterCtx);
    if (!newSecurity || newSecurity.status !== "SUCCESS") {
      throw new Error("runDebate: security_auditor failed in COUNTER round " + round);
    }

    debateLog.push({ round: round, speaker: "reviewer",         content: _summariseOutput(newReviewer) });
    debateLog.push({ round: round, speaker: "security_auditor", content: _summariseOutput(newSecurity) });

    currentReviewer = newReviewer;
    currentSecurity = newSecurity;

    if (_blockersAgree(currentReviewer, currentSecurity)) {
      const result = {
        verdict:          "AGREE",
        winning_position: _buildWinningPosition(currentReviewer, currentSecurity, null),
        basis:            "Debaters reached BLOCKER agreement in COUNTER round " + round + ".",
        debate_log:       debateLog
      };
      _assertValid(result);
      return result;
    }
  }

  // ── ARBITRATE state ────────────────────────────────────────────────────────
  const arbitrationInput = {
    project_id:     (ctx && ctx.project_id) || "debate",
    spec:           (ctx && ctx.spec)   || {},
    design:         (ctx && ctx.design) || {},
    security_audit: currentSecurity.output || {},
    debate_context: {
      reviewer_position: currentReviewer.output,
      security_position: currentSecurity.output,
      rounds_completed:  MAX_COUNTER_ROUNDS
    }
  };
  const qjResult = await invokeRole("quality_judge", arbitrationInput, ctx || {});
  if (!qjResult || qjResult.status !== "SUCCESS") {
    throw new Error("runDebate: quality_judge arbitration failed");
  }

  debateLog.push({
    round:   MAX_COUNTER_ROUNDS + 1,
    speaker: "quality_judge",
    content: _summariseQualityJudge(qjResult)
  });

  // ── RESOLVED state ─────────────────────────────────────────────────────────
  const result = {
    verdict:          "ARBITRATED",
    winning_position: _buildWinningPosition(currentReviewer, currentSecurity, qjResult),
    basis:            "Quality Judge arbitrated after " + MAX_COUNTER_ROUNDS +
                      " COUNTER rounds without BLOCKER agreement.",
    debate_log:       debateLog
  };
  _assertValid(result);
  return result;
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  DEBATE_STATES,
  VERDICT_ENUM,
  MAX_COUNTER_ROUNDS,
  runDebate,
  validateDebateVerdict
};
