const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { executeCognitive } = require("../cognitive/cognitive_adapter");

function ensureDir(abs) {
  fs.mkdirSync(abs, { recursive: true });
}

function readJson(absPath) {
  const raw = fs.readFileSync(absPath, "utf-8");
  return JSON.parse(raw);
}

function writeJson(absPath, obj) {
  fs.writeFileSync(absPath, JSON.stringify(obj, null, 2), "utf-8");
}

function writeText(absPath, text) {
  fs.writeFileSync(absPath, String(text || ""), "utf-8");
}

function rmDirIfExists(abs) {
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  if (!st.isDirectory()) return;
  fs.rmSync(abs, { recursive: true, force: true });
}

function stableHash(s) {
  return crypto.createHash("sha256").update(String(s || "")).digest("hex").slice(0, 12);
}

function normalizeList(arr) {
  const a = Array.isArray(arr) ? arr.map((x) => String(x)) : [];
  return Array.from(new Set(a)).sort();
}

function makeGapId(category, affectedEntities) {
  const key = `${String(category)}|${normalizeList(affectedEntities).join(",")}`;
  return `GAP-${stableHash(key)}`;
}

function severityForCategory(category) {
  const c = String(category || "");
  if (c === "GOVERNANCE_MISMATCH") return "CRITICAL";
  if (c === "EXECUTION_STATE_INCONSISTENCY") return "CRITICAL";
  if (c === "STRUCTURAL_DRIFT") return "HIGH";
  if (c === "UNIMPLEMENTED_REQUIREMENT") return "HIGH";
  if (c === "ORPHAN_CODE") return "MEDIUM";
  if (c === "ORPHAN_ARTIFACT") return "LOW";
  if (c === "PARTIAL_COVERAGE") return "MEDIUM";
  return "LOW";
}

function actionIdForGap(gapId, desc) {
  return `ACT-${stableHash(`${gapId}|${String(desc || "")}`)}`;
}

function writeGapError(rootAbs, msg) {
  const gapDirAbs = path.resolve(rootAbs, "artifacts", "gap");
  ensureDir(gapDirAbs);
  const errAbs = path.resolve(gapDirAbs, "gap_error.md");
  const md = ["# Gap Error", "", String(msg || "").trim(), ""].join("\n");
  writeText(errAbs, md);
  return "artifacts/gap/gap_error.md";
}

function renderGapReport(payload) {
  const lines = [];
  lines.push("# Gap Report");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- total_gaps: ${payload.total_gaps}`);
  lines.push(`- critical_count: ${payload.critical_count}`);
  lines.push(`- requires_decision: ${payload.requires_decision}`);
  lines.push("");
  lines.push("## Gaps");
  if (!payload.gaps || payload.gaps.length === 0) {
    lines.push("- None");
    lines.push("");
    return lines.join("\n");
  }
  for (const g of payload.gaps) {
    lines.push(`- **${g.severity}** [${g.category}] ${g.gap_id}`);
    lines.push(`  - affected_entities: ${Array.isArray(g.affected_entities) ? g.affected_entities.join(", ") : ""}`);
    lines.push(`  - root_cause: ${g.root_cause}`);
    if (Array.isArray(g.recommended_actions) && g.recommended_actions.length > 0) {
      lines.push(`  - actions:`);
      for (const a of g.recommended_actions) {
        lines.push(`    - ${a.action_id}: ${a.description} (requires_decision=${a.requires_decision})`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

function findDuplicateValues(values) {
  const seen = new Set();
  const dup = new Set();

  for (const value of values) {
    const key = String(value || "");
    if (seen.has(key)) dup.add(key);
    else seen.add(key);
  }

  return Array.from(dup).sort();
}

function buildGapsFromTrace(trace) {
  const gaps = [];

  const orphanReq = normalizeList(trace && trace.orphan_requirements);
  for (const r of orphanReq) {
    const affected = [r];
    const category = "UNIMPLEMENTED_REQUIREMENT";
    const severity = severityForCategory(category);
    const gapId = makeGapId(category, affected);
    const desc = `Implement requirement ${r} by adding missing code unit(s) and required artifact(s).`;
    const action = {
      action_id: actionIdForGap(gapId, desc),
      description: desc,
      impact_scope: "docs/code/artifacts",
      cognitive_priority_hint: null,
      requires_decision: false
    };
    gaps.push({
      gap_id: gapId,
      category,
      severity,
      affected_entities: affected,
      root_cause: "Requirement appears in docs but has no mapped code/artifact coverage per trace_matrix.json.",
      recommended_actions: [action]
    });
  }

  const orphanCode = normalizeList(trace && trace.orphan_code_units);
  for (const u of orphanCode) {
    const raw = String(u || "");
    const parts = raw.split("::");
    const codePath = parts.length >= 2 ? parts[1] : raw;

    const affected = [codePath];
    const category = "ORPHAN_CODE";
    const severity = severityForCategory(category);
    const gapId = makeGapId(category, affected);

    const desc1 = `Map code unit ${u} to an existing requirement by adding deterministic mapping rules in Trace (if valid).`;
    const desc2 = `Remove or relocate code unit ${u} if it is not part of Forge scope/contracts.`;

    const action1 = {
      action_id: actionIdForGap(gapId, desc1),
      description: desc1,
      impact_scope: "code/trace",
      cognitive_priority_hint: null,
      requires_decision: true
    };
    const action2 = {
      action_id: actionIdForGap(gapId, desc2),
      description: desc2,
      impact_scope: "code",
      cognitive_priority_hint: null,
      requires_decision: true
    };

    gaps.push({
      gap_id: gapId,
      category,
      severity,
      affected_entities: affected,
      root_cause: "Code unit is exported/detected but not mapped to any requirement by trace rules.",
      recommended_actions: [action1, action2]
    });
  }

  const orphanArtifacts = normalizeList(trace && trace.orphan_artifacts);
  for (const a of orphanArtifacts) {
    const affected = [a];
    const category = "ORPHAN_ARTIFACT";
    const severity = severityForCategory(category);
    const gapId = makeGapId(category, affected);
    const desc = `Either map artifact ${a} to a requirement (if valid) or remove it if it violates namespace/scope rules.`;
    const action = {
      action_id: actionIdForGap(gapId, desc),
      description: desc,
      impact_scope: "artifacts/trace",
      cognitive_priority_hint: null,
      requires_decision: true
    };
    gaps.push({
      gap_id: gapId,
      category,
      severity,
      affected_entities: affected,
      root_cause: "Artifact exists in repository but is not mapped to any covered requirement per trace.",
      recommended_actions: [action]
    });
  }

  const mappings = Array.isArray(trace && trace.mappings) ? trace.mappings : [];
  for (const m of mappings) {
    if (!m || String(m.coverage_status || "") !== "PARTIAL") continue;
    const reqId = String(m.requirement_id || "");
    if (!reqId) continue;

    const affected = [reqId];
    const category = "PARTIAL_COVERAGE";
    const severity = severityForCategory(category);
    const gapId = makeGapId(category, affected);

    const desc = `Complete coverage for ${reqId} by ensuring both mapped_code_units and mapped_artifacts are present.`;
    const action = {
      action_id: actionIdForGap(gapId, desc),
      description: desc,
      impact_scope: "docs/code/artifacts",
      cognitive_priority_hint: null,
      requires_decision: false
    };

    gaps.push({
      gap_id: gapId,
      category,
      severity,
      affected_entities: affected,
      root_cause: "Trace shows only code or only artifacts mapped for this requirement (coverage_status=PARTIAL).",
      recommended_actions: [action]
    });
  }

  gaps.sort((a, b) => (a.gap_id < b.gap_id ? -1 : a.gap_id > b.gap_id ? 1 : 0));

  for (const g of gaps) {
    if (Array.isArray(g.recommended_actions)) {
      g.recommended_actions.sort((x, y) => (x.action_id < y.action_id ? -1 : x.action_id > y.action_id ? 1 : 0));
    }
  }

  return gaps;
}

async function runCognitiveGapAnalysis(context) {
  const request = {
    request_id: `GAP-${Date.now()}`,
    timestamp: new Date().toISOString(),
    task_context: {
      task_id: "TASK-051",
      module: "GAP"
    },
    input: {
      type: "structured",
      content: context
    },
    constraints: {
      deterministic: true,
      max_tokens: 1000,
      temperature: 0
    }
  };

  return await executeCognitive(request, () => {
    return {
      priority_hints: []
    };
  });
}

async function runGap(context) {
  const rootAbs = path.resolve(__dirname, "../../..");

  const traceJsonAbs = path.resolve(rootAbs, "artifacts", "trace", "trace_matrix.json");
  const intakeContextAbs = path.resolve(rootAbs, "artifacts", "intake", "intake_context.json");
  const auditFindingsAbs = path.resolve(rootAbs, "artifacts", "audit", "audit_findings.json");

  if (!fs.existsSync(traceJsonAbs)) {
    const errRef = writeGapError(rootAbs, "BLOCKED: missing required artifact artifacts/trace/trace_matrix.json");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Gap BLOCKED: missing trace_matrix.json"],
        next_step: ""
      }
    };
  }

  if (!fs.existsSync(intakeContextAbs)) {
    const errRef = writeGapError(rootAbs, "BLOCKED: missing required artifact artifacts/intake/intake_context.json");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Gap BLOCKED: missing intake_context.json"],
        next_step: ""
      }
    };
  }

  if (!fs.existsSync(auditFindingsAbs)) {
    const errRef = writeGapError(rootAbs, "BLOCKED: missing required artifact artifacts/audit/audit_findings.json");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Gap BLOCKED: missing audit_findings.json"],
        next_step: ""
      }
    };
  }

  rmDirIfExists(path.resolve(rootAbs, "artifacts", "decisions"));
  rmDirIfExists(path.resolve(rootAbs, "artifacts", "backfill"));
  rmDirIfExists(path.resolve(rootAbs, "artifacts", "execute"));
  rmDirIfExists(path.resolve(rootAbs, "artifacts", "closure"));

  const trace = readJson(traceJsonAbs);
  const intakeContext = readJson(intakeContextAbs);
  const audit = readJson(auditFindingsAbs);

  if (audit && audit.blocked === true) {
    const errRef = writeGapError(rootAbs, "BLOCKED: audit_findings.blocked == true");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Gap BLOCKED: audit blocked == true"],
        next_step: ""
      }
    };
  }

  const validOperatingMode =
    intakeContext &&
    (intakeContext.operating_mode === "BUILD" || intakeContext.operating_mode === "IMPROVE") &&
    intakeContext.blocked === false;

  if (!validOperatingMode) {
    const errRef = writeGapError(rootAbs, "BLOCKED: intake_context operating_mode invalid or intake still blocked");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Gap BLOCKED: intake_context invalid or blocked"],
        next_step: ""
      }
    };
  }

  const traceModeMatches =
    trace &&
    trace.operating_mode === intakeContext.operating_mode &&
    trace.repository_state === intakeContext.repository_state;

  if (!traceModeMatches) {
    const errRef = writeGapError(rootAbs, "BLOCKED: trace_matrix mode/repository_state mismatch vs intake_context");
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Gap BLOCKED: trace_matrix does not match intake_context"],
        next_step: ""
      }
    };
  }

  const gaps = buildGapsFromTrace(trace);

  let cognitiveResult = null;

  try {
    cognitiveResult = await runCognitiveGapAnalysis({
      gap_count: gaps.length
    });
  } catch (err) {
    cognitiveResult = {
      error: err.message
    };
  }

  const duplicateGapIds = findDuplicateValues(gaps.map((g) => g.gap_id));

  if (duplicateGapIds.length > 0) {
    const errRef = writeGapError(rootAbs, `BLOCKED: duplicate gap_id detected: ${duplicateGapIds.join(", ")}`);
    return {
      blocked: true,
      artifact: errRef,
      status_patch: {
        blocking_questions: ["Gap BLOCKED: duplicate gap_id detected"],
        next_step: ""
      }
    };
  }

  let requiresDecision = false;
  let criticalCount = 0;

  for (const g of gaps) {
    if (g.severity === "CRITICAL") criticalCount += 1;
    if (Array.isArray(g.recommended_actions) && g.recommended_actions.some((a) => a && a.requires_decision === true)) {
      requiresDecision = true;
    }
  }

  if (criticalCount > 0) requiresDecision = true;

  const payload = {
    execution_id: `GAP-${new Date().toISOString()}`,
    total_gaps: gaps.length,
    critical_count: criticalCount,
    requires_decision: requiresDecision,
    cognitive_analysis: cognitiveResult,
    gaps
  };

  const gapDirAbs = path.resolve(rootAbs, "artifacts", "gap");
  ensureDir(gapDirAbs);

  writeJson(path.resolve(gapDirAbs, "gap_actions.json"), payload);
  writeText(path.resolve(gapDirAbs, "gap_report.md"), renderGapReport(payload));

  const isBlocked = criticalCount > 0;

  return {
    blocked: isBlocked,
    artifact: "artifacts/gap/gap_report.md",
    outputs: {
      md: "artifacts/gap/gap_report.md",
      json: "artifacts/gap/gap_actions.json"
    },
    status_patch: isBlocked
      ? {
          blocking_questions: ["Decision required: review artifacts/gap/gap_actions.json and proceed via Decision Gate."],
          next_step: ""
        }
      : {
          blocking_questions: [],
          next_step: "MODULE_FLOW — Gap COMPLETE. Next=Decision Gate (implement decisionGate + task bridge)."
        }
  };
}

module.exports = {
  runGap
};