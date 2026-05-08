"use strict";

// Explicit registration — deterministic order, no directory scan.
// If any require() fails, the whole registry throws (fail-closed per SCHEMA §8).

const checks = [
  require("./checks/nodeVersion"),
  require("./checks/openaiApiKey"),
  require("./checks/envDotfile"),
  require("./checks/apiServerPort"),
  require("./checks/webServerPort"),
  require("./checks/providersRegistered"),
  require("./checks/toolsRegistered"),
  require("./checks/permissionMode"),
  require("./checks/statusJsonValid"),
  require("./checks/activeProject"),
  require("./checks/missingDependencies"),
  require("./checks/recentExecution"),
  require("./checks/diskSpace"),
  require("./checks/traceMatrixSize")
];

function listChecks()  { return checks.slice(); }
function listCheckIds() { return checks.map((c) => c.id); }

module.exports = { listChecks, listCheckIds };
