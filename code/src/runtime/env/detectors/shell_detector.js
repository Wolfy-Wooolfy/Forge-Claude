"use strict";

const { ok, notFound } = require("../_contract");

module.exports = {
  id:    "shell",
  label: "Shell",

  async detect() {
    const shellEnv = process.env.SHELL || process.env.ComSpec || process.env.COMSPEC || null;
    if (!shellEnv) return notFound("shell", "No SHELL or ComSpec env var found");
    return ok("shell", { path: shellEnv });
  }
};
