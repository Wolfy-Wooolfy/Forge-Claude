"use strict";

// W-03: this check reads ONLY FORGE_PERMISSION_MODE and FORGE_ALLOW_SELF_MODIFY.
// Reading FORGE_DECISION_OVERRIDE here is a contract violation (see SCHEMA §9).

module.exports = {
  id:          "permission_mode",
  description: "Active permission mode (DANGER_FULL_ACCESS triggers WARN)",
  fn(/* ctx */) {
    const raw  = String(process.env.FORGE_PERMISSION_MODE || "WORKSPACE_WRITE").toUpperCase().trim();
    const self = String(process.env.FORGE_ALLOW_SELF_MODIFY || "");

    if (raw === "DANGER_FULL_ACCESS") {
      const selfNote = self === "1" ? " + FORGE_ALLOW_SELF_MODIFY=1" : "";
      return {
        status: "WARN",
        detail: "mode active: DANGER_FULL_ACCESS" + selfNote + " — elevated risk"
      };
    }

    return { status: "PASS", detail: "mode active: " + raw };
  }
};
