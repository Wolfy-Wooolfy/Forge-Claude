"use strict";

const path = require("path");

module.exports = {
  id:          "shell_hardening",
  description: "Shell execution layer hardening: run_with_prompt registered, vision lock rule active, sudo/su in HARD_DENY_ARGV0",
  fn(ctx) {
    const issues = [];

    try {
      // Check 1: shell.run_with_prompt registered in tool registry
      const { createRegistry } = require(
        path.join(ctx.root, "code", "src", "runtime", "tools", "_registry")
      );
      const reg = createRegistry({ root: ctx.root });
      reg.load();
      if (!reg.has("shell.run_with_prompt")) {
        issues.push("shell.run_with_prompt not registered in tool registry");
      }
    } catch (err) {
      issues.push("tool registry check failed: " + err.message);
    }

    try {
      // Check 2: HARD_DENY_ARGV0 includes sudo and su
      const { HARD_DENY_ARGV0 } = require(
        path.join(ctx.root, "code", "src", "runtime", "tools", "shell_tools")
      );
      if (!HARD_DENY_ARGV0.includes("sudo")) issues.push("sudo missing from HARD_DENY_ARGV0");
      if (!HARD_DENY_ARGV0.includes("su"))   issues.push("su missing from HARD_DENY_ARGV0");
    } catch (err) {
      issues.push("shell_tools check failed: " + err.message);
    }

    try {
      // Check 3: shell_vision_lock_rule loadable
      require(
        path.join(ctx.root, "code", "src", "runtime", "permission", "rules", "shell_vision_lock_rule")
      );
    } catch (err) {
      issues.push("shell_vision_lock_rule not loadable: " + err.message);
    }

    if (issues.length > 0) {
      return { status: "FAIL", detail: issues.join("; ") };
    }
    return { status: "PASS", detail: "shell.run_with_prompt registered, sudo/su hard-denied, vision lock rule present" };
  }
};
