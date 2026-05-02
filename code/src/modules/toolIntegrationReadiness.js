"use strict";

// Verifies tool layer completeness before chat interface is active
// Checks that all required providers, modules, and routes are registered

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

const REQUIRED_PROVIDERS = [
  "code/src/providers/openAiRequirementsProvider.js",
  "code/src/providers/openAiDocumentationProvider.js",
  "code/src/providers/documentationReviewProvider.js",
  "code/src/providers/providerRouter.js"
];

const REQUIRED_MODULES = [
  "code/src/modules/auditEngine.js",
  "code/src/modules/gapEngine.js",
  "code/src/modules/verifyEngine.js",
  "code/src/modules/visionComplianceGate.js",
  "code/src/modules/visionAlignmentValidator.js",
  "code/src/modules/crossDocConsistencyEngine.js",
  "code/src/modules/codeToSpecTraceValidator.js",
  "code/src/modules/docsGapAnalyzerValidator.js",
  "code/src/modules/cognitiveLayerContractEnforcer.js",
  "code/src/modules/providerAuthorityEnforcer.js",
  "code/src/modules/loopEnforcementOrchestrator.js",
  "code/src/modules/specCompletenessEnforcer.js",
  "code/src/modules/boundaryAuditStageGate.js",
  "code/src/modules/decisionArtifactValidator.js",
  "code/src/modules/docGapLoopContract.js"
];

const REQUIRED_AI_OS = [
  "code/src/ai_os/projectRuntime.js",
  "code/src/ai_os/conversationEngine.js",
  "code/src/ai_os/discussionLoopGate.js",
  "code/src/ai_os/documentationBuildLoop.js",
  "code/src/ai_os/verificationLoop.js"
];

const REQUIRED_API_ROUTES = [
  { route: "/api/ai-os/intake", method: "POST" },
  { route: "/api/ai-os/chat", method: "POST" },
  { route: "/api/ai-os/verify", method: "POST" },
  { route: "/api/governance/vision-compliance", method: "POST" },
  { route: "/api/governance/spec-completeness", method: "POST" }
];

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function checkFilesExist(root, fileList, category) {
  const results = [];
  for (const rel of fileList) {
    const abs = path.join(root, rel);
    const exists = fs.existsSync(abs);
    results.push({ file: rel, exists, category });
  }
  return results;
}

function checkRequiredRoutes(root, routes) {
  const apiServerPath = path.join(root, "code/src/workspace/apiServer.js");
  if (!fs.existsSync(apiServerPath)) {
    return routes.map((r) => ({ ...r, registered: false, reason: "apiServer.js not found" }));
  }

  const content = fs.readFileSync(apiServerPath, "utf-8");
  return routes.map((r) => ({
    ...r,
    registered: content.includes(`"${r.route}"`) || content.includes(`'${r.route}'`)
  }));
}

function runToolIntegrationReadiness(options = {}) {
  const root = String(options.root || ROOT);
  const outputPath = path.join(root, "artifacts", "verify", "tool_integration_readiness_report.json");

  const providerChecks = checkFilesExist(root, REQUIRED_PROVIDERS, "provider");
  const moduleChecks = checkFilesExist(root, REQUIRED_MODULES, "module");
  const aiOsChecks = checkFilesExist(root, REQUIRED_AI_OS, "ai_os");
  const routeChecks = checkRequiredRoutes(root, REQUIRED_API_ROUTES);

  const missingFiles = [...providerChecks, ...moduleChecks, ...aiOsChecks].filter((c) => !c.exists);
  const missingRoutes = routeChecks.filter((r) => !r.registered);

  const passed = missingFiles.length === 0 && missingRoutes.length === 0;

  const artifact = {
    timestamp_utc: nowIso(),
    providers_checked: providerChecks.length,
    modules_checked: moduleChecks.length,
    ai_os_checked: aiOsChecks.length,
    routes_checked: routeChecks.length,
    missing_files: missingFiles.length,
    missing_routes: missingRoutes.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed
      ? "Tool integration complete — chat interface is ready"
      : `Tool integration INCOMPLETE — ${missingFiles.length} missing file(s), ${missingRoutes.length} missing route(s)`,
    providers: providerChecks,
    modules: moduleChecks,
    ai_os: aiOsChecks,
    routes: routeChecks
  };

  writeJson(outputPath, artifact);

  const blockingMessages = [];
  if (missingFiles.length > 0) {
    blockingMessages.push(`Missing files: ${missingFiles.map((f) => f.file).join(", ")}`);
  }
  if (missingRoutes.length > 0) {
    blockingMessages.push(`Unregistered routes: ${missingRoutes.map((r) => r.route).join(", ")}`);
  }

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/tool_integration_readiness_report.json",
    blocked: !passed,
    missing_files: missingFiles.length,
    missing_routes: missingRoutes.length,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Tool Integration Readiness: PASS — all tools available" }
      : { blocking_questions: blockingMessages, next_step: "" }
  };
}

module.exports = { runToolIntegrationReadiness, REQUIRED_PROVIDERS, REQUIRED_MODULES, REQUIRED_AI_OS };
