"use strict";

const path = require("path");

module.exports = {
  id:          "providers_registered",
  description: "Provider registry loads and all providers validate",
  fn(ctx) {
    try {
      const { createRegistry } = require(
        path.join(ctx.root, "code", "src", "providers", "_contract", "providerRegistry")
      );
      const reg = createRegistry({ root: ctx.root });
      reg.load();
      const summary = reg.healthSummary();
      const total   = summary.total || 0;
      const legacy  = summary.legacy || 0;

      if (total === 0) {
        return { status: "FAIL", detail: "no providers registered" };
      }
      if (legacy > 0) {
        return {
          status: "WARN",
          detail: total + " registered, " + legacy + " legacy (not yet v2-compliant)"
        };
      }
      return { status: "PASS", detail: total + "/" + total + " v2-compliant" };
    } catch (err) {
      return { status: "FAIL", detail: "providerRegistry load failed: " + err.message };
    }
  }
};
