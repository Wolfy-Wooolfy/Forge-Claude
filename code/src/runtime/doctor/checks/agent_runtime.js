"use strict";

module.exports = {
  id: "agent_runtime",

  async fn(options) {
    const root = (options && options.root) || process.cwd();

    // 1. Registry loads and registers ≥1 adapter
    let adapterMap;
    try {
      const { getAdapters } = require("../../agents/_adapter_registry");
      adapterMap = getAdapters();
    } catch (err) {
      return { id: "agent_runtime", status: "FAIL",
        detail: "Failed to load agent adapter registry: " + err.message };
    }

    if (adapterMap.size === 0) {
      return { id: "agent_runtime", status: "FAIL",
        detail: "Agent adapter registry loaded but contains 0 adapters" };
    }

    // 2. Mock adapter is always available
    const mockAdapter = adapterMap.get("mock");
    if (!mockAdapter) {
      return { id: "agent_runtime", status: "FAIL",
        detail: "mock adapter not found in registry" };
    }

    let mockAvailable = false;
    try {
      mockAvailable = await mockAdapter.available();
    } catch (err) {
      return { id: "agent_runtime", status: "FAIL",
        detail: "mock adapter.available() threw: " + err.message };
    }

    if (!mockAvailable) {
      return { id: "agent_runtime", status: "FAIL",
        detail: "mock adapter reports unavailable (should always be available)" };
    }

    // 3. Cost ledger is writable
    let ledgerWritable = false;
    try {
      const { isLedgerWritable } = require("../../agents/cost_ledger");
      ledgerWritable = isLedgerWritable({ root });
    } catch (err) {
      return { id: "agent_runtime", status: "WARN",
        detail: "cost_ledger module failed to load: " + err.message };
    }

    if (!ledgerWritable) {
      return { id: "agent_runtime", status: "WARN",
        detail: "cost ledger path is not writable (artifacts/agent/cost_ledger.jsonl)" };
    }

    // 4. Budget enforcer module loads
    try {
      require("../../agents/budget_enforcer");
    } catch (err) {
      return { id: "agent_runtime", status: "FAIL",
        detail: "budget_enforcer failed to load: " + err.message };
    }

    // 5. agent.invoke is registered in tool registry
    try {
      const { createRegistry } = require("../../tools/_registry");
      const reg = createRegistry({ root });
      reg.load();
      if (!reg.has("agent.invoke")) {
        return { id: "agent_runtime", status: "WARN",
          detail: "agent.invoke not found in tool registry" };
      }
    } catch (err) {
      return { id: "agent_runtime", status: "FAIL",
        detail: "Tool registry check failed: " + err.message };
    }

    // 6. Count available real providers (warn if none — normal in CI without API keys)
    const available_adapters = [];
    for (const [id, adapter] of adapterMap) {
      try {
        if (await adapter.available()) available_adapters.push(id);
      } catch {}
    }

    const adapterIds = Array.from(adapterMap.keys()).join(", ");

    if (!available_adapters.includes("mock")) {
      return { id: "agent_runtime", status: "FAIL",
        detail: "mock adapter not available even after check" };
    }

    const realProviders = available_adapters.filter(id => id !== "mock");

    if (realProviders.length === 0) {
      return { id: "agent_runtime", status: "PASS",
        detail: adapterMap.size + " adapters registered (" + adapterIds +
                "); mock available; no real API providers configured (expected in CI)" };
    }

    return { id: "agent_runtime", status: "PASS",
      detail: adapterMap.size + " adapters registered (" + adapterIds +
              "); available: " + available_adapters.join(", ") +
              "; agent.invoke OK; cost ledger writable; budget enforcer OK" };
  }
};
