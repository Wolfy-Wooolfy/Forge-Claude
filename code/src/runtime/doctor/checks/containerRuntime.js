"use strict";

module.exports = {
  id: "container_runtime",

  async fn(options) {
    const root = (options && options.root) || process.cwd();

    // 1. Container runtime registry loads and registers ≥1 adapter
    let runtimeMap;
    try {
      const { getRuntimes } = require("../../container/_runtime_registry");
      runtimeMap = getRuntimes();
    } catch (err) {
      return { id: "container_runtime", status: "FAIL",
        detail: "Failed to load container runtime registry: " + err.message };
    }

    if (runtimeMap.size === 0) {
      return { id: "container_runtime", status: "FAIL",
        detail: "Container runtime registry loaded but contains 0 adapters" };
    }

    // 2. Privilege invariant: no warnings about forbidden tokens at registration time
    try {
      const { getWarnings } = require("../../container/_runtime_registry");
      const warns = getWarnings().filter(w => w.includes("privilege invariant"));
      if (warns.length > 0) {
        return { id: "container_runtime", status: "FAIL",
          detail: "Privilege invariant violated at registration: " + warns.join("; ") };
      }
    } catch {}

    // 3. container.run is registered in tool registry
    try {
      const { createRegistry } = require("../../tools/_registry");
      const reg = createRegistry({ root });
      reg.load();
      if (!reg.has("container.run")) {
        return { id: "container_runtime", status: "WARN",
          detail: "container.run not found in tool registry" };
      }
    } catch (err) {
      return { id: "container_runtime", status: "FAIL",
        detail: "Tool registry check failed: " + err.message };
    }

    // 4. Privilege guard loads and exposes required functions
    try {
      const guard = require("../../container/_privilege_guard");
      if (typeof guard.inspectInput !== "function" || typeof guard.inspectArgv !== "function") {
        return { id: "container_runtime", status: "FAIL",
          detail: "Privilege guard missing inspectInput or inspectArgv" };
      }
    } catch (err) {
      return { id: "container_runtime", status: "FAIL",
        detail: "Privilege guard failed to load: " + err.message };
    }

    // 5. Detect available runtimes (WARN if none — expected in CI without docker/podman)
    const available_runtimes = [];
    for (const [id, adapter] of runtimeMap) {
      try {
        if (await adapter.available()) available_runtimes.push(id);
      } catch {}
    }

    const adapterIds = Array.from(runtimeMap.keys()).join(", ");

    if (available_runtimes.length === 0) {
      return { id: "container_runtime", status: "WARN",
        detail: runtimeMap.size + " adapter(s) registered (" + adapterIds +
                "); none available (docker/podman daemon not running — expected in CI)" };
    }

    return { id: "container_runtime", status: "PASS",
      detail: "Runtime(s) available: " + available_runtimes.join(", ") +
              "; " + runtimeMap.size + " registered; container.run OK; privilege guard OK" };
  }
};
