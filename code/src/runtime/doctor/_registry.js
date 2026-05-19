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
  require("./checks/traceMatrixSize"),
  require("./checks/shellHardening"),
  require("./checks/environmentDetection"),
  require("./checks/packageManagement"),
  require("./checks/containerRuntime"),
  require("./checks/agent_runtime"),
  require("./checks/roles_runtime"),
  require("./checks/builtproject_runtime"),
  require("./checks/orchestration_runtime"),
  require("./checks/kb_budget_status"),
  require("./checks/kb_indexed_sources_count"),
  require("./checks/research_role_registered"),
  require("./checks/service_lifecycle"),
  require("./checks/secrets_in_env_var"),
  require("./checks/backup_status"),
  require("./checks/logging_status"),
  require("./checks/metrics_available"),
  require("./checks/alert_webhook")
];

function listChecks()  { return checks.slice(); }
function listCheckIds() { return checks.map((c) => c.id); }

module.exports = { listChecks, listCheckIds };
