"use strict";

module.exports = {
  id: "roles_runtime",

  async fn(options) {
    // 1. Role registry loads without error
    let roles;
    try {
      const { listRoles, resetRoleCache } = require("../../agents/_role_registry");
      resetRoleCache();
      roles = listRoles();
    } catch (err) {
      return { id: "roles_runtime", status: "FAIL",
        detail: "Role registry failed to load: " + err.message };
    }

    if (roles.length === 0) {
      return { id: "roles_runtime", status: "FAIL",
        detail: "Role registry loaded but contains 0 roles" };
    }

    // 2. Required roles are registered
    const REQUIRED_ROLES = [
      "architect", "spec_writer", "reviewer", "builder",
      "security_auditor", "test_designer",
      "cost_estimator", "environment", "documentation", "deployment", "quality_judge",
      "research"
    ];
    const roleIds = roles.map(r => r.id);

    for (const required of REQUIRED_ROLES) {
      if (!roleIds.includes(required)) {
        return { id: "roles_runtime", status: "FAIL",
          detail: "Required role '" + required + "' not found in registry" };
      }
    }

    // 3. Each role has a valid run function and required fields
    for (const role of roles) {
      if (typeof role.run !== "function") {
        return { id: "roles_runtime", status: "FAIL",
          detail: "Role '" + role.id + "' is missing run() function" };
      }
      if (!role.input_schema || typeof role.input_schema !== "object") {
        return { id: "roles_runtime", status: "FAIL",
          detail: "Role '" + role.id + "' is missing valid input_schema" };
      }
      if (!role.output_schema || typeof role.output_schema !== "object") {
        return { id: "roles_runtime", status: "FAIL",
          detail: "Role '" + role.id + "' is missing valid output_schema" };
      }
    }

    // 4. role.invoke is registered in tool registry
    try {
      const { createRegistry } = require("../../tools/_registry");
      const reg = createRegistry({ root: (options && options.root) || process.cwd() });
      reg.load();
      if (!reg.has("role.invoke")) {
        return { id: "roles_runtime", status: "FAIL",
          detail: "role.invoke not found in tool registry" };
      }
    } catch (err) {
      return { id: "roles_runtime", status: "FAIL",
        detail: "Tool registry check failed: " + err.message };
    }

    return { id: "roles_runtime", status: "PASS",
      detail: roles.length + " roles registered (" + roleIds.join(", ") + "); role.invoke OK" };
  }
};
