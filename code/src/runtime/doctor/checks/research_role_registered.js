"use strict";

module.exports = {
  id: "research_role_registered",

  async fn() {
    try {
      const { resetRoleCache, pickRole } = require("../../agents/_role_registry");
      resetRoleCache();
      const role = pickRole("research");

      if (!role) {
        return { id: "research_role_registered", status: "FAIL",
          detail: "research role not found in registry" };
      }

      if (role.system_prompt_id !== "research_v1") {
        return { id: "research_role_registered", status: "FAIL",
          detail: "research role has wrong system_prompt_id: " + role.system_prompt_id };
      }

      return { id: "research_role_registered", status: "PASS",
        detail: "research role registered; system_prompt_id=research_v1; authority=" + role.authority_level };
    } catch (err) {
      return { id: "research_role_registered", status: "FAIL",
        detail: "registry error: " + err.message };
    }
  }
};
