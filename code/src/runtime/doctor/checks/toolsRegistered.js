"use strict";

const path = require("path");

module.exports = {
  id:          "tools_registered",
  description: "Tool registry loads with at least 1 tool registered",
  fn(ctx) {
    try {
      const { createRegistry } = require(
        path.join(ctx.root, "code", "src", "runtime", "tools", "_registry")
      );
      // Use a fresh isolated registry pointing at the real tools dir
      const reg = createRegistry({
        root:      ctx.root,
        tools_dir: path.join(ctx.root, "code", "src", "runtime", "tools")
      });
      reg.load();
      const summary = reg.healthSummary();
      const total   = summary.total || 0;

      if (total === 0) {
        return { status: "FAIL", detail: "tool registry loaded but 0 tools registered" };
      }
      return { status: "PASS", detail: total + " tools registered" };
    } catch (err) {
      return { status: "FAIL", detail: "tool registry load failed: " + err.message };
    }
  }
};
