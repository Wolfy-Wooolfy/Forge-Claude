const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

function writeJson(relPath, data) {
  const absPath = path.resolve(ROOT, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), "utf-8");
}

function writeText(relPath, content) {
  const absPath = path.resolve(ROOT, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf-8");
}

function readJson(relPath) {
  const absPath = path.resolve(ROOT, relPath);
  return JSON.parse(fs.readFileSync(absPath, "utf-8"));
}

function normalizeGapActions(payload) {
  if (payload && Array.isArray(payload.gaps)) {
    const rows = [];

    for (const gap of payload.gaps) {
      const recommended = Array.isArray(gap && gap.recommended_actions)
        ? gap.recommended_actions
        : [];

      for (const action of recommended) {
        rows.push({
          gap_id: String(gap && gap.gap_id ? gap.gap_id : ""),
          category: String(gap && gap.category ? gap.category : ""),
          severity: String(gap && gap.severity ? gap.severity : ""),
          affected_entities: Array.isArray(gap && gap.affected_entities)
            ? gap.affected_entities.map((x) => String(x))
            : [],
          action_id: String(action && action.action_id ? action.action_id : ""),
          title: String(action && action.action_id ? action.action_id : ""),
          description: String(action && action.description ? action.description : ""),
          impact_scope: String(action && action.impact_scope ? action.impact_scope : ""),
          requires_decision: !!(action && action.requires_decision === true)
        });
      }
    }

    return rows;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.actions)) {
    return payload.actions;
  }

  if (payload && Array.isArray(payload.gaps)) {
    return payload.gaps;
  }

  return [];
}

function buildOptionsForAction(action, index) {
  const actionId =
    action && typeof action.action_id === "string" && action.action_id.trim() !== ""
      ? action.action_id.trim()
      : `GAP-ACTION-${String(index + 1).padStart(3, "0")}`;

  const title =
    action && typeof action.title === "string" && action.title.trim() !== ""
      ? action.title.trim()
      : actionId;

  const description =
    action && typeof action.description === "string" && action.description.trim() !== ""
      ? action.description.trim()
      : "No action description provided.";

  return {
    exploration_id: `EXP-${String(index + 1).padStart(3, "0")}`,
    source_action_id: actionId,
    gap_id: action && typeof action.gap_id === "string" ? action.gap_id : "",
    category: action && typeof action.category === "string" ? action.category : "",
    severity: action && typeof action.severity === "string" ? action.severity : "",
    affected_entities: Array.isArray(action && action.affected_entities)
      ? action.affected_entities.map((x) => String(x))
      : [],
    action_id: actionId,
    title,
    description,
    impact_scope:
      action && typeof action.impact_scope === "string" ? action.impact_scope : "",
    requires_decision: !!(action && action.requires_decision === true),
    options: [
      {
        option_id: "OPTION-A",
        label: "Direct implementation",
        summary: "Implement the action directly in the existing flow.",
        impact: "HIGH",
        complexity: "LOW"
      },
      {
        option_id: "OPTION-B",
        label: "Pre-implementation restructuring",
        summary: "Restructure the dependent flow before implementation.",
        impact: "MEDIUM",
        complexity: "MEDIUM"
      }
    ],
    recommended_option_id: "OPTION-A"
  };
}

function renderReport(matrix) {
  const lines = ["# Design Exploration Report", ""];

  matrix.forEach((item) => {
    lines.push(`## ${item.exploration_id}`);
    lines.push(`- source_action_id: ${item.source_action_id}`);
    lines.push(`- gap_id: ${item.gap_id}`);
    lines.push(`- category: ${item.category}`);
    lines.push(`- severity: ${item.severity}`);
    lines.push(`- action_id: ${item.action_id}`);
    lines.push(`- title: ${item.title}`);
    lines.push(`- recommended_option_id: ${item.recommended_option_id}`);
    lines.push("");
  });

  return lines.join("\n");
}

function runDesignExploration(context) {
  const gapActionsPath = "artifacts/gap/gap_actions.json";
  const gapActionsAbs = path.resolve(ROOT, gapActionsPath);

  if (!fs.existsSync(gapActionsAbs)) {
    return {
      blocked: true,
      status_patch: {
        next_step: "",
        blocking_questions: [
          "Design Exploration blocked: artifacts/gap/gap_actions.json is missing."
        ]
      }
    };
  }

  const rawPayload = readJson(gapActionsPath);
  const actions = normalizeGapActions(rawPayload);

  if (actions.length === 0) {
    writeJson("artifacts/exploration/option_matrix.json", {
      generated_by: "runDesignExploration",
      source_artifact: gapActionsPath,
      total_items: 0,
      items: []
    });

    writeText(
      "artifacts/exploration/exploration_report.md",
      "# Design Exploration Report\n\nNo actionable entries were found in artifacts/gap/gap_actions.json.\n"
    );

    return {
      blocked: false,
      artifact: "artifacts/exploration/exploration_report.md",
      outputs: {
        md: "artifacts/exploration/exploration_report.md",
        json: "artifacts/exploration/option_matrix.json"
      },
      status_patch: {
        next_step: "MODULE FLOW — Design Exploration COMPLETE. Next=Decision Gate."
      }
    };
  }

  const optionMatrix = actions.map((action, index) => buildOptionsForAction(action, index));

  writeJson("artifacts/exploration/option_matrix.json", {
    generated_by: "runDesignExploration",
    source_artifact: gapActionsPath,
    total_items: optionMatrix.length,
    items: optionMatrix
  });

  writeText(
    "artifacts/exploration/exploration_report.md",
    renderReport(optionMatrix)
  );

  return {
    blocked: false,
    artifact: "artifacts/exploration/exploration_report.md",
    outputs: {
      md: "artifacts/exploration/exploration_report.md",
      json: "artifacts/exploration/option_matrix.json"
    },
    status_patch: {
      next_step: "MODULE_FLOW — Design Exploration COMPLETE. Next=Decision Gate."
    }
  };
}

module.exports = {
  runDesignExploration
};