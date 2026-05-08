"use strict";

const fs   = require("fs");
const path = require("path");

const REQUIRED_FIELDS = ["schema_version", "current_task", "next_phase"];

module.exports = {
  id:          "status_json_valid",
  description: "progress/status.json is present, parseable, and v2.0",
  fn(ctx) {
    const filePath = path.join(ctx.root, "progress", "status.json");

    if (!fs.existsSync(filePath)) {
      return { status: "FAIL", detail: "progress/status.json not found" };
    }

    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      return { status: "FAIL", detail: "parse error: " + err.message };
    }

    for (const field of REQUIRED_FIELDS) {
      if (data[field] === undefined || data[field] === null) {
        return { status: "FAIL", detail: "missing required field: " + field };
      }
    }

    if (data.schema_version !== "2.0") {
      return {
        status: "WARN",
        detail: "schema_version=" + data.schema_version + " (expected 2.0)"
      };
    }

    return {
      status: "PASS",
      detail: "valid v2.0, current_task=" + data.current_task
    };
  }
};
