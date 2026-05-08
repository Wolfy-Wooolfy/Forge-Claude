"use strict";

const fs   = require("fs");
const path = require("path");

module.exports = {
  id:          "active_project",
  description: "Active project pointer consistent with filesystem",
  fn(ctx) {
    const ptrPath = path.join(ctx.root, "progress", "active_project.txt");

    if (!fs.existsSync(ptrPath)) {
      return { status: "PASS", detail: "no active project (idle)" };
    }

    let id;
    try {
      id = fs.readFileSync(ptrPath, "utf8").trim();
    } catch (err) {
      return { status: "WARN", detail: "could not read active_project.txt: " + err.message };
    }

    if (!id) {
      return { status: "PASS", detail: "no active project (idle)" };
    }

    const projectDir = path.join(ctx.root, "artifacts", "projects", id);
    if (!fs.existsSync(projectDir)) {
      return {
        status: "WARN",
        detail: "active_project=" + id + " but directory not found: artifacts/projects/" + id
      };
    }

    return { status: "PASS", detail: "active=" + id };
  }
};
