const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../../..");

function readJson(absPath) {
  const raw = fs.readFileSync(absPath, { encoding: "utf8" });
  return JSON.parse(raw);
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function parseDecisionOverride() {
  const envValue = String(process.env.FORGE_DECISION_OVERRIDE || "").trim();
  const normalized = envValue.toUpperCase();

  if (normalized === "APPROVE ALL" || normalized === "APPROVE_ALL") {
    return {
      mode: "APPROVE_ALL",
      source: "ENV",
      raw: envValue
    };
  }

  if (normalized === "REJECT") {
    return {
      mode: "REJECT",
      source: "ENV",
      raw: envValue
    };
  }

  return {
    mode: "UNSPECIFIED",
    source: envValue === "" ? "NONE" : "ENV",
    raw: envValue
  };
}

function classifyActionRisk({ action, gap, intakeContext }) {
  const description = String(action && action.description ? action.description : "").toLowerCase();
  const impactScope = String(action && action.impact_scope ? action.impact_scope : "").toLowerCase();
  const category = String(gap && gap.category ? gap.category : "").toUpperCase();
  const severity = String(gap && gap.severity ? gap.severity : "").toUpperCase();
  const operatingMode = String(intakeContext && intakeContext.operating_mode ? intakeContext.operating_mode : "").toUpperCase();

  const destructivePattern =
    /\b(remove|delete|relocate|rewrite|replace|destructive|irreversible|bypass|contract|governance|architecture|refactor)\b/;

  const hardReviewCategories = new Set([
    "GOVERNANCE_MISMATCH",
    "EXECUTION_STATE_INCONSISTENCY",
    "STRUCTURAL_DRIFT",
    "ORPHAN_CODE"
  ]);

  if (severity === "CRITICAL") {
    return {
      decision: "REVIEW",
      reason: "critical severity gap"
    };
  }

  if (action && action.requires_decision === true) {
    return {
      decision: "REVIEW",
      reason: "action explicitly marked requires_decision"
    };
  }

  if (hardReviewCategories.has(category)) {
    return {
      decision: "REVIEW",
      reason: `category ${category} requires explicit review`
    };
  }

  if (destructivePattern.test(description) || destructivePattern.test(impactScope)) {
    return {
      decision: "REVIEW",
      reason: "destructive or structural wording detected"
    };
  }

  if (operatingMode === "BUILD") {
    return {
      decision: "APPROVE",
      reason: "build mode clear bounded action"
    };
  }

  if (operatingMode === "IMPROVE") {
    if (category === "UNIMPLEMENTED_REQUIREMENT" || category === "ORPHAN_ARTIFACT" || category === "PARTIAL_COVERAGE") {
      return {
        decision: "APPROVE",
        reason: "improve mode bounded non-destructive remediation"
      };
    }
  }

  return {
    decision: "APPROVE",
    reason: "clear bounded low-risk action"
  };
}

function flattenGapActions(gapPayload) {
  if (gapPayload && Array.isArray(gapPayload.items)) {
    return gapPayload.items.map((item) => ({
      gap_id: String(item && item.gap_id ? item.gap_id : ""),
      category: String(item && item.category ? item.category : ""),
      severity: String(item && item.severity ? item.severity : ""),
      affected_entities: Array.isArray(item && item.affected_entities)
        ? item.affected_entities.map((x) => String(x))
        : [],
      action_id: String(item && item.action_id ? item.action_id : ""),
      description: String(item && item.description ? item.description : ""),
      impact_scope: String(item && item.impact_scope ? item.impact_scope : ""),
      requires_decision: !!(item && item.requires_decision === true),
      _gap: item,
      _action: item
    }));
  }

  if (gapPayload && Array.isArray(gapPayload.actions)) {
    return gapPayload.actions.map((action) => ({
      gap_id: "",
      category: "UNIMPLEMENTED_REQUIREMENT",
      severity: "LOW",
      affected_entities: [],
      action_id: String(action && action.id ? action.id : ""),
      description: String(action && action.description ? action.description : ""),
      impact_scope: String(action && action.impact ? action.impact : ""),
      requires_decision: false,
      _gap: {},
      _action: action
    }));
  }

  const rows = [];
  const gaps = Array.isArray(gapPayload && gapPayload.gaps) ? gapPayload.gaps : [];

  for (const gap of gaps) {
    const recommended = Array.isArray(gap && gap.recommended_actions) ? gap.recommended_actions : [];
    for (const action of recommended) {
      rows.push({
        gap_id: String(gap.gap_id || ""),
        category: String(gap.category || ""),
        severity: String(gap.severity || ""),
        affected_entities: Array.isArray(gap.affected_entities) ? gap.affected_entities.map((x) => String(x)) : [],
        action_id: String(action && action.action_id ? action.action_id : ""),
        description: String(action && action.description ? action.description : ""),
        impact_scope: String(action && action.impact_scope ? action.impact_scope : ""),
        requires_decision: !!(action && action.requires_decision === true),
        _gap: gap,
        _action: action
      });
    }
  }

  return rows;
}

function normalizeCognitivePriorityHint(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  if (value < 0 || value > 1) {
    return null;
  }

  return Number(value.toFixed(4));
}

function readTraceCognitivePayload() {
  const traceMatrixAbs = path.resolve(ROOT, "artifacts", "trace", "trace_matrix.json");

  if (!fs.existsSync(traceMatrixAbs)) {
    return null;
  }

  const tracePayload = readJson(traceMatrixAbs);

  if (!tracePayload || typeof tracePayload !== "object") {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(tracePayload, "cognitive_trace")) {
    return null;
  }

  return tracePayload.cognitive_trace;
}

function resolveCognitivePriorityHint(row, cognitiveTrace) {
  if (!cognitiveTrace || typeof cognitiveTrace !== "object") {
    return null;
  }

  const output =
    cognitiveTrace.output &&
    typeof cognitiveTrace.output === "object" &&
    Object.prototype.hasOwnProperty.call(cognitiveTrace.output, "content")
      ? cognitiveTrace.output.content
      : null;

  if (!output || typeof output !== "object") {
    return null;
  }

  const directMatches = Array.isArray(output.priority_hints) ? output.priority_hints : [];

  for (const item of directMatches) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const actionId = typeof item.action_id === "string" ? item.action_id : "";
    const gapId = typeof item.gap_id === "string" ? item.gap_id : "";

    if ((actionId && actionId === row.action_id) || (gapId && gapId === row.gap_id)) {
      return normalizeCognitivePriorityHint(item.score);
    }
  }

  return null;
}

function normalizeProjectId(projectIdInput) {
  return typeof projectIdInput === "string" && projectIdInput.trim() !== ""
    ? projectIdInput.trim()
    : "default_project";
}

function getProjectExecutionPackageRel(projectIdInput) {
  return `artifacts/projects/${normalizeProjectId(projectIdInput)}/execute/execution_package.json`;
}

function getProjectExecutionPackageAbs(projectIdInput) {
  return path.resolve(ROOT, getProjectExecutionPackageRel(projectIdInput));
}

function readExecutionPackageBundle(projectIdInput) {
  const projectId = normalizeProjectId(projectIdInput);
  const packageRel = getProjectExecutionPackageRel(projectId);
  const packageAbs = getProjectExecutionPackageAbs(projectId);

  if (!fs.existsSync(packageAbs)) {
    return null;
  }

  const executionPackage = readJson(packageAbs);

  if (!executionPackage || typeof executionPackage !== "object") {
    return null;
  }

  if (String(executionPackage.source || "") !== "EXTERNAL_AI_WORKSPACE") {
    return null;
  }

  if (String(executionPackage.handoff_status || "").trim() !== "APPROVED_PENDING_FORGE") {
    return null;
  }

  const proposedFiles =
    executionPackage &&
    executionPackage.execution_plan &&
    Array.isArray(executionPackage.execution_plan.proposed_files)
      ? executionPackage.execution_plan.proposed_files
      : [];

  if (proposedFiles.length === 0) {
    return null;
  }

  const executionId = String(executionPackage.execution_id || "").trim();

  if (!executionId) {
    return null;
  }

  const responseRel = `artifacts/llm/responses/${executionId}.response.json`;
  const responseAbs = path.resolve(ROOT, responseRel);

  return {
    executionPackage,
    packageRel,
    packageAbs,
    packageText: JSON.stringify(executionPackage, null, 2),
    responseRel,
    responseAbs
  };
}

function flattenExecutionPackageActions(bundle) {
  const files =
    bundle &&
    bundle.executionPackage &&
    bundle.executionPackage.execution_plan &&
    Array.isArray(bundle.executionPackage.execution_plan.proposed_files)
      ? bundle.executionPackage.execution_plan.proposed_files
      : [];

  return files
    .map((file, index) => ({
      gap_id: "WORKSPACE_CHANGE_REQUEST",
      category: "WORKSPACE_CHANGE_REQUEST",
      severity: "MEDIUM",
      affected_entities: [String(file && file.path ? file.path : "")],
      action_id: `WORKSPACE_ACTION_${index + 1}`,
      description: `Apply governed workspace execution package to ${String(file && file.path ? file.path : "")}`,
      impact_scope: "CODE_WRITE",
      requires_decision: false,
      _gap: {},
      _action: file,
      _workspace: {
        response_path: bundle.responseRel,
        allow_overwrite: !!(file && file.allow_overwrite === true),
        expected_sha256: String(file && file.sha256 ? file.sha256 : ""),
        target_path: String(file && file.path ? file.path : "")
      }
    }))
    .filter((row) => row.affected_entities[0] && row.action_id);
}

function renderDecisionMd(payload) {
  const lines = [];

  lines.push("# MODULE FLOW — Decision Gate");
  lines.push("");
  lines.push(`- timestamp: ${payload.timestamp}`);
  lines.push(`- policy: ${payload.policy}`);
  lines.push(`- operating_mode: ${payload.operating_mode}`);
  lines.push(`- repository_state: ${payload.repository_state}`);
  lines.push(`- blocked: ${payload.blocked ? "true" : "false"}`);
  lines.push("");
  lines.push("## Source");

  if (payload.source && payload.source.source_type === "EXECUTION_PACKAGE") {
    lines.push(`- source_type: EXECUTION_PACKAGE`);
    lines.push(`- execution_package_path: ${payload.source.execution_package_path}`);
    lines.push(`- execution_package_id: ${payload.source.execution_package_id}`);
    lines.push(`- execution_package_execution_id: ${payload.source.execution_package_execution_id}`);
    lines.push(`- execution_package_sha256: ${payload.source.execution_package_sha256}`);
    lines.push(`- workspace_response_path: ${payload.source.workspace_response_path}`);
    lines.push(`- intake_context_path: ${payload.source.intake_context_path}`);
    lines.push(`- intake_context_sha256: ${payload.source.intake_context_sha256}`);
  } else {
    lines.push(`- exploration_matrix_path: ${payload.source.exploration_matrix_path}`);
    lines.push(`- exploration_matrix_sha256: ${payload.source.exploration_matrix_sha256}`);
    lines.push(`- intake_context_path: ${payload.source.intake_context_path}`);
    lines.push(`- intake_context_sha256: ${payload.source.intake_context_sha256}`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push(`- total_actions: ${payload.summary.total_actions}`);
  lines.push(`- approved_count: ${payload.summary.approved_count}`);
  lines.push(`- review_required_count: ${payload.summary.review_required_count}`);
  lines.push(`- rejected_count: ${payload.summary.rejected_count}`);
  lines.push("");

  lines.push("## Approved Actions");
  if (payload.approved_actions.length === 0) {
    lines.push("- None");
  } else {
    for (const row of payload.approved_actions) {
      lines.push(`- ${row.action_id} [${row.category}/${row.severity}] ${row.description}`);
      lines.push(`  - reason: ${row.reason}`);
      if (row.cognitive_priority_hint !== null) {
        lines.push(`  - cognitive_priority_hint: ${row.cognitive_priority_hint}`);
      }
    }
  }
  lines.push("");

  lines.push("## Review Required");
  if (payload.review_required_actions.length === 0) {
    lines.push("- None");
  } else {
    for (const row of payload.review_required_actions) {
      lines.push(`- ${row.action_id} [${row.category}/${row.severity}] ${row.description}`);
      lines.push(`  - reason: ${row.reason}`);
      if (row.cognitive_priority_hint !== null) {
        lines.push(`  - cognitive_priority_hint: ${row.cognitive_priority_hint}`);
      }
    }
  }
  lines.push("");

  lines.push("## Rejected Actions");
  if (payload.rejected_actions.length === 0) {
    lines.push("- None");
  } else {
    for (const row of payload.rejected_actions) {
      lines.push(`- ${row.action_id} [${row.category}/${row.severity}] ${row.description}`);
      lines.push(`  - reason: ${row.reason}`);
      if (row.cognitive_priority_hint !== null) {
        lines.push(`  - cognitive_priority_hint: ${row.cognitive_priority_hint}`);
      }
    }
  }
  lines.push("");

  lines.push("## Next");
  if (payload.rejected_actions.length > 0) {
    lines.push("- next_step: IDLE — Decision Gate REJECTED");
  } else if (payload.blocked) {
    lines.push("- next_step: BLOCKED pending explicit decision override");
  } else {
    lines.push("- next_step: MODULE_FLOW — Decision Gate COMPLETE. Next=Backfill (implement backfillEngine + task bridge).");
  }
  lines.push("");

  return lines.join("\n");
}

function runDecisionGate(context) {
  const explorationMatrixAbs = path.resolve(ROOT, "artifacts", "exploration", "option_matrix.json");
  const intakeContextAbs = path.resolve(ROOT, "artifacts", "intake", "intake_context.json");
  const projectId = normalizeProjectId(
    context && typeof context.project_id === "string" ? context.project_id : ""
  );
  const workspaceBundle = readExecutionPackageBundle(projectId);

  if (!workspaceBundle && !fs.existsSync(explorationMatrixAbs)) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: [
          "Decision Gate BLOCKED: artifacts/exploration/option_matrix.json missing. Run Design Exploration first."
        ]
      }
    };
  }

  if (!fs.existsSync(intakeContextAbs)) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: [
          "Decision Gate BLOCKED: artifacts/intake/intake_context.json missing. Run Intake first."
        ]
      }
    };
  }

  if (workspaceBundle && !fs.existsSync(workspaceBundle.responseAbs)) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: [
          `Decision Gate BLOCKED: missing ${workspaceBundle.responseRel}`
        ]
      }
    };
  }

  const decision = parseDecisionOverride();
  const intakeContext = readJson(intakeContextAbs);
  const traceCognitivePayload = readTraceCognitivePayload();

  const validOperatingMode =
    intakeContext &&
    (intakeContext.operating_mode === "BUILD" || intakeContext.operating_mode === "IMPROVE") &&
    intakeContext.blocked === false;

  if (!validOperatingMode) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: [
          "Decision Gate BLOCKED: intake_context operating_mode invalid or intake still blocked."
        ]
      }
    };
  }

  const decisionsDirAbs = path.resolve(ROOT, "artifacts", "decisions");
  ensureDir(decisionsDirAbs);

  const relDecisionJson = "artifacts/decisions/module_flow_decision_gate.json";
  const relDecisionMd = "artifacts/decisions/module_flow_decision_gate.md";

  const decisionJsonAbs = path.resolve(ROOT, relDecisionJson);
  const decisionMdAbs = path.resolve(ROOT, relDecisionMd);

  if (workspaceBundle) {
    const flatActions = flattenExecutionPackageActions(workspaceBundle);
    const intakeText = JSON.stringify(intakeContext, null, 2);
    const stamp = new Date().toISOString();

    const approvedActions = flatActions.map((row) => ({
      gap_id: row.gap_id,
      category: row.category,
      severity: row.severity,
      affected_entities: row.affected_entities,
      action_id: row.action_id,
      description: row.description,
      impact_scope: row.impact_scope,
      requires_decision: false,
      cognitive_priority_hint: resolveCognitivePriorityHint(row, traceCognitivePayload),
      reason: "governed workspace decision packet approved",
      workspace_source: "EXTERNAL_AI_WORKSPACE",
      workspace_execution_id: String(workspaceBundle.executionPackage.execution_id || ""),
      workspace_execution_package_id: String(workspaceBundle.executionPackage.package_id || ""),
      workspace_execution_package_path: workspaceBundle.packageRel,
      workspace_response_path: row._workspace.response_path,
      workspace_allow_overwrite: row._workspace.allow_overwrite,
      workspace_expected_sha256: row._workspace.expected_sha256,
      workspace_target_path: row._workspace.target_path
    }));

    const decisionPayload = {
      decision_id: "MODULE_FLOW_DECISION_GATE",
      timestamp: stamp,
      task: "TASK-052",
      policy: "AUTONOMOUS_BY_DEFAULT_FAIL_CLOSED_ON_RISK",
      operating_mode: intakeContext.operating_mode,
      repository_state: intakeContext.repository_state,
      override_mode: decision.mode,
      override_source: decision.source,
      override_raw: decision.raw,
      source: {
        source_type: "EXECUTION_PACKAGE",
        execution_package_path: workspaceBundle.packageRel,
        execution_package_id: String(workspaceBundle.executionPackage.package_id || ""),
        execution_package_execution_id: String(workspaceBundle.executionPackage.execution_id || ""),
        execution_package_sha256: sha256Text(workspaceBundle.packageText),
        workspace_response_path: workspaceBundle.responseRel,
        intake_context_path: "artifacts/intake/intake_context.json",
        intake_context_sha256: sha256Text(intakeText)
      },
      summary: {
        total_actions: approvedActions.length,
        approved_count: approvedActions.length,
        review_required_count: 0,
        rejected_count: 0
      },
      approved_actions: approvedActions,
      review_required_actions: [],
      rejected_actions: [],
      blocked: false
    };

    fs.writeFileSync(decisionJsonAbs, JSON.stringify(decisionPayload, null, 2), { encoding: "utf8" });
    fs.writeFileSync(decisionMdAbs, renderDecisionMd(decisionPayload), { encoding: "utf8" });

    return {
      stage_progress_percent: 100,
      artifact: relDecisionMd,
      outputs: { md: relDecisionMd, json: relDecisionJson },
      blocked: false,
      status_patch: {
        blocking_questions: [],
        next_step: "MODULE FLOW — Decision Gate COMPLETE. Next=Backfill."
      }
    };
  }

  const actionsObj = readJson(explorationMatrixAbs);
  const flatActions = flattenGapActions(actionsObj);

  if (flatActions.length === 0) {
    const intakeText = JSON.stringify(intakeContext, null, 2);
    const stamp = new Date().toISOString();

    const decisionPayload = {
      decision_id: "MODULE_FLOW_DECISION_GATE",
      timestamp: stamp,
      task: "TASK-052",
      policy: "AUTONOMOUS_BY_DEFAULT_FAIL_CLOSED_ON_RISK",
      operating_mode: intakeContext.operating_mode,
      repository_state: intakeContext.repository_state,
      override_mode: decision.mode,
      override_source: decision.source,
      override_raw: decision.raw,
      source: {
        exploration_matrix_path: "artifacts/exploration/option_matrix.json",
        exploration_matrix_sha256: sha256Text(JSON.stringify(actionsObj, null, 2)),
        intake_context_path: "artifacts/intake/intake_context.json",
        intake_context_sha256: sha256Text(intakeText)
      },
      summary: {
        total_actions: 0,
        approved_count: 0,
        review_required_count: 0,
        rejected_count: 0
      },
      approved_actions: [],
      review_required_actions: [],
      rejected_actions: [],
      blocked: false
    };

    fs.writeFileSync(decisionJsonAbs, JSON.stringify(decisionPayload, null, 2), { encoding: "utf8" });
    fs.writeFileSync(decisionMdAbs, renderDecisionMd(decisionPayload), { encoding: "utf8" });

    return {
      stage_progress_percent: 100,
      artifact: relDecisionMd,
      outputs: { md: relDecisionMd, json: relDecisionJson },
      blocked: false,
      status_patch: {
        blocking_questions: [],
        next_step: "MODULE FLOW — Decision Gate COMPLETE. Next=Backfill (implement backfillEngine + task bridge)."
      }
    };
  }

  const approvedActions = [];
  const reviewRequiredActions = [];
  const rejectedActions = [];

  for (const row of flatActions) {
    const verdict = classifyActionRisk({
      action: row._action,
      gap: row._gap,
      intakeContext
    });

    const cleanRow = {
      gap_id: row.gap_id,
      category: row.category,
      severity: row.severity,
      affected_entities: row.affected_entities,
      action_id: row.action_id,
      description: row.description,
      impact_scope: row.impact_scope,
      requires_decision: row.requires_decision,
      cognitive_priority_hint: resolveCognitivePriorityHint(row, traceCognitivePayload),
      reason: verdict.reason
    };

    if (decision.mode === "REJECT") {
      cleanRow.reason = "explicit REJECT from governed override channel";
      rejectedActions.push(cleanRow);
      continue;
    }

    if (verdict.decision === "REVIEW") {
      if (decision.mode === "APPROVE_ALL") {
        cleanRow.reason = `${verdict.reason}; approved by explicit override`;
        approvedActions.push(cleanRow);
      } else {
        reviewRequiredActions.push(cleanRow);
      }
      continue;
    }

    approvedActions.push(cleanRow);
  }

  const actionsText = JSON.stringify(actionsObj, null, 2);
  const intakeText = JSON.stringify(intakeContext, null, 2);
  const stamp = new Date().toISOString();

  const blocked = rejectedActions.length === 0 && reviewRequiredActions.length > 0;

  const decisionPayload = {
    decision_id: "MODULE_FLOW_DECISION_GATE",
    timestamp: stamp,
    task: "TASK-052",
    policy: "AUTONOMOUS_BY_DEFAULT_FAIL_CLOSED_ON_RISK",
    operating_mode: intakeContext.operating_mode,
    repository_state: intakeContext.repository_state,
    override_mode: decision.mode,
    override_source: decision.source,
    override_raw: decision.raw,
    source: {
      exploration_matrix_path: "artifacts/exploration/option_matrix.json",
      exploration_matrix_sha256: sha256Text(actionsText),
      intake_context_path: "artifacts/intake/intake_context.json",
      intake_context_sha256: sha256Text(intakeText)
    },
    summary: {
      total_actions: flatActions.length,
      approved_count: approvedActions.length,
      review_required_count: reviewRequiredActions.length,
      rejected_count: rejectedActions.length
    },
    approved_actions: approvedActions,
    review_required_actions: reviewRequiredActions,
    rejected_actions: rejectedActions,
    blocked
  };

  fs.writeFileSync(decisionJsonAbs, JSON.stringify(decisionPayload, null, 2), { encoding: "utf8" });
  fs.writeFileSync(decisionMdAbs, renderDecisionMd(decisionPayload), { encoding: "utf8" });

  if (rejectedActions.length > 0) {
    return {
      stage_progress_percent: 100,
      artifact: relDecisionMd,
      outputs: { md: relDecisionMd, json: relDecisionJson },
      blocked: true,
      status_patch: {
        next_step: "IDLE — Decision Gate REJECTED",
        blocking_questions: [
          "Decision Gate REJECTED: override must come from FORGE_DECISION_OVERRIDE, not from status reflection."
        ]
      }
    };
  }

  if (blocked) {
    return {
      stage_progress_percent: 100,
      artifact: relDecisionMd,
      outputs: { md: relDecisionMd, json: relDecisionJson },
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: [
          "Decision Gate BLOCKED: high-risk or ambiguous actions require explicit override. Set FORGE_DECISION_OVERRIDE to APPROVE ALL or REJECT, then re-run Decision Gate."
        ]
      }
    };
  }

  return {
    stage_progress_percent: 100,
    artifact: relDecisionMd,
    outputs: { md: relDecisionMd, json: relDecisionJson },
    status_patch: {
      blocking_questions: [],
      next_step: "MODULE FLOW — Decision Gate COMPLETE. Next=Backfill (implement backfillEngine + task bridge)."
    }
  };
}

module.exports = {
  runDecisionGate
};