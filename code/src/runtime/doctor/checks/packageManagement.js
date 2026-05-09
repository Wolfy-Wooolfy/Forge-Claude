"use strict";

module.exports = {
  id: "package_management",

  async fn(options) {
    const root = (options && options.root) || process.cwd();

    // 1. Adapter registry loads >= 9 adapters
    let adapters;
    try {
      const { getAdapters } = require("../../pkg/_adapter_registry");
      adapters = getAdapters();
    } catch (err) {
      return { id: "package_management", status: "FAIL",
        detail: "Failed to load adapter registry: " + err.message };
    }

    if (adapters.size < 9) {
      return { id: "package_management", status: "WARN",
        detail: "Expected >= 9 adapters, got " + adapters.size + " (some may be unavailable)" };
    }

    // 2. Tier split: >= 6 Tier-1, >= 3 Tier-2
    let tier1 = 0;
    let tier2 = 0;
    for (const a of adapters.values()) {
      if (a.tier === 1) tier1++;
      if (a.tier === 2) tier2++;
    }
    if (tier1 < 6 || tier2 < 3) {
      return { id: "package_management", status: "WARN",
        detail: "Tier split unexpected: Tier-1=" + tier1 + " Tier-2=" + tier2 };
    }

    // 3. pkg.install registered in tool registry
    try {
      const { createRegistry } = require("../../tools/_registry");
      const reg = createRegistry({ root });
      reg.load();
      if (!reg.has("pkg.install")) {
        return { id: "package_management", status: "FAIL",
          detail: "pkg.install not registered in tool registry" };
      }
    } catch (err) {
      return { id: "package_management", status: "FAIL",
        detail: "Tool registry check failed: " + err.message };
    }

    // 4. No Tier-3 (sudo) adapters registered
    const { getWarnings } = require("../../pkg/_adapter_registry");
    const warns = getWarnings();
    const sudoWarns = warns.filter(w => w.includes("privilege-escalation"));
    if (sudoWarns.length > 0) {
      return { id: "package_management", status: "FAIL",
        detail: "Privilege escalation detected in adapters: " + sudoWarns.join("; ") };
    }

    return { id: "package_management", status: "PASS",
      detail: adapters.size + " adapters (Tier-1: " + tier1 + ", Tier-2: " + tier2 + "); pkg.install registered; no sudo adapters" };
  }
};
