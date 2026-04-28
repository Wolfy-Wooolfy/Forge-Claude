const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function fileExists(rel) {
  const abs = path.resolve(ROOT, rel);
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
}

function readJson(rel) {
  const abs = path.resolve(ROOT, rel);
  const raw = fs.readFileSync(abs, "utf8");
  return JSON.parse(raw);
}

function normalizeProjectId(projectIdInput) {
  return typeof projectIdInput === "string" && projectIdInput.trim() !== ""
    ? projectIdInput.trim()
    : "default_project";
}

function getProjectExecutionPackageRel(projectIdInput) {
  return `artifacts/projects/${normalizeProjectId(projectIdInput)}/execute/execution_package.json`;
}

function getGapMetrics(gapJson) {
  const gaps = Array.isArray(gapJson && gapJson.gaps) ? gapJson.gaps : [];

  const totalGaps =
    typeof (gapJson && gapJson.total_gaps) === "number"
      ? gapJson.total_gaps
      : gaps.length;

  const criticalViolations =
    typeof (gapJson && gapJson.critical_count) === "number"
      ? gapJson.critical_count
      : gaps.filter((gap) => String(gap && gap.severity ? gap.severity : "").toUpperCase() === "CRITICAL").length;

  let orphanCodeUnits = 0;
  let orphanRequirements = 0;
  let orphanArtifacts = 0;

  for (const gap of gaps) {
    const category = String(gap && gap.category ? gap.category : "").toUpperCase();

    if (category === "ORPHAN_CODE" || category === "ORPHAN_CODE_UNITS") {
      orphanCodeUnits += 1;
    } else if (category === "ORPHAN_REQUIREMENT" || category === "ORPHAN_REQUIREMENTS") {
      orphanRequirements += 1;
    } else if (category === "ORPHAN_ARTIFACT" || category === "ORPHAN_ARTIFACTS") {
      orphanArtifacts += 1;
    }
  }

  return {
    total_gaps: totalGaps,
    critical_violations: criticalViolations,
    orphan_code_units: orphanCodeUnits,
    orphan_requirements: orphanRequirements,
    orphan_artifacts: orphanArtifacts
  };
}

function runVerify(context) {
  const verifyDir = path.resolve(ROOT, "artifacts/verify");
  ensureDir(verifyDir);

  const reportRel = "artifacts/verify/verification_report.md";
  const jsonRel = "artifacts/verify/verification_results.json";
  const reportPath = path.resolve(ROOT, reportRel);
  const jsonPath = path.resolve(ROOT, jsonRel);

  const requiredJsonArtifacts = [
    "artifacts/intake/intake_snapshot.json",
    "artifacts/audit/audit_findings.json",
    "artifacts/trace/trace_matrix.json",
    "artifacts/gap/gap_actions.json",
    "artifacts/backfill/backfill_plan.json",
    "artifacts/execute/execute_plan.json"
  ];

  const requiredMdArtifacts = [
    "artifacts/execute/execute_diff.md",
    "artifacts/execute/execute_log.md"
  ];

  const decisionArtifactOptions = [
    "artifacts/decisions/decision_packet.json",
    "artifacts/decisions/decision_auto_pass.md",
    "artifacts/decisions/module_flow_decision_gate.json"
  ];

  const executePlanRel = "artifacts/execute/execute_plan.json";
  const backfillPlanRel = "artifacts/backfill/backfill_plan.json";
  const gapRel = "artifacts/gap/gap_actions.json";
  const auditRel = "artifacts/audit/audit_findings.json";
  const traceRel = "artifacts/trace/trace_matrix.json";
  const intakeSnapshotRel = "artifacts/intake/intake_snapshot.json";

  const results = {
    generated_at: new Date().toISOString(),
    blocked: false,
    status: "",
    outcome: "",
    final_outcome: "",
    summary: {
      total_checks: 0,
      failed_checks: 0
    },
    closure_gate: {
      gap_count: null,
      critical_violations: null,
      orphan_code_units: null,
      orphan_requirements: null,
      orphan_artifacts: null,
      deterministic_confirmation_ready: false,
      execute_artifacts_complete: false,
      decision_artifact_present: false,
      closure_contract_ready: false
    },
    checks: []
  };

  function addCheck(name, passed, detail) {
    results.checks.push({
      name,
      passed,
      detail
    });
  }

  for (const rel of requiredJsonArtifacts) {
    if (!fileExists(rel)) {
      addCheck(rel.replace(/[/.]/g, "_") + "_exists", false, rel + " missing");
      continue;
    }

    try {
      readJson(rel);
      addCheck(rel.replace(/[/.]/g, "_") + "_valid_json", true, rel);
    } catch (e) {
      addCheck(rel.replace(/[/.]/g, "_") + "_valid_json", false, rel + " invalid JSON");
    }
  }

  for (const rel of requiredMdArtifacts) {
    addCheck(rel.replace(/[/.]/g, "_") + "_exists", fileExists(rel), fileExists(rel) ? rel : rel + " missing");
  }

  const decisionArtifactPresent = decisionArtifactOptions.some((rel) => fileExists(rel));
  addCheck(
    "decision_artifact_present",
    decisionArtifactPresent,
    decisionArtifactPresent
      ? decisionArtifactOptions.filter((rel) => fileExists(rel)).join(", ")
      : "No decision artifact found"
  );

  let executePlan = null;
  let backfillPlan = null;
  let gapJson = null;
  let auditJson = null;
  let traceJson = null;
  let intakeSnapshot = null;

  try {
    if (fileExists(executePlanRel)) {
      executePlan = readJson(executePlanRel);
    }
  } catch (e) {}

  try {
    if (fileExists(backfillPlanRel)) {
      backfillPlan = readJson(backfillPlanRel);
    }
  } catch (e) {}

  try {
    if (fileExists(gapRel)) {
      gapJson = readJson(gapRel);
    }
  } catch (e) {}

  try {
    if (fileExists(auditRel)) {
      auditJson = readJson(auditRel);
    }
  } catch (e) {}

  try {
    if (fileExists(traceRel)) {
      traceJson = readJson(traceRel);
    }
  } catch (e) {}

  try {
    if (fileExists(intakeSnapshotRel)) {
      intakeSnapshot = readJson(intakeSnapshotRel);
    }
  } catch (e) {}

  const backfillActions = Array.isArray(backfillPlan && backfillPlan.approved_code_actions)
    ? backfillPlan.approved_code_actions
    : [];

  const executeActions = Array.isArray(executePlan && executePlan.approved_code_actions)
    ? executePlan.approved_code_actions
    : Array.isArray(executePlan && executePlan.actions)
      ? executePlan.actions
      : executePlan && executePlan.plan && Array.isArray(executePlan.plan.actions)
        ? executePlan.plan.actions
        : [];

  const decisionGateRel = "artifacts/decisions/module_flow_decision_gate.json";
  let decisionGateJson = null;

  try {
    if (fileExists(decisionGateRel)) {
      decisionGateJson = readJson(decisionGateRel);
    }
  } catch (e) {}

  const projectId = normalizeProjectId(
    context && typeof context.project_id === "string" ? context.project_id : ""
  );

  let executionPackageJson = null;

  const currentExecutionPackageId =
    executionPackageJson &&
    typeof executionPackageJson.package_id === "string"
      ? executionPackageJson.package_id
      : "";

  const currentExecutionPackageExecutionId =
    executionPackageJson &&
    typeof executionPackageJson.execution_id === "string"
      ? executionPackageJson.execution_id
      : "";

  const decisionApprovedActions = Array.isArray(decisionGateJson && decisionGateJson.approved_actions)
    ? decisionGateJson.approved_actions
    : [];

  const workspaceExecutionIdFromDecision =
    decisionGateJson &&
    Array.isArray(decisionGateJson.approved_actions) &&
    decisionGateJson.approved_actions.find(
      (action) =>
        typeof action.workspace_execution_id === "string" &&
        action.workspace_execution_id.trim() !== ""
    )?.workspace_execution_id
      ? decisionGateJson.approved_actions.find(
          (action) =>
            typeof action.workspace_execution_id === "string" &&
            action.workspace_execution_id.trim() !== ""
        ).workspace_execution_id
      : "";

  const workspaceExecutionIdFromBackfill =
    backfillPlan &&
    backfillPlan.source &&
    typeof backfillPlan.source.workspace_execution_id === "string"
      ? backfillPlan.source.workspace_execution_id
      : "";

  const workspaceExecutionIdFromExecute =
    executePlan &&
    executePlan.source &&
    typeof executePlan.source.workspace_execution_id === "string"
      ? executePlan.source.workspace_execution_id
      : "";

  const workspaceExecutionPackageIdFromDecision =
    decisionGateJson &&
    decisionGateJson.source &&
    typeof decisionGateJson.source.execution_package_id === "string"
      ? decisionGateJson.source.execution_package_id
      : "";

  const workspaceExecutionPackagePathFromDecision =
    decisionGateJson &&
    decisionGateJson.source &&
    typeof decisionGateJson.source.execution_package_path === "string"
      ? decisionGateJson.source.execution_package_path
      : "";

  const workspaceExecutionPackageIdFromBackfill =
    backfillPlan &&
    backfillPlan.source &&
    typeof backfillPlan.source.workspace_execution_package_id === "string"
      ? backfillPlan.source.workspace_execution_package_id
      : "";

  const workspaceExecutionPackagePathFromBackfill =
    backfillPlan &&
    backfillPlan.source &&
    typeof backfillPlan.source.workspace_execution_package_path === "string"
      ? backfillPlan.source.workspace_execution_package_path
      : "";

  const workspaceExecutionPackageIdFromExecute =
    executePlan &&
    executePlan.source &&
    typeof executePlan.source.workspace_execution_package_id === "string"
      ? executePlan.source.workspace_execution_package_id
      : "";

  const workspaceExecutionPackagePathFromExecute =
    executePlan &&
    executePlan.source &&
    typeof executePlan.source.workspace_execution_package_path === "string"
      ? executePlan.source.workspace_execution_package_path
      : "";

  const activeWorkspaceExecutionId =
    workspaceExecutionIdFromExecute ||
    workspaceExecutionIdFromBackfill ||
    workspaceExecutionIdFromDecision ||
    "";

  const activeWorkspaceExecutionPackageId =
    workspaceExecutionPackageIdFromExecute ||
    workspaceExecutionPackageIdFromBackfill ||
    workspaceExecutionPackageIdFromDecision ||
    "";

  const activeWorkspaceExecutionPackagePath =
    workspaceExecutionPackagePathFromExecute ||
    workspaceExecutionPackagePathFromBackfill ||
    workspaceExecutionPackagePathFromDecision ||
    "";

  const executionPackageRel =
    activeWorkspaceExecutionPackagePath || getProjectExecutionPackageRel(projectId);

  try {
    if (fileExists(executionPackageRel)) {
      executionPackageJson = readJson(executionPackageRel);
    }
  } catch (e) {}

  addCheck(
    "execute_plan_matches_backfill_plan",
    backfillPlan !== null && executePlan !== null && backfillActions.length === executeActions.length,
    `backfill_actions=${backfillActions.length}; execute_actions=${executeActions.length}`
  );

    addCheck(
    "decision_gate_matches_backfill_plan",
    decisionGateJson !== null && decisionApprovedActions.length === backfillActions.length,
    `decision_actions=${decisionApprovedActions.length}; backfill_actions=${backfillActions.length}`
  );

  addCheck(
    "workspace_runtime_execution_id_consistent",
    activeWorkspaceExecutionId === "" ||
      (
        workspaceExecutionIdFromBackfill === activeWorkspaceExecutionId &&
        workspaceExecutionIdFromExecute === activeWorkspaceExecutionId
      ),
    `decision=${workspaceExecutionIdFromDecision || "NONE"}; backfill=${workspaceExecutionIdFromBackfill || "NONE"}; execute=${workspaceExecutionIdFromExecute || "NONE"}`
  );

  addCheck(
    "workspace_runtime_matches_current_execution_package",
    currentExecutionPackageExecutionId === "" ||
      (
        workspaceExecutionIdFromDecision === currentExecutionPackageExecutionId &&
        workspaceExecutionIdFromBackfill === currentExecutionPackageExecutionId &&
        workspaceExecutionIdFromExecute === currentExecutionPackageExecutionId
      ),
    currentExecutionPackageExecutionId === ""
      ? "No current workspace execution_package.json"
      : `current_execution_package_execution_id=${currentExecutionPackageExecutionId}; decision_gate=${workspaceExecutionIdFromDecision || "NONE"}; backfill=${workspaceExecutionIdFromBackfill || "NONE"}; execute=${workspaceExecutionIdFromExecute || "NONE"}`
  );

  addCheck(
    "workspace_execution_package_identity_consistent",
    (activeWorkspaceExecutionPackageId === "" && activeWorkspaceExecutionPackagePath === "") ||
      (
        workspaceExecutionPackageIdFromDecision === activeWorkspaceExecutionPackageId &&
        workspaceExecutionPackageIdFromBackfill === activeWorkspaceExecutionPackageId &&
        workspaceExecutionPackageIdFromExecute === activeWorkspaceExecutionPackageId &&
        workspaceExecutionPackagePathFromDecision === activeWorkspaceExecutionPackagePath &&
        workspaceExecutionPackagePathFromBackfill === activeWorkspaceExecutionPackagePath &&
        workspaceExecutionPackagePathFromExecute === activeWorkspaceExecutionPackagePath
      ),
    `decision_package_id=${workspaceExecutionPackageIdFromDecision || "NONE"}; backfill_package_id=${workspaceExecutionPackageIdFromBackfill || "NONE"}; execute_package_id=${workspaceExecutionPackageIdFromExecute || "NONE"}; decision_package_path=${workspaceExecutionPackagePathFromDecision || "NONE"}; backfill_package_path=${workspaceExecutionPackagePathFromBackfill || "NONE"}; execute_package_path=${workspaceExecutionPackagePathFromExecute || "NONE"}`
  );

  addCheck(
    "workspace_execution_package_matches_current_artifact",
    currentExecutionPackageId === "" ||
      (
        workspaceExecutionPackageIdFromDecision === currentExecutionPackageId &&
        workspaceExecutionPackageIdFromBackfill === currentExecutionPackageId &&
        workspaceExecutionPackageIdFromExecute === currentExecutionPackageId &&
        workspaceExecutionPackagePathFromDecision === executionPackageRel &&
        workspaceExecutionPackagePathFromBackfill === executionPackageRel &&
        workspaceExecutionPackagePathFromExecute === executionPackageRel
      ),
    currentExecutionPackageId === ""
      ? "No current workspace execution_package.json"
      : `current_execution_package_id=${currentExecutionPackageId}; decision_gate=${workspaceExecutionPackageIdFromDecision || "NONE"}; backfill=${workspaceExecutionPackageIdFromBackfill || "NONE"}; execute=${workspaceExecutionPackageIdFromExecute || "NONE"}`
  );

  addCheck(
    "workspace_runtime_write_applied",
    executeActions.length === 0 || executeActions.every((action) => action && action.wrote_content === true),
    `execute_actions=${executeActions.length}; wrote_content_all=${executeActions.length === 0 ? "n/a" : (executeActions.every((action) => action && action.wrote_content === true) ? "true" : "false")}`
  );

  const gapMetrics = gapJson ? getGapMetrics(gapJson) : null;

  if (gapMetrics) {
    results.closure_gate.gap_count = gapMetrics.total_gaps;
    results.closure_gate.critical_violations = gapMetrics.critical_violations;
    results.closure_gate.orphan_code_units = gapMetrics.orphan_code_units;
    results.closure_gate.orphan_requirements = gapMetrics.orphan_requirements;
    results.closure_gate.orphan_artifacts = gapMetrics.orphan_artifacts;

    addCheck("gap_count_zero", gapMetrics.total_gaps === 0, `gap_count=${gapMetrics.total_gaps}`);
    addCheck("critical_violations_zero", gapMetrics.critical_violations === 0, `critical_violations=${gapMetrics.critical_violations}`);
    addCheck("orphan_code_units_zero", gapMetrics.orphan_code_units === 0, `orphan_code_units=${gapMetrics.orphan_code_units}`);
    addCheck("orphan_requirements_zero", gapMetrics.orphan_requirements === 0, `orphan_requirements=${gapMetrics.orphan_requirements}`);
    addCheck("orphan_artifacts_zero", gapMetrics.orphan_artifacts === 0, `orphan_artifacts=${gapMetrics.orphan_artifacts}`);
  }

  addCheck(
    "audit_not_blocked",
    auditJson !== null && auditJson.blocked !== true,
    auditJson !== null ? `audit_blocked=${auditJson.blocked === true ? "true" : "false"}` : "audit findings unavailable"
  );

  addCheck(
    "trace_mappings_present",
    traceJson !== null && Array.isArray(traceJson.mappings),
    traceJson !== null ? `mappings=${Array.isArray(traceJson.mappings) ? traceJson.mappings.length : 0}` : "trace matrix unavailable"
  );

  addCheck(
    "intake_snapshot_locked",
    intakeSnapshot !== null && intakeSnapshot.locked_snapshot_flag === true,
    intakeSnapshot !== null ? `locked_snapshot_flag=${intakeSnapshot.locked_snapshot_flag === true ? "true" : "false"}` : "intake snapshot unavailable"
  );

  results.closure_gate.execute_artifacts_complete =
    fileExists(executePlanRel) &&
    fileExists("artifacts/execute/execute_diff.md") &&
    fileExists("artifacts/execute/execute_log.md") &&
    backfillActions.length === executeActions.length;

  results.closure_gate.decision_artifact_present = decisionArtifactPresent;

  results.closure_gate.deterministic_confirmation_ready =
    intakeSnapshot !== null &&
    intakeSnapshot.locked_snapshot_flag === true;

  results.closure_gate.closure_contract_ready =
    results.closure_gate.execute_artifacts_complete === true &&
    results.closure_gate.decision_artifact_present === true &&
    results.closure_gate.deterministic_confirmation_ready === true &&
    results.closure_gate.gap_count === 0 &&
    results.closure_gate.critical_violations === 0 &&
    results.closure_gate.orphan_code_units === 0 &&
    results.closure_gate.orphan_requirements === 0 &&
    results.closure_gate.orphan_artifacts === 0;

  results.summary.total_checks = results.checks.length;
  results.summary.failed_checks = results.checks.filter((c) => !c.passed).length;

  const md = [];
  md.push("# Verification Report");
  md.push("");
  md.push(`generated_at: ${results.generated_at}`);
  md.push(`status: ${results.summary.failed_checks === 0 ? "PASS" : "FAIL"}`);
  md.push("");
  md.push("## Closure Gate Readiness");
  md.push(`- gap_count: ${results.closure_gate.gap_count}`);
  md.push(`- critical_violations: ${results.closure_gate.critical_violations}`);
  md.push(`- orphan_code_units: ${results.closure_gate.orphan_code_units}`);
  md.push(`- orphan_requirements: ${results.closure_gate.orphan_requirements}`);
  md.push(`- orphan_artifacts: ${results.closure_gate.orphan_artifacts}`);
  md.push(`- execute_artifacts_complete: ${results.closure_gate.execute_artifacts_complete ? "true" : "false"}`);
  md.push(`- decision_artifact_present: ${results.closure_gate.decision_artifact_present ? "true" : "false"}`);
  md.push(`- deterministic_confirmation_ready: ${results.closure_gate.deterministic_confirmation_ready ? "true" : "false"}`);
  md.push(`- closure_contract_ready: ${results.closure_gate.closure_contract_ready ? "true" : "false"}`);
  md.push("");
  md.push("## Checks");

  for (const c of results.checks) {
    md.push(`- ${c.name}: ${c.passed ? "PASS" : "FAIL"} ${c.detail}`);
  }

  const failed = results.summary.failed_checks > 0;

  if (failed) {
    results.blocked = true;
    results.status = "FAIL";
    results.outcome = "FAIL";
    results.final_outcome = "FAIL";

    fs.writeFileSync(reportPath, md.join("\n"), { encoding: "utf8" });
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), { encoding: "utf8" });

    return {
      blocked: true,
      artifact: reportRel,
      outputs: {
        md: reportRel,
        json: jsonRel
      },
      status_patch: {
        blocking_questions: ["Verification failed — review artifacts/verify/verification_report.md"],
        next_step: ""
      }
    };
  }

  results.blocked = false;
  results.status = "PASS";
  results.outcome = "PASS";
  results.final_outcome = "PASS";

  fs.writeFileSync(reportPath, md.join("\n"), { encoding: "utf8" });
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), { encoding: "utf8" });

  return {
    stage_progress_percent: 100,
    artifact: reportRel,
    outputs: {
      md: reportRel,
      json: jsonRel
    },
    status_patch: {
      blocking_questions: [],
      next_step: "MODULE FLOW — Verify COMPLETE. Next=Closure"
    }
  };
}

module.exports = {
  runVerify
};
