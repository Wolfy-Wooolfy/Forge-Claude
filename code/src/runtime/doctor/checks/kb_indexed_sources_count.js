"use strict";

const path = require("path");
const fs   = require("fs");

module.exports = {
  id: "kb_indexed_sources_count",

  async fn(options) {
    const root = (options && options.root) || process.cwd();

    let projectId;
    try {
      const statusPath = path.resolve(root, "progress/status.json");
      if (!fs.existsSync(statusPath)) {
        return { id: "kb_indexed_sources_count", status: "PASS", detail: "progress/status.json not found (idle)" };
      }
      const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
      projectId = status.current_project_id || null;
    } catch (err) {
      return { id: "kb_indexed_sources_count", status: "WARN", detail: "cannot read status.json: " + err.message };
    }

    if (!projectId) {
      return { id: "kb_indexed_sources_count", status: "PASS", detail: "no active project (idle)" };
    }

    try {
      const { readSources } = require("../kb/manifests");
      const sources = readSources(projectId, "project", { root });
      return {
        id:     "kb_indexed_sources_count",
        status: "PASS",
        detail: "project=" + projectId + " sources_indexed=" + sources.length
      };
    } catch (err) {
      return { id: "kb_indexed_sources_count", status: "WARN", detail: "manifests error: " + err.message };
    }
  }
};
