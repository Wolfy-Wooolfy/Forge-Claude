"use strict";

module.exports = {
  id:          "node_version",
  description: "Node.js runtime >= 20.0.0",
  fn(/* ctx */) {
    const raw     = process.versions.node;          // e.g. "20.11.0"
    const parts   = raw.split(".").map(Number);
    const major   = parts[0] || 0;
    const ok      = major >= 20;
    return ok
      ? { status: "PASS", detail: "v" + raw }
      : { status: "FAIL", detail: "v" + raw + " < required v20.0.0" };
  }
};
