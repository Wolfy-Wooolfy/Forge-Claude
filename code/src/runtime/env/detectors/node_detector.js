"use strict";

const { ok } = require("../_contract");

module.exports = {
  id:    "node",
  label: "Node.js",

  async detect() {
    return ok("node", {
      version:    process.version,
      executable: process.execPath
    });
  }
};
