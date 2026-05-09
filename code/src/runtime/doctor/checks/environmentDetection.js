"use strict";

module.exports = {
  id: "environment_detection",

  async fn(options) {
    const root = (options && options.root) || process.cwd();

    // 1. Detector registry loads >= 11 detectors
    let detectors;
    try {
      const { getDetectors } = require("../../env/_detector_registry");
      detectors = getDetectors();
    } catch (err) {
      return { id: "environment_detection", status: "FAIL",
        detail: "Failed to load detector registry: " + err.message };
    }

    if (detectors.size < 11) {
      return { id: "environment_detection", status: "FAIL",
        detail: "Expected >= 11 detectors, got " + detectors.size };
    }

    // 2. os detector present and callable
    const osDet = detectors.get("os");
    if (!osDet || typeof osDet.detect !== "function") {
      return { id: "environment_detection", status: "FAIL",
        detail: "os detector missing or not callable" };
    }

    // 3. env.probe_binary registered in tool registry
    try {
      const { createRegistry } = require("../../tools/_registry");
      const reg = createRegistry({ root });
      reg.load();
      if (!reg.has("env.probe_binary")) {
        return { id: "environment_detection", status: "FAIL",
          detail: "env.probe_binary not registered in tool registry" };
      }
    } catch (err) {
      return { id: "environment_detection", status: "FAIL",
        detail: "Tool registry check failed: " + err.message };
    }

    return { id: "environment_detection", status: "PASS",
      detail: detectors.size + " detectors registered; os detector callable; env.probe_binary registered" };
  }
};
