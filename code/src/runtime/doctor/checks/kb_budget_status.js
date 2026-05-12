"use strict";

const path = require("path");
const fs   = require("fs");

module.exports = {
  id: "kb_budget_status",

  async fn(options) {
    const root = (options && options.root) || process.cwd();

    let projectId;
    try {
      const statusPath = path.resolve(root, "progress/status.json");
      if (!fs.existsSync(statusPath)) {
        return { id: "kb_budget_status", status: "PASS", detail: "progress/status.json not found (idle)" };
      }
      const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
      projectId = status.current_project_id || null;
    } catch (err) {
      return { id: "kb_budget_status", status: "WARN", detail: "cannot read status.json: " + err.message };
    }

    if (!projectId) {
      return { id: "kb_budget_status", status: "PASS", detail: "no active project (idle)" };
    }

    try {
      const { checkBudget } = require("../kb/budget_guard");
      const result = checkBudget(projectId, { root });
      const pct    = Math.round(result.ratio * 100);
      const detail = "project=" + projectId +
        " spent=$" + result.total_usd.toFixed(4) +
        " / $" + result.budget_usd.toFixed(2) +
        " (" + pct + "%) [" + result.status + "]";

      if (result.status === "EXCEEDED") {
        return { id: "kb_budget_status", status: "WARN", detail };
      }
      return { id: "kb_budget_status", status: "PASS", detail };
    } catch (err) {
      return { id: "kb_budget_status", status: "SKIP", detail: "budget_guard error: " + err.message };
    }
  }
};
