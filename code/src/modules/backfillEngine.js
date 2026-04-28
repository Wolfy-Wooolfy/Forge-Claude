const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../../..");

function deriveTargetPath(row) {
  const entities = Array.isArray(row && row.affected_entities) ? row.affected_entities : [];
  const firstEntity = entities.find((x) => typeof x === "string" && x.trim() !== "");
  if (firstEntity) return firstEntity;
  return "";
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function readJsonAbs(absPath) {
  const raw = fs.readFileSync(absPath, { encoding: "utf8" });
  return JSON.parse(raw);
}

function resolveWorkspaceDraftContent(responseRelPath, targetPath) {
  const responseAbs = path.resolve(ROOT, String(responseRelPath || ""));

  if (!fs.existsSync(responseAbs)) {
    return null;
  }

  const payload = readJsonAbs(responseAbs);
  const files = Array.isArray(payload && payload.files) ? payload.files : [];
  const match = files.find((item) => String(item && item.path ? item.path : "") === String(targetPath || ""));

  if (!match) {
    return null;
  }

  return typeof match.content === "string" ? match.content : null;
}

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function isDeterministicBackfillCategory(category) {
  const c = String(category || "").toUpperCase();
  return (
    c === "UNIMPLEMENTED_REQUIREMENT" ||
    c === "STRUCTURAL_DRIFT" ||
    c === "GOVERNANCE_MISMATCH" ||
    c === "ORPHAN_ARTIFACT" ||
    c === "ORPHAN_CODE" ||
    c === "PARTIAL_COVERAGE" ||
    c === "WORKSPACE_CHANGE_REQUEST"
  );
}

function inferBackfillActionType(row) {
  const description = String(row && row.description ? row.description : "").toLowerCase();
  const impactScope = String(row && row.impact_scope ? row.impact_scope : "").toLowerCase();
  const text = `${description} ${impactScope}`;

  if (/\bdirectory\b|\bdir\b|\bfolder\b/.test(text)) return "CREATE_DIRECTORY";
  if (/\bschema\b/.test(text)) return "GENERATE_SCHEMA";
  if (/\bcontract\b|\btemplate\b|\bplaceholder\b|\bstub\b/.test(text)) return "GENERATE_TEMPLATE";
  if (/\bdocument\b|\bdoc\b|\bmarkdown\b|\bmd\b/.test(text)) return "GENERATE_DOCUMENT";
  return "BACKFILL_RECONCILIATION";
}

function renderBackfillExecutionLog(payload) {
  const lines = [];

  lines.push("# MODULE FLOW — Backfill Execution Log");
  lines.push("");
  lines.push(`- generated_at: ${payload.generated_at}`);
  lines.push(`- operating_mode: ${payload.operating_mode}`);
  lines.push(`- repository_state: ${payload.repository_state}`);
  lines.push(`- blocked: ${payload.blocked ? "true" : "false"}`);
  lines.push("");
  lines.push("## Source");
  lines.push(`- decision_gate_path: ${payload.source.decision_gate_path}`);
  lines.push(`- decision_gate_sha256: ${payload.source.decision_gate_sha256}`);
  lines.push(`- intake_context_path: ${payload.source.intake_context_path}`);
  lines.push(`- intake_context_sha256: ${payload.source.intake_context_sha256}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- approved_actions_seen: ${payload.summary.approved_actions_seen}`);
  lines.push(`- deterministic_backfill_actions: ${payload.summary.deterministic_backfill_actions}`);
  lines.push(`- excluded_non_backfill_actions: ${payload.summary.excluded_non_backfill_actions}`);
  lines.push(`- items_emitted: ${payload.summary.items_emitted}`);
  lines.push("");

  lines.push("## Approved Backfill Actions");
  if (payload.items.length === 0) {
    lines.push("- None");
  } else {
    for (const item of payload.items) {
      lines.push(`- ${item.action_id} [${item.category}/${item.severity}] ${item.reason}`);
      lines.push(`  - target_path: ${item.target_path || "(not specified)"}`);
      lines.push(`  - action_type: ${item.action_type}`);
      lines.push(`  - deterministic_template_used: ${item.deterministic_template_used ? "true" : "false"}`);
    }
  }
  lines.push("");

  lines.push("## Next");
  lines.push("- next_step: MODULE_FLOW — Backfill COMPLETE. Next=Execute (implement executeEngine + task bridge).");
  lines.push("");

  return lines.join("\n");
}

function runBackfill(context) {
  const decisionAbs = path.resolve(ROOT, "artifacts", "decisions", "module_flow_decision_gate.json");
  const intakeContextAbs = path.resolve(ROOT, "artifacts", "intake", "intake_context.json");

  if (!fs.existsSync(decisionAbs)) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: [
          "Backfill BLOCKED: missing artifacts/decisions/module_flow_decision_gate.json"
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
          "Backfill BLOCKED: missing artifacts/intake/intake_context.json"
        ]
      }
    };
  }

  const decision = readJsonAbs(decisionAbs);
  const intakeContext = readJsonAbs(intakeContextAbs);

  const operatingMode = String(intakeContext && intakeContext.operating_mode ? intakeContext.operating_mode : "").toUpperCase();
  const repositoryState = String(intakeContext && intakeContext.repository_state ? intakeContext.repository_state : "").toUpperCase();

  const validOperatingMode =
    intakeContext &&
    intakeContext.blocked === false &&
    (operatingMode === "BUILD" || operatingMode === "IMPROVE");

  if (!validOperatingMode) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: [
          "Backfill BLOCKED: intake_context operating_mode invalid or intake still blocked."
        ]
      }
    };
  }

  const rejected = Array.isArray(decision && decision.rejected_actions) ? decision.rejected_actions : [];
  const reviewRequired = Array.isArray(decision && decision.review_required_actions) ? decision.review_required_actions : [];
  const approved = Array.isArray(decision && decision.approved_actions) ? decision.approved_actions : [];

  if (rejected.length > 0) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "IDLE — Backfill halted (Decision Gate rejected actions)",
        blocking_questions: [
          "Backfill BLOCKED: Decision Gate contains rejected actions."
        ]
      }
    };
  }

  if (reviewRequired.length > 0) {
    return {
      stage_progress_percent: 100,
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: [
          "Backfill BLOCKED: Decision Gate still contains review-required actions."
        ]
      }
    };
  }

  const items = approved
    .filter((row) => isDeterministicBackfillCategory(row.category))
    .map((row, index) => {
      const targetPath = String(row.workspace_target_path || deriveTargetPath(row) || "");
      return {
        seq: index + 1,
        action_id: String(row.action_id || ""),
        origin_gap_id: String(row.gap_id || ""),
        category: String(row.category || ""),
        severity: String(row.severity || ""),
        target_path: targetPath,
        action_type: inferBackfillActionType(row),
        deterministic_template_used: true,
        reason: String(row.reason || ""),
        affected_entities: Array.isArray(row.affected_entities) ? row.affected_entities.map((x) => String(x)) : [],
        impact_scope: String(row.impact_scope || ""),
        requires_decision: Boolean(row.requires_decision),
        workspace_execution_id: typeof row.workspace_execution_id === "string" ? row.workspace_execution_id : "",
        workspace_execution_package_id: typeof row.workspace_execution_package_id === "string" ? row.workspace_execution_package_id : "",
        workspace_execution_package_path: typeof row.workspace_execution_package_path === "string" ? row.workspace_execution_package_path : "",
        workspace_response_path: typeof row.workspace_response_path === "string" ? row.workspace_response_path : "",
        workspace_allow_overwrite: row.workspace_allow_overwrite === true,
        workspace_expected_sha256: typeof row.workspace_expected_sha256 === "string" ? row.workspace_expected_sha256 : "",
        workspace_source: typeof row.workspace_source === "string" ? row.workspace_source : ""
      };
    });

  const backfillDirAbs = path.resolve(ROOT, "artifacts", "backfill");
  ensureDir(backfillDirAbs);

  const canonicalPlanRel = "artifacts/backfill/backfill_plan.json";
  const canonicalLogRel = "artifacts/backfill/backfill_execution_log.md";
  const legacyTasksRel = "artifacts/backfill/backfill_tasks.json";
  const legacyReportRel = "artifacts/backfill/backfill_report.md";
  const createdFilesRel = "artifacts/backfill/backfill_created_files.json";

  const canonicalPlanAbs = path.resolve(ROOT, canonicalPlanRel);
  const canonicalLogAbs = path.resolve(ROOT, canonicalLogRel);
  const legacyTasksAbs = path.resolve(ROOT, legacyTasksRel);
  const legacyReportAbs = path.resolve(ROOT, legacyReportRel);
  const createdFilesAbs = path.resolve(ROOT, createdFilesRel);

  const decisionText = JSON.stringify(decision, null, 2);
  const intakeText = JSON.stringify(intakeContext, null, 2);
  const generatedAt = new Date().toISOString();

  const canonicalPlan = {
    execution_id: "MODULE_FLOW_BACKFILL_v2",
    generated_at: generatedAt,
    operating_mode: operatingMode,
    repository_state: repositoryState,
    source: {
      decision_gate_path: "artifacts/decisions/module_flow_decision_gate.json",
      decision_gate_sha256: sha256Text(decisionText),
      intake_context_path: "artifacts/intake/intake_context.json",
      intake_context_sha256: sha256Text(intakeText),
      workspace_execution_id:
        items.find((item) => typeof item.workspace_execution_id === "string" && item.workspace_execution_id.trim() !== "")
          ?.workspace_execution_id || null,
      workspace_execution_package_id:
        items.find((item) => typeof item.workspace_execution_package_id === "string" && item.workspace_execution_package_id.trim() !== "")
          ?.workspace_execution_package_id || null,
      workspace_execution_package_path:
        items.find((item) => typeof item.workspace_execution_package_path === "string" && item.workspace_execution_package_path.trim() !== "")
          ?.workspace_execution_package_path || null
    },
    approved_code_actions: items
      .map((item) => {
        const affected = Array.isArray(item.affected_entities) ? item.affected_entities : [];

        let target = String(item.target_path || "").trim();

        if (!target) {
          target = affected.find((x) => {
            const value = String(x || "").toLowerCase();
            return value.startsWith("code/") || value.startsWith("web/");
          });
        }

        if (!target) {
          const fallback = affected[0] || "UNRESOLVED_TARGET";
          target = `code/__backfill_auto__/${String(fallback)
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .slice(0, 120)}`;
        }

        const desiredContent = item.workspace_response_path
          ? resolveWorkspaceDraftContent(item.workspace_response_path, target)
          : null;

        return {
          action_id: item.action_id,
          origin_gap_id: item.origin_gap_id,
          target_file: target,
          target_path: target,
          action_type: item.action_type,
          deterministic_template_used: item.deterministic_template_used,
          desired_content: desiredContent,
          allow_overwrite: item.workspace_allow_overwrite === true,
          expected_sha256: item.workspace_expected_sha256 || null,
          workspace_execution_id: item.workspace_execution_id || null,
          workspace_execution_package_id: item.workspace_execution_package_id || null,
          workspace_execution_package_path: item.workspace_execution_package_path || null,
          source_type: item.workspace_source || "FORGE"
        };
      })
      .filter(Boolean)
  };

  const legacyTasks = {
    backfill_id: "MODULE_FLOW_BACKFILL_v2",
    generated_at: generatedAt,
    operating_mode: operatingMode,
    repository_state: repositoryState,
    source: canonicalPlan.source,
    summary: {
      approved_actions_seen: approved.length,
      deterministic_backfill_actions: items.length,
      excluded_non_backfill_actions: approved.length - items.length,
      items_emitted: items.length
    },
    items: items.map((item) => ({
      gap_id: item.origin_gap_id,
      category: item.category,
      severity: item.severity,
      affected_entities: item.affected_entities,
      action: {
        action_id: item.action_id,
        description: item.reason,
        impact_scope: item.impact_scope,
        requires_decision: item.requires_decision,
        target_path: item.target_path,
        action_type: item.action_type,
        deterministic_template_used: item.deterministic_template_used
      }
    }))
  };

  const executionLogPayload = {
    generated_at: generatedAt,
    operating_mode: operatingMode,
    repository_state: repositoryState,
    blocked: false,
    source: canonicalPlan.source,
    summary: legacyTasks.summary,
    items
  };

  const legacyReport = [
    "# MODULE FLOW — Backfill Report",
    "",
    `- generated_at: ${generatedAt}`,
    `- operating_mode: ${operatingMode}`,
    `- repository_state: ${repositoryState}`,
    `- approved_actions_seen: ${legacyTasks.summary.approved_actions_seen}`,
    `- deterministic_backfill_actions: ${legacyTasks.summary.deterministic_backfill_actions}`,
    `- excluded_non_backfill_actions: ${legacyTasks.summary.excluded_non_backfill_actions}`,
    `- items_emitted: ${legacyTasks.summary.items_emitted}`,
    "",
    "## Outputs",
    `- ${canonicalPlanRel}`,
    `- ${canonicalLogRel}`,
    `- ${legacyTasksRel}`,
    `- ${legacyReportRel}`,
    "",
    "## Next",
    "- next_step: MODULE_FLOW — Backfill COMPLETE. Next=Execute (implement executeEngine + task bridge).",
    ""
  ].join("\n");

  fs.writeFileSync(canonicalPlanAbs, JSON.stringify(canonicalPlan, null, 2), { encoding: "utf8" });
  fs.writeFileSync(canonicalLogAbs, renderBackfillExecutionLog(executionLogPayload), { encoding: "utf8" });
  fs.writeFileSync(legacyTasksAbs, JSON.stringify(legacyTasks, null, 2), { encoding: "utf8" });
  fs.writeFileSync(legacyReportAbs, legacyReport, { encoding: "utf8" });
  fs.writeFileSync(createdFilesAbs, JSON.stringify({ generated_at: generatedAt, created_files: [] }, null, 2), { encoding: "utf8" });

  return {
    stage_progress_percent: 100,
    artifact: legacyReportRel,
    outputs: {
      md: legacyReportRel,
      json: legacyTasksRel,
      canonical_plan: canonicalPlanRel,
      canonical_log: canonicalLogRel,
      created_files: createdFilesRel
    },
    status_patch: {
      blocking_questions: [],
      next_step: "MODULE_FLOW — Backfill COMPLETE. Next=Execute (implement executeEngine + task bridge)."
    }
  };
}

module.exports = {
  runBackfill
};