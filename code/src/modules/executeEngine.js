const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../../..");

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function readJson(absPath) {
  const raw = fs.readFileSync(absPath, "utf8");
  return JSON.parse(raw);
}

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function markExecutionPackageExecuted(workspaceExecutionPackagePath, executePlanRel) {
  const relPath = String(workspaceExecutionPackagePath || "").trim();

  if (!relPath) {
    return;
  }

  const absPath = path.resolve(ROOT, relPath);

  if (!fs.existsSync(absPath)) {
    return;
  }

  const executionPackage = readJson(absPath);

  if (!executionPackage || typeof executionPackage !== "object") {
    return;
  }

  executionPackage.handoff_status = "EXECUTED";
  executionPackage.executed_at = new Date().toISOString();
  executionPackage.execution_result = {
    status: "EXECUTED",
    execute_plan_path: executePlanRel
  };

  fs.writeFileSync(absPath, JSON.stringify(executionPackage, null, 2), "utf8");
}

function resolveSafeTargetPath(targetPath) {
  const rel = String(targetPath || "").trim();

  if (!rel) {
    return null;
  }

  const abs = path.resolve(ROOT, rel);
  const normalizedRoot = ROOT.endsWith(path.sep) ? ROOT : `${ROOT}${path.sep}`;

  if (abs !== ROOT && !abs.startsWith(normalizedRoot)) {
    return null;
  }

  return abs;
}

function renderExecuteReport(payload) {
  const lines = [];

  lines.push("# MODULE FLOW — Execute Report");
  lines.push("");

  lines.push(`- generated_at: ${payload.generated_at}`);
  lines.push(`- operating_mode: ${payload.operating_mode}`);
  lines.push(`- repository_state: ${payload.repository_state}`);
  lines.push("");

  lines.push("## Source");
  lines.push(`- backfill_plan: ${payload.source.backfill_plan_path}`);
  lines.push(`- backfill_sha256: ${payload.source.backfill_sha256}`);
  lines.push(`- intake_context: ${payload.source.intake_context_path}`);
  lines.push(`- intake_sha256: ${payload.source.intake_sha256}`);
  lines.push("");

  lines.push("## Execution Plan");

  if (payload.actions.length === 0) {
    lines.push("- No execution actions");
  } else {
    payload.actions.forEach((a) => {
      lines.push(`- ${a.action_id}`);
      lines.push(`  - type: ${a.action_type}`);
      lines.push(`  - target: ${a.target_path || "(none)"}`);
    });
  }

  lines.push("");
  lines.push("## Next");
  lines.push(
    "- next_step: MODULE_FLOW — Execute COMPLETE. Next=Closure (implement closureEngine + task bridge)."
  );
  lines.push("");

  return lines.join("\n");
}

function runExecute(context) {
  const intakePath = path.resolve(ROOT, "artifacts/intake/intake_context.json");
  const backfillPlanPath = path.resolve(ROOT, "artifacts/backfill/backfill_plan.json");

  if (!fs.existsSync(intakePath)) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: ["Execute BLOCKED: intake_context.json missing"]
      }
    };
  }

  if (!fs.existsSync(backfillPlanPath)) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: ["Execute BLOCKED: backfill_plan.json missing"]
      }
    };
  }

  const intake = readJson(intakePath);
  const backfillPlan = readJson(backfillPlanPath);

  const mode = String(intake.operating_mode || "").toUpperCase();

  if (intake.blocked === true) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: ["Execute BLOCKED: intake is still blocked"]
      }
    };
  }

  if (mode !== "BUILD" && mode !== "IMPROVE") {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: ["Execute BLOCKED: invalid operating_mode"]
      }
    };
  }

  const actions = Array.isArray(backfillPlan.approved_code_actions)
    ? backfillPlan.approved_code_actions
    : [];

  const executedActions = [];

  for (const action of actions) {
    const targetRel = String(action && (action.target_path || action.target_file) ? (action.target_path || action.target_file) : "").trim();

    const normalizedTargetRel = targetRel.replace(/\\/g, "/");

    const isForgeCorePath =
      normalizedTargetRel.startsWith("code/") ||
      normalizedTargetRel.startsWith("bin/") ||
      normalizedTargetRel.startsWith("docs/") ||
      normalizedTargetRel.startsWith("artifacts/forge/") ||
      normalizedTargetRel.startsWith("artifacts/tasks/") ||
      normalizedTargetRel.startsWith("artifacts/orchestration/") ||
      normalizedTargetRel.startsWith("artifacts/verify/") ||
      normalizedTargetRel.startsWith("artifacts/closure/") ||
      normalizedTargetRel.startsWith("web/");

    const isSystemTask =
      action &&
      (
        action.system_task === true ||
        String(action.task_type || "").toLowerCase() === "system_maintenance" ||
        String(action.task_type || "").toLowerCase() === "forge_build"
      );

    if (isForgeCorePath && !isSystemTask) {
      return {
        stage_progress_percent: 100,
        blocked: true,
        status_patch: {
          next_step: "",
          blocking_questions: [
            `Execute BLOCKED: attempt to modify protected Forge path ${targetRel} without system task authorization`
          ]
        }
      };
    }

    const targetAbs = resolveSafeTargetPath(targetRel);

    if (!targetRel || !targetAbs) {
      return {
        stage_progress_percent: 100,
        blocked: true,
        status_patch: {
          next_step: "",
          blocking_questions: [
            `Execute BLOCKED: invalid target path for action ${String(action && action.action_id ? action.action_id : "UNKNOWN")}`
          ]
        }
      };
    }

    const wantsWrite = typeof action.desired_content === "string";
    const existed = fs.existsSync(targetAbs);
    const oldContent = existed ? fs.readFileSync(targetAbs, "utf8") : "";

    const isApprovedWorkspacePatch =
      String(action && action.source_type ? action.source_type : "").trim() === "EXTERNAL_AI_WORKSPACE" &&
      typeof action.expected_sha256 === "string" &&
      action.expected_sha256.trim() !== "";

    if (wantsWrite && existed && action.allow_overwrite !== true && !isApprovedWorkspacePatch) {
      return {
        stage_progress_percent: 100,
        blocked: true,
        status_patch: {
          next_step: "",
          blocking_questions: [
            `Execute BLOCKED: overwrite not allowed for ${targetRel}`
          ]
        }
      };
    }

    let newContent = oldContent;
    let wroteContent = false;

    if (wantsWrite) {
      newContent = String(action.desired_content);

      if (
        String(action.source_type || "").trim() === "EXTERNAL_AI_WORKSPACE" &&
        existed
      ) {
        const oldSize = Buffer.byteLength(oldContent, "utf8");
        const newSize = Buffer.byteLength(newContent, "utf8");
        const expectedCurrentSha256 =
          typeof action.expected_current_sha256 === "string"
            ? action.expected_current_sha256.trim()
            : "";

        if (expectedCurrentSha256 && expectedCurrentSha256 !== sha256Text(oldContent)) {
          return {
            stage_progress_percent: 100,
            blocked: true,
            status_patch: {
              next_step: "",
              blocking_questions: [
                `Execute BLOCKED: current file sha256 mismatch for ${targetRel}`
              ]
            }
          };
        }

        if (
          oldSize >= 1024 &&
          newSize < Math.floor(oldSize * 0.5) &&
          action.explicit_destructive_overwrite !== true
        ) {
          return {
            stage_progress_percent: 100,
            blocked: true,
            status_patch: {
              next_step: "",
              blocking_questions: [
                `Execute BLOCKED: destructive workspace replacement detected for ${targetRel}`
              ]
            }
          };
        }
      }

      if (action.expected_sha256 && sha256Text(newContent) !== String(action.expected_sha256)) {
        return {
          stage_progress_percent: 100,
          blocked: true,
          status_patch: {
            next_step: "",
            blocking_questions: [
              `Execute BLOCKED: sha256 mismatch for ${targetRel}`
            ]
          }
        };
      }

      ensureDir(path.dirname(targetAbs));
      fs.writeFileSync(targetAbs, newContent, "utf8");
      wroteContent = true;
    }

    executedActions.push({
      action_id: String(action.action_id || ""),
      origin_gap_id: String(action.origin_gap_id || ""),
      action_type: String(action.action_type || ""),
      target_path: targetRel,
      target_file: targetRel,
      source_type: String(action.source_type || "FORGE"),
      workspace_execution_id:
        typeof action.workspace_execution_id === "string" && action.workspace_execution_id.trim() !== ""
          ? action.workspace_execution_id.trim()
          : null,
      workspace_execution_package_id:
        typeof action.workspace_execution_package_id === "string" && action.workspace_execution_package_id.trim() !== ""
          ? action.workspace_execution_package_id.trim()
          : null,
      workspace_execution_package_path:
        typeof action.workspace_execution_package_path === "string" && action.workspace_execution_package_path.trim() !== ""
          ? action.workspace_execution_package_path.trim()
          : null,
      deterministic_template_used: action.deterministic_template_used === true,
      allow_overwrite: action.allow_overwrite === true,
      wrote_content: wroteContent,
      old_sha256: existed ? sha256Text(oldContent) : null,
      new_sha256: wroteContent ? sha256Text(newContent) : (existed ? sha256Text(oldContent) : null)
    });
  }

  const executeDir = path.resolve(ROOT, "artifacts/execute");
  ensureDir(executeDir);

  const executePlanPath = path.resolve(executeDir, "execute_plan.json");
  const executeReportPath = path.resolve(executeDir, "execute_report.md");
  const executeDiffPath = path.resolve(executeDir, "execute_diff.md");
  const executeLogPath = path.resolve(executeDir, "execute_log.md");

  const workspaceExecutionId =
    actions.find((action) => typeof action.workspace_execution_id === "string" && action.workspace_execution_id.trim() !== "")
      ?.workspace_execution_id || null;

  const workspaceExecutionPackageId =
    actions.find((action) => typeof action.workspace_execution_package_id === "string" && action.workspace_execution_package_id.trim() !== "")
      ?.workspace_execution_package_id || null;

  const workspaceExecutionPackagePath =
    actions.find((action) => typeof action.workspace_execution_package_path === "string" && action.workspace_execution_package_path.trim() !== "")
      ?.workspace_execution_package_path || null;

  const intakeText = JSON.stringify(intake, null, 2);
  const backfillText = JSON.stringify(backfillPlan, null, 2);

  const planPayload = {
    execution_id: "MODULE_FLOW_EXECUTE_v1",
    generated_at: new Date().toISOString(),
    operating_mode: mode,
    repository_state: intake.repository_state,
    source: {
      backfill_plan_path: "artifacts/backfill/backfill_plan.json",
      backfill_sha256: sha256Text(backfillText),
      intake_context_path: "artifacts/intake/intake_context.json",
      intake_sha256: sha256Text(intakeText),
      workspace_execution_id: workspaceExecutionId,
      workspace_execution_package_id: workspaceExecutionPackageId,
      workspace_execution_package_path: workspaceExecutionPackagePath
    },
    approved_code_actions: executedActions
  };

  const reportPayload = {
    generated_at: planPayload.generated_at,
    operating_mode: mode,
    repository_state: intake.repository_state,
    source: {
      backfill_plan_path: "artifacts/backfill/backfill_plan.json",
      backfill_sha256: sha256Text(backfillText),
      intake_context_path: "artifacts/intake/intake_context.json",
      intake_sha256: sha256Text(intakeText),
      workspace_execution_id: workspaceExecutionId,
      workspace_execution_package_id: workspaceExecutionPackageId,
      workspace_execution_package_path: workspaceExecutionPackagePath
    },
    actions: executedActions
  };

  fs.writeFileSync(executePlanPath, JSON.stringify(planPayload, null, 2));
  fs.writeFileSync(executeReportPath, renderExecuteReport(reportPayload));

  const diffLines = [];
  diffLines.push("# Execute Diff");
  diffLines.push("");

  if (executedActions.length === 0) {
    diffLines.push("- No changes applied");
  } else {
    executedActions.forEach((a) => {
      diffLines.push(`- ${a.action_id} → ${a.target_path}`);
      diffLines.push(`  - wrote_content: ${a.wrote_content ? "true" : "false"}`);
      diffLines.push(`  - old_sha256: ${a.old_sha256 || "null"}`);
      diffLines.push(`  - new_sha256: ${a.new_sha256 || "null"}`);
    });
  }

  fs.writeFileSync(executeDiffPath, diffLines.join("\n"));

  const logLines = [];
  logLines.push("# Execute Log");
  logLines.push("");
  logLines.push(`generated_at: ${planPayload.generated_at}`);
  logLines.push(`actions_count: ${executedActions.length}`);
  executedActions.forEach((a, i) => {
    logLines.push(`- [${i + 1}] ${a.action_id} (${a.action_type}) -> ${a.target_path}`);
  });

  fs.writeFileSync(executeLogPath, logLines.join("\n"));

    markExecutionPackageExecuted(
    workspaceExecutionPackagePath,
    "artifacts/execute/execute_plan.json"
  );

  return {
    stage_progress_percent: 100,
    blocked: false,
    artifact: "artifacts/execute/execute_report.md",
    outputs: {
      md: "artifacts/execute/execute_report.md",
      json: "artifacts/execute/execute_plan.json"
    },
    status_patch: {
      next_step: "MODULE FLOW — Execute COMPLETE. Next=Verify.",
      blocking_questions: []
    }
  };
}

module.exports = {
  runExecute
};