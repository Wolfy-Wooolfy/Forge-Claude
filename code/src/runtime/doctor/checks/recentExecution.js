"use strict";

const fs   = require("fs");
const path = require("path");

const STALE_DAYS = 7;

module.exports = {
  id:          "recent_execution",
  description: "Tool audit log modified within last 7 days (or fresh install)",
  fn(ctx) {
    const auditPath = path.join(ctx.root, "artifacts", "audit", "tool_audit.jsonl");

    if (!fs.existsSync(auditPath)) {
      return { status: "PASS", detail: "no tool_audit.jsonl (fresh install)" };
    }

    let stat;
    try {
      stat = fs.statSync(auditPath);
    } catch (err) {
      return { status: "WARN", detail: "could not stat tool_audit.jsonl: " + err.message };
    }

    const ageMs   = Date.now() - stat.mtimeMs;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays > STALE_DAYS) {
      return {
        status: "WARN",
        detail: "tool_audit.jsonl last modified " + Math.floor(ageDays) + " days ago (> " + STALE_DAYS + ")"
      };
    }

    return {
      status: "PASS",
      detail: "tool_audit.jsonl modified " + Math.floor(ageDays) + " day(s) ago"
    };
  }
};
