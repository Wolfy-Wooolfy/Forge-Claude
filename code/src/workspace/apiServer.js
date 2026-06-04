"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const { handleAuthRequest } = require("../auth/authSystem");
const { createAiOsRuntime } = require("../ai_os/projectRuntime");
const { createActiveProjectManager } = require("../ai_os/activeProjectManager");
const { createBusinessAnalysisEngine } = require("../ai_os/businessAnalysisEngine");
const { createVerificationLoop } = require("../ai_os/verificationLoop");
const { createProjectReviewEngine } = require("../ai_os/projectReviewEngine");
const { createDeliveryPackageBuilder } = require("../ai_os/deliveryPackageBuilder");
const { createIdeationEngine } = require("../ai_os/ideationEngine");
const { createConversationEngine } = require("../ai_os/conversationEngine");
const { processIntakeRequest,
        hasActiveIntakeSession }    = require("../ai_os/intake_conversation_handler");
const { createConversationMemoryManager } = require("../ai_os/conversationMemoryManager");
const { createDocumentationBuildLoop } = require("../ai_os/documentationBuildLoop");
const { runVisionComplianceGate } = require("../modules/visionComplianceGate");
const { runSpecCompletenessEnforcer } = require("../modules/specCompletenessEnforcer");
const { getDefaultRegistry } = require("../runtime/tools/_registry");
const {
  uniqueLower, normalizeRelativePath, assertApproverRoleAllowed, buildDecisionBatchStats,
  sha256, buildSimpleDiff, detectOperationType, readJsonSafe, readTextSafe,
  buildRequestAwareFileContext, normalizePatchOperations, interpretUserIntent,
  toPascalCase, buildSmartProposalCode, buildCodeAwareEditProposal, scanProjectFiles,
  resolveTargetFileForRequest, buildStrategyCandidates, buildFileTypeAwareProposal,
  normalizeProjectId, normalizeProjectName, buildProjectId, getProjectStateRel,
  getProjectDecisionLinksRel, getProjectExecutionPackageRel, renderDecisionPacketMd,
  buildExecutionPackage
} = require("./workspaceHelpers");
const ProviderRouter = require("../providers/providerRouter");

function isWithin(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) || relative === "";
}

// Injects <script>window.__FORGE_TOKEN__="TOKEN";</script> into <head>
// BEFORE the first <script type="module"> tag (guarantees token is set before
// React executes). Falls back to before </head> if no module script found.
function _injectForgeToken(html, token) {
  const tag = `<script>window.__FORGE_TOKEN__="${token}";</script>`;
  const moduleIdx = html.indexOf('<script type="module"');
  if (moduleIdx !== -1) {
    return html.slice(0, moduleIdx) + tag + html.slice(moduleIdx);
  }
  const headEndIdx = html.indexOf('</head>');
  if (headEndIdx !== -1) {
    return html.slice(0, headEndIdx) + tag + html.slice(headEndIdx);
  }
  return html;
}

function createWorkspaceApiServer(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const port = Number(options.port || process.env.FORGE_WORKSPACE_API_PORT || 3100);

  let _activeToken = null;

  const llmRoot = path.resolve(root, "artifacts/llm");
  const decisionsRoot = path.resolve(root, "artifacts/decisions");
  const approvalPolicyPath = path.resolve(root, "artifacts/llm/approval_policy.json");

  const aiRoot = path.resolve(root, "artifacts/ai");
  const aiConversationsRoot = path.resolve(aiRoot, "conversations");
  const aiContextRoot = path.resolve(aiRoot, "context");
  const aiAnalysisRoot = path.resolve(aiRoot, "analysis");

  const projectsRoot = path.resolve(root, "artifacts/projects");
  const activeProjectPath = path.resolve(projectsRoot, "active_project.json");
  const projectRegistryPath = path.resolve(projectsRoot, "project_registry.json");

  const aiOsRuntime = createAiOsRuntime({ root });
  const activeProjectManager = createActiveProjectManager({ root });
  const businessAnalysisEngine = createBusinessAnalysisEngine({ root });
  const verificationLoop = createVerificationLoop({ root });
  const projectReviewEngine = createProjectReviewEngine({ root });
  const deliveryPackageBuilder = createDeliveryPackageBuilder({ root });
  const ideationEngine = createIdeationEngine({ root });
  const conversationMemoryManager = createConversationMemoryManager({ root });
  const conversationEngine = createConversationEngine({ root, ideationEngine, conversationMemoryManager });
  const documentationBuildLoop = createDocumentationBuildLoop({ root });

  const allowedWriteRoots = [
    path.resolve(root, "artifacts/llm"),
    path.resolve(root, "web"),
    path.resolve(root, "code/tools"),
    path.resolve(root, "code")
  ];

  function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(JSON.stringify(payload, null, 2));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on("error", reject);
    });
  }

  // §ARC-8: fs.write_file tool is text-only; binary upload requires raw Buffer — exempt from L2 tool routing
  function readBinaryBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => { chunks.push(chunk); });
      req.on("end", () => { resolve(Buffer.concat(chunks)); });
      req.on("error", reject);
    });
  }

  function loadApprovalPolicy() {
    const fallback = {
      version: "1.1",
      available_roles: ["cto"],
      default_required_roles: ["cto"],
      max_files_per_decision: 10,
      max_total_bytes_per_decision: 200000,
      path_rules: []
    };

    if (!fs.existsSync(approvalPolicyPath)) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(approvalPolicyPath, "utf-8"));

      return {
        version: typeof parsed.version === "string" ? parsed.version : "1.1",
        available_roles: uniqueLower(parsed.available_roles),
        default_required_roles: uniqueLower(parsed.default_required_roles).length > 0
          ? uniqueLower(parsed.default_required_roles)
          : ["cto"],
        max_files_per_decision:
          Number.isInteger(parsed.max_files_per_decision) && parsed.max_files_per_decision > 0
            ? parsed.max_files_per_decision
            : 10,
        max_total_bytes_per_decision:
          Number.isInteger(parsed.max_total_bytes_per_decision) && parsed.max_total_bytes_per_decision > 0
            ? parsed.max_total_bytes_per_decision
            : 200000,
        path_rules: Array.isArray(parsed.path_rules)
          ? parsed.path_rules.map((rule) => ({
              match_prefix: typeof rule.match_prefix === "string" ? rule.match_prefix.trim().replace(/\\/g, "/") : "",
              required_roles: uniqueLower(rule.required_roles)
            })).filter((rule) => rule.match_prefix && rule.required_roles.length > 0)
          : []
      };
    } catch (err) {
      return fallback;
    }
  }

  function isPathAllowed(absPath) {
    return allowedWriteRoots.some((allowedRoot) => absPath === allowedRoot || absPath.startsWith(`${allowedRoot}${path.sep}`));
  }

  function normalizeDraftFiles(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("Draft contains no files");
    }

    return files.map((file) => {
      const relPath = normalizeRelativePath(file && file.path ? file.path : "");
      const absolutePath = path.resolve(root, relPath);

      if (!relPath) {
        throw new Error("Draft file path is required");
      }

      if (!isPathAllowed(absolutePath)) {
        throw new Error(`Write blocked for path: ${relPath}`);
      }

      return {
        path: relPath,
        absolutePath,
        content: typeof file.content === "string" ? file.content : ""
      };
    });
  }

  function resolveRequiredRolesForFiles(files) {
    const policy = loadApprovalPolicy();
    const matchedRoles = new Set();

    (Array.isArray(files) ? files : []).forEach((file) => {
      const relPath = String(file && file.path ? file.path : "").trim().replace(/\\/g, "/");

      policy.path_rules.forEach((rule) => {
        if (relPath.startsWith(rule.match_prefix)) {
          rule.required_roles.forEach((role) => matchedRoles.add(role));
        }
      });
    });

    const requiredRoles = matchedRoles.size > 0
      ? Array.from(matchedRoles)
      : policy.default_required_roles;

    return {
      policy_version: policy.version,
      available_roles: policy.available_roles,
      required_roles: requiredRoles
    };
  }

  function resolveFileRoleRequirements(files) {
    const policy = loadApprovalPolicy();

    return (Array.isArray(files) ? files : []).map((file) => {
      const relPath = String(file && file.path ? file.path : "").trim().replace(/\\/g, "/");
      const matchedRoles = new Set();

      policy.path_rules.forEach((rule) => {
        if (relPath.startsWith(rule.match_prefix)) {
          rule.required_roles.forEach((role) => matchedRoles.add(role));
        }
      });

      const requiredRoles = matchedRoles.size > 0
        ? Array.from(matchedRoles)
        : policy.default_required_roles;

      return {
        path: relPath,
        required_roles: requiredRoles
      };
    });
  }

  function assertDecisionBatchAllowed(files) {
    const policy = loadApprovalPolicy();
    const stats = buildDecisionBatchStats(files);

    if (stats.file_count === 0) {
      throw new Error("Draft contains no files");
    }

    if (stats.file_count > policy.max_files_per_decision) {
      throw new Error(`Decision blocked: too many files (${stats.file_count}/${policy.max_files_per_decision})`);
    }

    if (stats.total_bytes > policy.max_total_bytes_per_decision) {
      throw new Error(`Decision blocked: payload too large (${stats.total_bytes}/${policy.max_total_bytes_per_decision} bytes)`);
    }

    return {
      policy_version: policy.version,
      max_files_per_decision: policy.max_files_per_decision,
      max_total_bytes_per_decision: policy.max_total_bytes_per_decision,
      stats
    };
  }

  async function buildAiAnalysisArtifacts(requestText) {
    const sessionId = `ai_analysis_${Date.now()}`;
    const createdAt = new Date().toISOString();

    const selectedPaths = [
      "progress/status.json",
      "artifacts/forge/forge_state.json",
      "artifacts/orchestration/orchestration_state.json",
      "artifacts/verify/verification_results.json",
      "docs/11_ai_layer/01_AI_LAYER_SCOPE.md",
      "docs/11_ai_layer/02_AI_LAYER_ARCHITECTURE.md",
      "docs/11_ai_layer/03_AI_LAYER_GOVERNANCE.md",
      "docs/11_ai_layer/04_AI_LAYER_ARTIFACTS.md",
      "docs/11_ai_layer/05_AI_LAYER_RUNTIME_FLOW.md",
      "code/src/workspace/apiServer.js",
      "web/index.html"
    ];

    const selectedFiles = selectedPaths.map((relPath) => {
      const absPath = path.resolve(root, relPath);
      const content = readTextSafe(absPath);

      return {
        path: relPath,
        exists: fs.existsSync(absPath),
        size_bytes: Buffer.byteLength(content, "utf8"),
        sha256: sha256(content),
        content
      };
    });

    const forgeState = readJsonSafe(path.resolve(root, "artifacts/forge/forge_state.json"), {});
    const orchestrationState = readJsonSafe(path.resolve(root, "artifacts/orchestration/orchestration_state.json"), {});
    const verificationResults = readJsonSafe(path.resolve(root, "artifacts/verify/verification_results.json"), {});
    const liveStatus = readJsonSafe(path.resolve(root, "progress/status.json"), {});

    const analysisSummary = {
      forge_core_complete: forgeState.next_allowed_step === "COMPLETE" && Array.isArray(forgeState.open_tasks) && forgeState.open_tasks.length === 0,
      verify_pass: verificationResults.status === "PASS" && verificationResults.final_outcome === "PASS",
      workspace_runtime_complete: orchestrationState.run_mode === "WORKSPACE_RUNTIME" && orchestrationState.final_outcome === "WORKSPACE_RUNTIME_COMPLETE",
      no_open_gaps: Array.isArray(forgeState.pending_gaps) && forgeState.pending_gaps.length === 0,
      current_stage: typeof liveStatus.current_stage === "string" ? liveStatus.current_stage : "",
      last_completed_artifact: typeof forgeState.last_completed_artifact === "string" ? forgeState.last_completed_artifact : "",
      ai_layer_mode: "ANALYSIS",
      execution_triggered: false,
      decision_packet_created: false
    };

    const conversationArtifact = {
      session_id: sessionId,
      created_at: createdAt,
      mode: "ANALYSIS",
      messages: [
        {
          role: "user",
          content: requestText || "General AI Layer analysis request"
        },
        {
          role: "assistant",
          content: "Analysis completed in read-only mode with context and analysis artifacts generated."
        }
      ]
    };

    const contextArtifact = {
      session_id: sessionId,
      created_at: createdAt,
      mode: "ANALYSIS",
      request: requestText || "General AI Layer analysis request",
      selected_file_count: selectedFiles.length,
      selected_files: selectedFiles
    };

    const analysisArtifact = {
      analysis_id: sessionId,
      created_at: createdAt,
      mode: "ANALYSIS",
      request: requestText || "General AI Layer analysis request",
      summary: analysisSummary,
      findings: [
        {
          finding_id: "AI-ANALYSIS-001",
          title: "Forge core remains complete and verified",
          status: analysisSummary.forge_core_complete && analysisSummary.verify_pass ? "CONFIRMED" : "NOT_CONFIRMED"
        },
        {
          finding_id: "AI-ANALYSIS-002",
          title: "Workspace runtime lane is operational",
          status: analysisSummary.workspace_runtime_complete ? "CONFIRMED" : "NOT_CONFIRMED"
        },
        {
          finding_id: "AI-ANALYSIS-003",
          title: "AI Layer is running in read-only analysis mode",
          status: "CONFIRMED"
        }
      ]
    };

    const conversationRel = `artifacts/ai/conversations/${sessionId}.conversation.json`;
    const contextRel = `artifacts/ai/context/${sessionId}.context.json`;
    const analysisRel = `artifacts/ai/analysis/${sessionId}.analysis.json`;

    await tryWriteJson(path.resolve(root, conversationRel), conversationArtifact);
    await tryWriteJson(path.resolve(root, contextRel), contextArtifact);
    await tryWriteJson(path.resolve(root, analysisRel), analysisArtifact);

    return {
      ok: true,
      mode: "ANALYSIS",
      session_id: sessionId,
      conversation_artifact_path: conversationRel,
      context_artifact_path: contextRel,
      analysis_artifact_path: analysisRel,
      selected_file_count: selectedFiles.length,
      summary: analysisSummary,
      findings: analysisArtifact.findings
    };
  }

  async function buildAiProposalArtifacts(requestText, providerOutput = null, projectIdInput = "") {
    const proposalId = `ai_proposal_${Date.now()}`;
    const createdAt = new Date().toISOString();

    const projectId =
      typeof projectIdInput === "string" && projectIdInput.trim() !== ""
        ? projectIdInput.trim()
        : "default_project";

    const aiProposalsRoot = path.resolve(root, "artifacts", "projects", projectId, "ai", "proposals");
    const aiDraftsRoot = path.resolve(root, "artifacts", "projects", projectId, "ai", "drafts");

    const projectFiles = scanProjectFiles(root);
    const resolvedTargetFile = resolveTargetFileForRequest(requestText, projectFiles);
    const targetAbsPath = path.resolve(root, resolvedTargetFile);
    const currentContent = readTextSafe(targetAbsPath);

    const recentHistory = getRecentWrites(10);
    const normalizedRequest = String(requestText || "").trim().toLowerCase();

    const duplicateHistoryEntry = recentHistory.find((entry) => {
      const requestTextFromHistory = String(
        entry && entry.request_text ? entry.request_text : ""
      ).trim().toLowerCase();

      return requestTextFromHistory === normalizedRequest;
    });

    if (duplicateHistoryEntry) {
      return {
        ok: false,
        mode: "DUPLICATE_HISTORY",
        reason: "REQUEST_ALREADY_EXECUTED_RECENTLY",
        message: "This request was already executed recently.",
        target_file: resolvedTargetFile,
        recent_entry: {
          decision_packet_id: duplicateHistoryEntry.decision_packet_id || "",
          logged_at: duplicateHistoryEntry.logged_at || "",
          summary: duplicateHistoryEntry.summary || ""
        }
      };
    }

    const providerFiles = providerOutput && Array.isArray(providerOutput.files)
      ? providerOutput.files
          .map((file) => {
            const relPath = normalizeRelativePath(file && file.path ? file.path : "");
            const absPath = path.resolve(root, relPath);
            const baseContent = readTextSafe(absPath);
            const operations = normalizePatchOperations(file && file.operations);
            return {
              path: relPath,
              content: typeof (file && file.content) === "string" ? file.content : baseContent,
              operations,
              diff: typeof (file && file.diff) === "string" ? file.diff : "",
              allow_overwrite: true
            };
          })
          .filter((file) => file.path.length > 0)
      : [];

    const providerGenerated = providerFiles.length > 0
      ? {
          strategy: "PROVIDER_CODEX_FILES",
          files: providerFiles
        }
      : null;

    const generated = buildSmartProposalCode(requestText);
    if (!generated.target_file) {
      generated.target_file = resolvedTargetFile;
    }

    const fileTypeAware = buildFileTypeAwareProposal(
      requestText,
      resolvedTargetFile
    );

    const codeAwareEdit = buildCodeAwareEditProposal(
      requestText,
      currentContent,
      resolvedTargetFile
    );

    const finalGenerated = providerGenerated
      ? providerGenerated
      : (codeAwareEdit || fileTypeAware || generated);

    const generatedFiles = Array.isArray(finalGenerated.files) && finalGenerated.files.length > 0
      ? finalGenerated.files.map((file) => ({
          path: normalizeRelativePath(file.path),
          content: typeof file.content === "string" ? file.content : "",
          operations: normalizePatchOperations(file.operations),
          diff: typeof file.diff === "string" ? file.diff : "",
          allow_overwrite: file.allow_overwrite === true
        }))
      : [
          {
            path: finalGenerated.target_file || resolvedTargetFile,
            content: typeof finalGenerated.content === "string" ? finalGenerated.content : "",
            operations: normalizePatchOperations(finalGenerated.operations),
            diff: typeof finalGenerated.diff === "string" ? finalGenerated.diff : "",
            allow_overwrite: finalGenerated.allow_overwrite === true
          }
        ];

    const targetFile = generatedFiles[0].path;
    const targetFileAbs = path.resolve(root, targetFile);
    const oldContent = readTextSafe(targetFileAbs);
    const newContent = generatedFiles[0].content || "";
    const operationType = detectOperationType(oldContent, newContent);

    if (operationType === "DUPLICATE") {
      return {
        ok: false,
        mode: "DUPLICATE",
        reason: "CONTENT_ALREADY_EXISTS",
        message: "Request already exists in target file.",
        target_file: targetFile,
        operation_analysis: {
          operation_type: operationType,
          old_content: oldContent,
          new_content: newContent
        }
      };
    }

    const strategyCandidates = providerGenerated
      ? [
          {
            strategy_id: "CODEX_PROVIDER",
            title: "Codex Generated Patch",
            score: 1.0,
            target_file: generatedFiles.length > 1 ? "MULTI_FILE" : targetFile,
            rationale: "Using Codex provider output directly"
          }
        ]
      : buildStrategyCandidates(
          requestText,
          targetFile
        );

    const proposalArtifact = {
      proposal_id: proposalId,
      project_id: projectId,
      created_at: createdAt,
      mode: "PROPOSAL",
      request: requestText || "General proposal request",
      description: "Generated proposal based on AI analysis",
      impact: "LOW",
      execution_required: true,
      execution_approved: false,
      generation_strategy: finalGenerated.strategy,
      target_file: targetFile,
      target_files: generatedFiles.map((file) => file.path),
      operation_mode: generatedFiles.length > 1 ? "MULTI_FILE" : "SINGLE_FILE",
      selected_strategy: strategyCandidates[0] || null,
      strategy_candidates: strategyCandidates
    };

    const draftArtifact = {
      draft_id: proposalId,
      project_id: projectId,
      created_at: createdAt,
      mode: "PROPOSAL",
      files: generatedFiles,
      approved: false,
      ready_for_decision: false
    };

    const proposalRel = `artifacts/projects/${projectId}/ai/proposals/${proposalId}.proposal.json`;
    const draftRel = `artifacts/projects/${projectId}/ai/drafts/${proposalId}.draft.json`;

    await writeJson(path.resolve(root, proposalRel), proposalArtifact);
    await writeJson(path.resolve(root, draftRel), draftArtifact);

    await writeActiveProject(projectId);
    await persistProjectState(projectId, {
      user_goal: requestText,
      technical_goal: requestText,
      current_phase: "DOCS_DRAFTING",
      active_runtime_state: "DOCUMENTATION",
      documentation_state: "DRAFTING",
      execution_package_state: "DRAFTING",
      execution_state: "NOT_STARTED",
      selected_strategy:
        strategyCandidates[0] && typeof strategyCandidates[0].strategy_id === "string"
          ? strategyCandidates[0].strategy_id
          : ""
    });

    return {
      ok: true,
      mode: "PROPOSAL",
      proposal_id: proposalId,
      proposal_path: proposalRel,
      draft_path: draftRel,
      ready_for_approval: true,
      selected_strategy: strategyCandidates[0] || null,
      strategy_candidates: strategyCandidates
    };
  }

  function getProjectStateAbs(projectIdInput) {
    return path.resolve(root, getProjectStateRel(projectIdInput));
  }

  function readActiveProjectId() {
    const payload = readJsonSafe(activeProjectPath, null);

    if (payload && typeof payload.project_id === "string" && payload.project_id.trim() !== "") {
      return payload.project_id.trim();
    }

    return "default_project";
  }

  async function writeActiveProject(projectIdInput) {
    const projectId = normalizeProjectId(projectIdInput);
    await writeJson(activeProjectPath, {
      project_id: projectId,
      updated_at: new Date().toISOString()
    });
    return projectId;
  }

  function listKnownProjectIds() {
    ensureDir(projectsRoot);

    const ids = fs.readdirSync(projectsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter(Boolean);

    if (!ids.includes("default_project")) {
      ids.unshift("default_project");
    }

    return Array.from(new Set(ids));
  }

  function buildProjectState(projectIdInput, overrides = {}) {
    const projectId = normalizeProjectId(projectIdInput);
    const projectRoot = getProjectArtifactsRoot(projectId);

    ensureDir(projectRoot);

    const existing = readJsonSafe(getProjectStateAbs(projectId), {});
    const proposalRoot = path.join(projectRoot, "ai", "proposals");
    const draftRoot = path.join(projectRoot, "ai", "drafts");
    const decisionRoot = path.join(projectRoot, "decisions");
    const executionPackageAbs = getProjectExecutionPackageAbs(projectId);
    const decisionPacketAbs = path.join(decisionRoot, "decision_packet.json");

    const proposalCount = fs.existsSync(proposalRoot)
      ? fs.readdirSync(proposalRoot).filter((name) => name.endsWith(".proposal.json")).length
      : 0;

    const draftCount = fs.existsSync(draftRoot)
      ? fs.readdirSync(draftRoot).filter((name) => name.endsWith(".draft.json")).length
      : 0;

    const decisionPacket = readJsonSafe(decisionPacketAbs, null);
    const executionPackage = readJsonSafe(executionPackageAbs, null);

    const hasDecisionPacket = !!decisionPacket;
    const hasExecutionPackage = !!executionPackage;

    const activeRuntimeState =
      overrides.active_runtime_state ||
      existing.active_runtime_state ||
      (hasExecutionPackage ? "EXECUTION_PREPARATION" : proposalCount > 0 ? "DOCUMENTATION" : "DISCUSSION");

    const currentPhase =
      overrides.current_phase ||
      (hasExecutionPackage ? "EXECUTION_READY" : proposalCount > 0 ? "DOCS_DRAFTING" : "DISCOVERY");

    const documentationState =
      overrides.documentation_state ||
      (hasDecisionPacket ? "APPROVED" : proposalCount > 0 ? "DRAFTING" : "EMPTY");

    const executionPackageState =
      overrides.execution_package_state ||
      (hasExecutionPackage
        ? String(executionPackage.handoff_status || "").trim() === "APPROVED_PENDING_FORGE"
          ? "APPROVED"
          : "DRAFTING"
        : "NOT_READY");

    const executionState =
      overrides.execution_state ||
      (hasExecutionPackage ? "PENDING_FORGE" : "NOT_STARTED");

    const verificationState = overrides.verification_state || "NOT_READY";
    const deliveryState = overrides.delivery_state || "NOT_READY";

    const state = {
      project_id: projectId,
      project_name: typeof overrides.project_name === "string" && overrides.project_name.trim() !== ""
        ? overrides.project_name.trim()
        : typeof existing.project_name === "string" && existing.project_name.trim() !== ""
          ? existing.project_name.trim()
          : projectId,
      project_type: overrides.project_type || existing.project_type || "REVIEW",
      project_mode: overrides.project_mode || existing.project_mode || "EXTEND_EXISTING",
      project_status: overrides.project_status || existing.project_status || "ACTIVE",
      primary_language: overrides.primary_language || existing.primary_language || "MIXED",
      user_goal: overrides.user_goal || existing.user_goal || "",
      business_goal: overrides.business_goal || existing.business_goal || "",
      technical_goal: overrides.technical_goal || existing.technical_goal || "",
      current_phase: currentPhase,
      active_runtime_state: activeRuntimeState,
      workspace_path: root,
      source_of_truth: "ZIP_SNAPSHOT",
      selected_strategy:
        typeof overrides.selected_strategy === "string"
          ? overrides.selected_strategy
          : existing.selected_strategy || "",
      accepted_options: Array.isArray(overrides.accepted_options)
        ? overrides.accepted_options
        : Array.isArray(existing.accepted_options)
          ? existing.accepted_options
          : [],
      rejected_options: Array.isArray(overrides.rejected_options)
        ? overrides.rejected_options
        : Array.isArray(existing.rejected_options)
          ? existing.rejected_options
          : [],
      open_questions: Array.isArray(overrides.open_questions)
        ? overrides.open_questions
        : Array.isArray(existing.open_questions)
          ? existing.open_questions
          : [],

      clarification_answers:
        overrides.clarification_answers && typeof overrides.clarification_answers === "object"
          ? overrides.clarification_answers
          : existing.clarification_answers && typeof existing.clarification_answers === "object"
            ? existing.clarification_answers
            : {},
      requirement_domain: overrides.requirement_domain || existing.requirement_domain || "",
      domain_locked: typeof overrides.domain_locked === "boolean" ? overrides.domain_locked
        : typeof existing.domain_locked === "boolean" ? existing.domain_locked : false,
      domain_history: Array.isArray(overrides.domain_history) ? overrides.domain_history
        : Array.isArray(existing.domain_history) ? existing.domain_history : [],
      requirement_completeness:
        typeof overrides.requirement_completeness === "boolean"
          ? overrides.requirement_completeness
          : typeof existing.requirement_completeness === "boolean"
            ? existing.requirement_completeness
            : false,

      requirement_model:
        overrides.requirement_model && typeof overrides.requirement_model === "object"
          ? overrides.requirement_model
          : existing.requirement_model && typeof existing.requirement_model === "object"
            ? existing.requirement_model
            : {},
      requirement_reasoning_summary:
        typeof overrides.requirement_reasoning_summary === "string"
          ? overrides.requirement_reasoning_summary
          : existing.requirement_reasoning_summary || "",
      provider_error:
        typeof overrides.provider_error === "string"
          ? overrides.provider_error
          : existing.provider_error || "",
        
      documentation_state: documentationState,
      execution_package_state: executionPackageState,
      execution_state: executionState,
      verification_state: verificationState,
      delivery_state: deliveryState,
      conversation_history: {
        proposal_count: proposalCount,
        draft_count: draftCount
      },
      decision_history: {
        has_decision_packet: hasDecisionPacket
      },
      artifact_registry: {
        project_root: `artifacts/projects/${projectId}`,
        project_state: getProjectStateRel(projectId),
        decision_packet: hasDecisionPacket ? `artifacts/projects/${projectId}/decisions/decision_packet.json` : "",
        execution_package: hasExecutionPackage ? getProjectExecutionPackageRel(projectId) : ""
      },
      review_cycles_count: Number.isInteger(existing.review_cycles_count) ? existing.review_cycles_count : 0,
      pending_decisions: hasExecutionPackage ? ["EXECUTION_PACKAGE_PENDING_FORGE"] : [],
      memory_state: proposalCount > 0 || hasDecisionPacket ? "ACTIVE" : "EMPTY",
      version_registry: Array.isArray(existing.version_registry) ? existing.version_registry : [],
      vision: existing.vision || null,
      vision_locked: typeof existing.vision_locked === "boolean" ? existing.vision_locked : false,
      vision_version: existing.vision_version || null,
      vision_history: Array.isArray(existing.vision_history) ? existing.vision_history : [],
      conversation_mode: overrides.conversation_mode !== undefined
        ? overrides.conversation_mode
        : (existing.conversation_mode || "PIPELINE"),
      active_project_flag: readActiveProjectId() === projectId,
      last_updated_at: new Date().toISOString()
    };

    return state;
  }

  async function persistProjectState(projectIdInput, overrides = {}) {
    const projectId = normalizeProjectId(projectIdInput);
    const state = buildProjectState(projectId, overrides);
    const projectStateAbs = getProjectStateAbs(projectId);

    await writeJson(projectStateAbs, state);

    const registry = {
      active_project_id: readActiveProjectId(),
      updated_at: new Date().toISOString(),
      projects: listKnownProjectIds().map((id) => {
        const item = id === projectId ? state : buildProjectState(id);
        return {
          project_id: item.project_id,
          project_name: item.project_name,
          project_status: item.project_status,
          current_phase: item.current_phase,
          active_runtime_state: item.active_runtime_state,
          pending_decisions: item.pending_decisions,
          active_project_flag: item.active_project_flag,
          last_updated_at: item.last_updated_at
        };
      })
    };

    await writeJson(projectRegistryPath, registry);

    return state;
  }

  function assertWorkspaceDiscoveryComplete(body = {}) {
    const projectId =
      typeof body.project_id === "string" && body.project_id.trim() !== ""
        ? body.project_id.trim()
        : "default_project";

    const state = buildProjectState(projectId);
    const openQuestions = Array.isArray(state.open_questions) ? state.open_questions : [];

    if (
      state.requirement_completeness !== true &&
      state.active_runtime_state !== "IDEATION"
    ) {
      return {
        ok: false,
        mode: "BLOCKED",
        reason: "DISCOVERY_NOT_COMPLETE",
        project_id: projectId,
        requirement_domain: state.requirement_domain || "",
        requirement_completeness: state.requirement_completeness === true,
        blocking_questions: openQuestions
      };
    }

    return {
      ok: true,
      project_id: projectId
    };
  }

  async function listProjects() {
    if (!fs.existsSync(activeProjectPath)) {
      await writeActiveProject("default_project");
    }

    const items = await Promise.all(listKnownProjectIds().map((projectId) => persistProjectState(projectId)));

    return {
      active_project_id: readActiveProjectId(),
      items
    };
  }

  async function createProject(body = {}) {
    const projectName = normalizeProjectName(body.project_name);
    const baseProjectId = buildProjectId(body.project_id, projectName);

    let projectId = baseProjectId;
    let suffix = 1;

    while (fs.existsSync(getProjectArtifactsRoot(projectId))) {
      projectId = `${baseProjectId}_${suffix}`;
      suffix += 1;
    }

    await writeActiveProject(projectId);

    const state = await persistProjectState(projectId, {
      project_name:      projectName,
      project_status:    "ACTIVE",
      conversation_mode: "CONVERSATION"
    });

    return {
      ok: true,
      created: true,
      active_project_id: projectId,
      project: state
    };
  }

  async function deleteProject(body = {}) {
    const projectId = normalizeProjectId(body.project_id || "");
    if (!projectId || projectId === "default_project") {
      return { ok: false, reason: "CANNOT_DELETE_DEFAULT_PROJECT" };
    }
    const projectRoot = path.resolve(root, "artifacts", "projects", projectId);
    if (!fs.existsSync(projectRoot)) {
      return { ok: false, reason: "PROJECT_NOT_FOUND" };
    }
    const reg = getDefaultRegistry();
    const relPath = path.relative(root, projectRoot).split(path.sep).join("/");
    const dr = await reg.invoke("fs.delete_dir", { path: relPath }, { root });
    if (dr.status !== "SUCCESS") {
      return { ok: false, reason: (dr.metadata && dr.metadata.reason) || "DELETE_FAILED" };
    }
    if (readActiveProjectId() === projectId) {
      await writeActiveProject("default_project");
    }
    await persistProjectState("default_project");
    return { ok: true, deleted: true, project_id: projectId };
  }

  function getProjectArtifactsRoot(projectIdInput) {
    return path.resolve(root, "artifacts", "projects", normalizeProjectId(projectIdInput));
  }

  function getProjectExecutionPackageAbs(projectIdInput) {
    return path.resolve(root, getProjectExecutionPackageRel(projectIdInput));
  }

  async function writeDecisionLinkArtifact(proposalId, decisionPacketId, projectIdInput = "") {
    const projectId = normalizeProjectId(projectIdInput);

    const link = {
      link_id: `ai_decision_link_${Date.now()}`,
      created_at: new Date().toISOString(),
      proposal_id: proposalId || "",
      decision_packet_id: decisionPacketId || "",
      project_id: projectId,
      relationship: "PROPOSAL_TO_DECISION"
    };

    const rel = getProjectDecisionLinksRel(projectId, link.link_id);
    await writeJson(path.resolve(root, rel), link);

    return rel;
  }

  async function appendDecisionLog(entry) {
    const logPath = path.join(llmRoot, "decision_log.json");
    await tryAppendArrayJson(logPath, entry);
  }

  function getRecentWrites(projectIdInput = "", limit = 10) {
    const metadataDir = path.join(llmRoot, "metadata");
    const targetProjectId = normalizeProjectId(projectIdInput || readActiveProjectId());

    if (!fs.existsSync(metadataDir)) {
      return [];
    }

    return fs.readdirSync(metadataDir)
      .filter((name) => name.endsWith(".write.json") || name.endsWith(".decision.json"))
      .map((name) => {
        const fullPath = path.join(metadataDir, name);
        const stat = fs.statSync(fullPath);

        let parsed = null;
        try {
          parsed = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        } catch (err) {
          parsed = null;
        }

        return {
          name,
          mtimeMs: stat.mtimeMs,
          data: parsed
        };
      })
      .filter((item) => {
        const data = item.data && typeof item.data === "object" ? item.data : {};
        const itemProjectId =
          typeof data.project_id === "string" && data.project_id.trim() !== ""
            ? data.project_id.trim()
            : "default_project";

        return itemProjectId === targetProjectId;
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, limit)
      .map((item) => {
        const data = item.data && typeof item.data === "object" ? item.data : {};
        const isDecision = item.name.endsWith(".decision.json");

        return {
          entry_type: isDecision ? "DECISION_PACKET" : "WRITE",
          project_id:
            typeof data.project_id === "string" && data.project_id.trim() !== ""
              ? data.project_id.trim()
              : "default_project",
          decision_packet_id: data.decision_packet_id || "",
          write_id: data.write_id || "",
          approver_role: data.approver_role || "",
          required_roles: Array.isArray(data.required_roles) ? data.required_roles : [],
          approval_policy_version: data.approval_policy_version || "",
          operation_mode: data.operation_mode || "",
          file_count: Number.isInteger(data.file_count) ? data.file_count : 0,
          total_bytes: Number.isInteger(data.total_bytes) ? data.total_bytes : 0,
          logged_at: data.approved_at || data.timestamp || "",
          queued_files: Array.isArray(data.queued_files) ? data.queued_files : [],
          written_files: Array.isArray(data.written_files) ? data.written_files : [],
          summary: data.summary || data.request || ""
        };
      });
  }

  async function createDecisionPacket(draft, userRequest, approverRole) {
    const normalizedFiles = normalizeDraftFiles(draft.files);
    const batchPolicy = assertDecisionBatchAllowed(normalizedFiles);
    const fileRoleRequirements = resolveFileRoleRequirements(normalizedFiles);
    const approvalPolicy = resolveRequiredRolesForFiles(normalizedFiles);
    const approvedByRole = assertApproverRoleAllowed(approverRole, approvalPolicy.required_roles);

    const diffs = normalizedFiles.map((file) => {
      let oldContent = "";

      if (fs.existsSync(file.absolutePath)) {
        oldContent = fs.readFileSync(file.absolutePath, "utf-8");
      }

      const newContent = file.content || "";

      return {
        path: file.path,
        diff: buildSimpleDiff(oldContent, newContent),
        sha256: sha256(newContent)
      };
    });

    const decisionPacketId = `workspace_decision_${Date.now()}`;
    const workspaceId = "personal";
    const projectId = normalizeProjectId(draft.project_id);

    const projectDecisionsRoot = path.resolve(root, "artifacts", "projects", projectId, "decisions");

    const requestPath = path.join(llmRoot, "requests", `${decisionPacketId}.request.json`);
    const responsePath = path.join(llmRoot, "responses", `${decisionPacketId}.response.json`);
    const metadataPath = path.join(llmRoot, "metadata", `${decisionPacketId}.decision.json`);
    const decisionPacketJsonAbs = path.join(projectDecisionsRoot, "decision_packet.json");
    const decisionPacketMdAbs = path.join(projectDecisionsRoot, "decision_packet.md");

    const packet = {
      execution_id: decisionPacketId,
      workspace_id: workspaceId,
      project_id: projectId,
      source: "EXTERNAL_AI_WORKSPACE",
      operation: {
        mode: batchPolicy.stats.operation_mode,
        file_count: batchPolicy.stats.file_count,
        total_bytes: batchPolicy.stats.total_bytes
      },
      approval: {
        policy_version: approvalPolicy.policy_version,
        approved_by_role: approvedByRole,
        required_roles: approvalPolicy.required_roles,
        approved_at: new Date().toISOString()
      },
      question: "Approve the queued workspace draft for governed deterministic application?",
      context_summary: userRequest || "",
      options: [
        {
          option_id: "OPTION-APPROVE-WORKSPACE-DRAFT",
          description: "Queue the workspace draft as a governed pending change set.",
          impact_scope: "EXTERNAL_WORKSPACE",
          risk_level: "MEDIUM",
          downstream_effects: normalizedFiles.map((file) => `Apply candidate change to ${file.path}`),
          cognitive_priority_hint: null
        }
      ],
      recommendation_reference: `artifacts/llm/metadata/${decisionPacketId}.decision.json`,
      confirmation_required_format: "OPTION-APPROVE-WORKSPACE-DRAFT",
      proposed_files: normalizedFiles.map((file, index) => ({
        path: file.path,
        allow_overwrite: draft.files[index] && draft.files[index].allow_overwrite === true,
        sha256: diffs[index].sha256,
        diff: diffs[index].diff,
        required_roles:
          fileRoleRequirements.find((item) => item.path === file.path)?.required_roles || approvalPolicy.required_roles,
        file_index: index + 1,
        file_count: batchPolicy.stats.file_count
      }))
    };

    await writeJson(requestPath, {
      request: userRequest || "",
      approver_role: approvedByRole,
      required_roles: approvalPolicy.required_roles,
      approval_policy_version: approvalPolicy.policy_version,
      operation_mode: batchPolicy.stats.operation_mode,
      file_count: batchPolicy.stats.file_count,
      total_bytes: batchPolicy.stats.total_bytes,
      approved_at: new Date().toISOString(),
      workspace_id: workspaceId,
      project_id: projectId
    });

    await writeJson(responsePath, {
      summary: typeof draft.summary === "string" ? draft.summary : "Decision packet created successfully.",
      files: normalizedFiles.map((file) => ({
        path: file.path,
        content: file.content
      }))
    });

    await writeJson(decisionPacketJsonAbs, packet);
    await writeFile(decisionPacketMdAbs, renderDecisionPacketMd(packet));

    const executionPackageAbs = getProjectExecutionPackageAbs(projectId);
    const executionPackage = buildExecutionPackage(packet);

    await writeJson(executionPackageAbs, executionPackage);

    const result = {
      ok: true,
      entry_type: "DECISION_PACKET",
      decision_packet_id: decisionPacketId,
      project_id: projectId,
      approver_role: approvedByRole,
      required_roles: approvalPolicy.required_roles,
      approval_policy_version: approvalPolicy.policy_version,
      operation_mode: batchPolicy.stats.operation_mode,
      file_count: batchPolicy.stats.file_count,
      total_bytes: batchPolicy.stats.total_bytes,
      decision_packet_paths: [
        `artifacts/projects/${projectId}/decisions/decision_packet.json`,
        `artifacts/projects/${projectId}/decisions/decision_packet.md`
      ],
      execution_package_paths: [
        getProjectExecutionPackageRel(projectId)
      ],
      queued_files: normalizedFiles.map((file) => file.path),
      summary: typeof draft.summary === "string" ? draft.summary : "Decision packet created successfully.",
      request: userRequest || "",
      diffs
    };

    await writeJson(metadataPath, result);

    await writeActiveProject(projectId);
    await persistProjectState(projectId, {
      current_phase: "EXECUTION_READY",
      active_runtime_state: "EXECUTION_PREPARATION",
      documentation_state: "APPROVED",
      execution_package_state: "APPROVED",
      execution_state: "PENDING_FORGE",
      accepted_options: ["OPTION-APPROVE-WORKSPACE-DRAFT"]
    });

    await appendDecisionLog({
      timestamp: new Date().toISOString(),
      type: "DECISION_PACKET",
      decision_packet_id: decisionPacketId,
      approver_role: approvedByRole,
      required_roles: approvalPolicy.required_roles,
      approval_policy_version: approvalPolicy.policy_version,
      operation_mode: batchPolicy.stats.operation_mode,
      file_count: batchPolicy.stats.file_count,
      total_bytes: batchPolicy.stats.total_bytes,
      workspace_id: workspaceId,
      project_id: projectId,
      request: userRequest || "",
      queued_files: normalizedFiles.map((file) => file.path)
    });

    return result;
  }

  async function handlePreview(body, res) {
    const draft = body && body.draft ? body.draft : null;

    const discoveryGate = assertWorkspaceDiscoveryComplete(body);

    if (!discoveryGate.ok) {
      sendJson(res, 409, discoveryGate);
      return;
    }

    if (!draft || !Array.isArray(draft.files)) {
      sendJson(res, 400, { error: "Draft is required" });
      return;
    }

    const normalizedFiles = normalizeDraftFiles(draft.files);
    const approvalPolicy = resolveRequiredRolesForFiles(normalizedFiles);
    const batchPolicy = assertDecisionBatchAllowed(normalizedFiles);
    const fileRoleRequirements = resolveFileRoleRequirements(normalizedFiles);

    const diffs = normalizedFiles.map((file) => {
      const oldContent = fs.existsSync(file.absolutePath)
        ? fs.readFileSync(file.absolutePath, "utf-8")
        : "";

      return {
        path: file.path,
        diff: buildSimpleDiff(oldContent, file.content || ""),
        sha256: sha256(file.content || "")
      };
    });

    sendJson(res, 200, {
      diffs,
      approval_policy_version: approvalPolicy.policy_version,
      available_roles: approvalPolicy.available_roles,
      required_roles: approvalPolicy.required_roles,
      operation_mode: batchPolicy.stats.operation_mode,
      file_count: batchPolicy.stats.file_count,
      total_bytes: batchPolicy.stats.total_bytes,
      file_role_requirements: fileRoleRequirements
    });
  }

  async function handleDecision(body, res) {
    const userRequest = typeof body.request === "string" ? body.request.trim() : "";
    const discoveryGate = assertWorkspaceDiscoveryComplete(body);

    if (!discoveryGate.ok) {
      sendJson(res, 409, discoveryGate);
      return;
    }
    const approverRole = typeof body.approver_role === "string" ? body.approver_role.trim() : "";
    const draft = body && body.draft ? body.draft : null;

    if (!draft || !Array.isArray(draft.files)) {
      sendJson(res, 400, { error: "Draft is required" });
      return;
    }

    const result = await createDecisionPacket(draft, userRequest, approverRole);

    const proposalId =
      body && typeof body.proposal_id === "string"
        ? body.proposal_id
        : "";

    if (proposalId && result && result.decision_packet_id) {
      const linkPath = await writeDecisionLinkArtifact(
        proposalId,
        result.decision_packet_id,
        result.project_id
      );

      result.decision_link_artifact = linkPath;
    }
    sendJson(res, 200, result);
  }

  async function handleClarify(body, res) {
    const requestText = typeof body.request === "string" ? body.request.trim() : "";
    const interpretation = interpretUserIntent(requestText);

    sendJson(res, 200, {
      ok: true,
      request: requestText,
      needs_clarification: interpretation.needs_clarification === true,
      clarification_question:
        interpretation.clarification_question ||
        (interpretation.needs_clarification === true ? "What do you want to do?" : ""),
      interpretation
    });
  }

  async function handleAnalyze(body, res) {
    const requestText = typeof body.request === "string" ? body.request.trim() : "";
    const result = await buildAiAnalysisArtifacts(requestText);
    sendJson(res, 200, result);
  }

  async function handleOptions(body, res) {
    const requestText = typeof body.request === "string" ? body.request.trim() : "";
    const discoveryGate = assertWorkspaceDiscoveryComplete(body);

    if (!discoveryGate.ok) {
      sendJson(res, 409, discoveryGate);
      return;
    }
    const interpretation = interpretUserIntent(requestText);

    if (
      interpretation.mode === "BLOCKED" ||
      interpretation.needs_clarification === true
    ) {
      sendJson(res, 200, {
        ok: false,
        mode: "BLOCKED",
        reason: "CLARIFICATION_REQUIRED",
        clarification_question:
          interpretation.clarification_question || "What do you want to do?",
        interpretation
      });
      return;
    }

    const projectFiles = scanProjectFiles(root);
    const resolvedTargetFile = resolveTargetFileForRequest(
      interpretation.normalized_request,
      projectFiles
    );

    const strategyCandidates = buildStrategyCandidates(
      interpretation.normalized_request,
      resolvedTargetFile
    );

    sendJson(res, 200, {
      ok: true,
      mode: "OPTIONS",
      request: interpretation.normalized_request,
      target_file: resolvedTargetFile,
      selected_strategy: strategyCandidates[0] || null,
      strategy_candidates: strategyCandidates,
      interpretation
    });
  }

  async function handleSelectStrategy(body, res) {
    const requestText = typeof body.request === "string" ? body.request.trim() : "";
    const discoveryGate = assertWorkspaceDiscoveryComplete(body);

    if (!discoveryGate.ok) {
      sendJson(res, 409, discoveryGate);
      return;
    }
    const interpretation = interpretUserIntent(requestText);

    if (
      interpretation.mode === "BLOCKED" ||
      interpretation.needs_clarification === true
    ) {
      sendJson(res, 200, {
        ok: false,
        mode: "BLOCKED",
        reason: "CLARIFICATION_REQUIRED",
        clarification_question:
          interpretation.clarification_question || "What do you want to do?",
        interpretation
      });
      return;
    }

    const projectFiles = scanProjectFiles(root);
    const resolvedTargetFile = resolveTargetFileForRequest(
      interpretation.normalized_request,
      projectFiles
    );

    const strategyCandidates = buildStrategyCandidates(
      interpretation.normalized_request,
      resolvedTargetFile
    );

    if (strategyCandidates.length === 1) {
      sendJson(res, 200, {
        ok: true,
        mode: "STRATEGY_SELECTED",
        selection_mode: "AUTO",
        request: interpretation.normalized_request,
        target_file: resolvedTargetFile,
        selected_strategy: strategyCandidates[0],
        strategy_candidates: strategyCandidates,
        interpretation
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      mode: "STRATEGY_SELECTION_REQUIRED",
      selection_mode: "USER_CHOICE_REQUIRED",
      request: interpretation.normalized_request,
      target_file: resolvedTargetFile,
      selected_strategy: null,
      strategy_candidates: strategyCandidates,
      selection_question: "Multiple strategies are available. Which one do you want to use?",
      interpretation
    });
  }

  async function handleConfirmStrategy(body, res) {
    const requestText = typeof body.request === "string" ? body.request.trim() : "";
    const selectedStrategyId =
      typeof body.selected_strategy_id === "string" ? body.selected_strategy_id.trim() : "";

    const discoveryGate = assertWorkspaceDiscoveryComplete(body);

    if (!discoveryGate.ok) {
      sendJson(res, 409, discoveryGate);
      return;
    }

    const interpretation = interpretUserIntent(requestText);

    if (
      interpretation.mode === "BLOCKED" ||
      interpretation.needs_clarification === true
    ) {
      sendJson(res, 200, {
        ok: false,
        mode: "BLOCKED",
        reason: "CLARIFICATION_REQUIRED",
        clarification_question:
          interpretation.clarification_question || "What do you want to do?",
        interpretation
      });
      return;
    }

    const projectFiles = scanProjectFiles(root);
    const resolvedTargetFile = resolveTargetFileForRequest(
      interpretation.normalized_request,
      projectFiles
    );

    const strategyCandidates = buildStrategyCandidates(
      interpretation.normalized_request,
      resolvedTargetFile
    );

    const selectedStrategy = strategyCandidates.find(
      (item) => item.strategy_id === selectedStrategyId
    );

    if (!selectedStrategy) {
      sendJson(res, 200, {
        ok: false,
        mode: "INVALID_SELECTION",
        reason: "STRATEGY_NOT_FOUND",
        message: "Selected strategy is not valid.",
        strategy_candidates: strategyCandidates,
        interpretation
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      mode: "STRATEGY_CONFIRMED",
      request: interpretation.normalized_request,
      target_file: resolvedTargetFile,
      selected_strategy: selectedStrategy,
      strategy_candidates: strategyCandidates,
      interpretation
    });
  }

  async function handlePropose(body, res) {
    const requestText = typeof body.request === "string" ? body.request.trim() : "";

    const projectId =
      typeof body.project_id === "string" ? body.project_id.trim() : "";

    const discoveryGate = assertWorkspaceDiscoveryComplete(body);

    if (!discoveryGate.ok) {
      sendJson(res, 409, discoveryGate);
      return;
    }

    const interpretation = interpretUserIntent(requestText);

    if (
      interpretation.mode === "BLOCKED" ||
      interpretation.needs_clarification === true
    ) {
      sendJson(res, 200, {
        ok: false,
        mode: "BLOCKED",
        reason: "CLARIFICATION_REQUIRED",
        clarification_question:
          interpretation.clarification_question || "What do you want to do?",
        interpretation
      });
      return;
    }

    if (interpretation.mode !== "PROPOSAL") {
      sendJson(res, 200, {
        ok: false,
        mode: interpretation.mode,
        message: "This request is not a proposal request. Try Analyze instead.",
        interpretation
      });
      return;
    }

    const projectFiles = scanProjectFiles(root);
    const resolvedTargetFile = resolveTargetFileForRequest(
      interpretation.normalized_request,
      projectFiles
    );

    const providerRouter = new ProviderRouter();

    const targetAbsolutePath = path.resolve(root, resolvedTargetFile);
    const currentTargetFileContent = readTextSafe(targetAbsolutePath);
    const fileExists = fs.existsSync(targetAbsolutePath);

    const providerResult = await providerRouter.execute({
      task_id: `task_${Date.now()}`,
      request: interpretation.normalized_request,
      context: {
        target_files: [resolvedTargetFile],
        operation_type: fileExists ? "MODIFY" : "CREATE",
        file_exists: fileExists,
        current_file_context: buildRequestAwareFileContext(
          currentTargetFileContent,
          interpretation.normalized_request
        ),
        constraints: [
          "Return valid JSON only",
          "Do not wrap output in markdown",
          "Do not execute filesystem changes",
          "return targeted patch operations only for existing files",
          "use write_full_file only when the file does not already exist",
          "do not return human instructions inside JSON"
        ]
      },
      expected_output: {
        type: "PATCH_OPERATIONS",
        format: "structured_json"
      }
    });

    const result = await buildAiProposalArtifacts(
      interpretation.normalized_request,
      providerResult.output || null,
      projectId
    );

    result.interpretation = interpretation;
    result.provider = {
      name: "codex",
      status: providerResult.status || "UNKNOWN",
      metadata: providerResult.metadata || {}
    };

    if (providerResult.status === "SUCCESS" && providerResult.output && providerResult.output.raw_stdout) {
      result.provider.patch = providerResult.output.raw_stdout;
    }

    sendJson(res, 200, result);
  }

  async function writeFile(absPath, content) {
    const reg = getDefaultRegistry();
    const relPath = path.relative(root, absPath).split(path.sep).join("/");
    const r = await reg.invoke("fs.write_file", { path: relPath, content: String(content) }, { root });
    if (r.status !== "SUCCESS") {
      throw new Error("writeFile failed [" + relPath + "]: " +
        ((r.metadata && r.metadata.reason) || "") + ": " +
        ((r.metadata && r.metadata.detail) || ""));
    }
  }

  async function writeJson(absPath, payload) {
    return writeFile(absPath, JSON.stringify(payload, null, 2));
  }

  async function tryWriteJson(absPath, payload) {
    try {
      await writeJson(absPath, payload);
    } catch (_e) {
      // best-effort: warn, do not throw
    }
  }

  async function tryAppendArrayJson(absPath, entry) {
    let existing = [];
    try {
      if (fs.existsSync(absPath)) {
        const raw = JSON.parse(fs.readFileSync(absPath, "utf8"));
        existing = Array.isArray(raw) ? raw : [];
      }
    } catch (_e) {
      existing = [];
    }
    existing.push(entry);
    await tryWriteJson(absPath, existing);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://localhost");
      const pathname = requestUrl.pathname;
      if (req.method === "OPTIONS") {
        sendJson(res, 200, { ok: true });
        return;
      }

      // (a) Block any request targeting a .forge-session file
      if (pathname.endsWith("/.forge-session") || pathname === "/.forge-session") {
        const logWriter = require("../runtime/logging/log_writer");
        logWriter.warn("forge-session access blocked", { method: req.method, pathname });
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      // (b) Auth middleware — enforced only after start() sets _activeToken.
      // If _activeToken is null the server was not initialised via start() (test
      // scenario runner starts server directly via server.listen()) — skip auth.
      if (_activeToken !== null) {
        // Security boundary is /api/* — the HTML shell and its assets are public by design.
        const _isApiRoute = pathname.startsWith("/api/");
        const _authExempt =
          !_isApiRoute ||
          (req.method === "GET" && pathname === "/api/system/health") ||
          (req.method === "GET" && pathname === "/api/system/doctor");
        if (!_authExempt) {
          const _authHeader = req.headers["authorization"] || "";
          const _token = _authHeader.startsWith("Bearer ") ? _authHeader.slice(7) : null;
          if (!_token || _token !== _activeToken) {
            sendJson(res, 401, { error: "Unauthorized" });
            return;
          }
        }
      }

      // ── Static file handlers (Handler A + B) ─────────────────────────────────
      // Handler A — GET / and GET /index.html
      if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
        const reg = getDefaultRegistry();
        const r   = await reg.invoke("fs.read_file", { path: "web/index.html" }, { root });
        if (r.status === "SUCCESS") {
          const html = _activeToken !== null
            ? _injectForgeToken(r.output.content, _activeToken)
            : r.output.content;
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
        } else {
          sendJson(res, 404, { error: "Not found" });
        }
        return;
      }

      // Handler B — GET /assets/* (path-traversal guarded by isWithin)
      if (req.method === "GET" && pathname.startsWith("/assets/")) {
        const assetsRoot = path.resolve(root, "web", "assets");
        const filePath   = path.resolve(root, "web" + pathname);
        if (!isWithin(assetsRoot, filePath)) {
          sendJson(res, 404, { error: "Not found" });
          return;
        }
        const ext      = path.extname(pathname).toLowerCase();
        const mimeTypes = {
          ".js":    "application/javascript; charset=utf-8",
          ".css":   "text/css; charset=utf-8",
          ".html":  "text/html; charset=utf-8",
          ".svg":   "image/svg+xml",
          ".png":   "image/png",
          ".ico":   "image/x-icon",
          ".woff2": "font/woff2",
          ".woff":  "font/woff"
        };
        const contentType = mimeTypes[ext] || "application/octet-stream";
        const relPath = path.relative(root, filePath).replace(/\\/g, "/");
        const reg = getDefaultRegistry();
        const r   = await reg.invoke("fs.read_file", { path: relPath }, { root });
        if (r.status === "SUCCESS") {
          res.writeHead(200, { "Content-Type": contentType });
          res.end(r.output.content);
        } else {
          sendJson(res, 404, { error: "Not found" });
        }
        return;
      }

      if (req.method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true, service: "forge-workspace-api" });
        return;
      }

      if (req.method === "GET" && pathname === "/api/system/health") {
        sendJson(res, 200, { ok: true, service: "forge-workspace-api", ts: new Date().toISOString() });
        return;
      }

      if (req.method === "GET" && pathname === "/api/system/doctor") {
        try {
          const { runDoctor } = require("../runtime/doctor/runDoctor");
          const results = await runDoctor({ root });
          sendJson(res, 200, { ok: true, results });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err && err.message ? err.message : "doctor failed" });
        }
        return;
      }

      if (req.method === "GET" && pathname === "/api/ai/approval-policy") {
        sendJson(res, 200, loadApprovalPolicy());
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/intake") {
        const body = await readBody(req);
        sendJson(res, 200, await aiOsRuntime.intakeProject(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/clarification/answer") {
        const body = await readBody(req);
        sendJson(res, 200, await aiOsRuntime.answerClarification(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/options") {
        const body = await readBody(req);
        sendJson(res, 200, await aiOsRuntime.registerOptions(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/decision") {
        const body = await readBody(req);
        sendJson(res, 200, aiOsRuntime.decideOption(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/handoff") {
        const body = await readBody(req);
        sendJson(res, 200, await aiOsRuntime.createExecutionHandoff(body));
        return;
      }

      if (req.method === "GET" && pathname === "/api/ai-os/project") {
        sendJson(res, 200, aiOsRuntime.getProject({
          project_id: requestUrl.searchParams.get("project_id") || ""
        }));
        return;
      }

      if (req.method === "GET" && pathname === "/api/ai-os/active-project") {
        const active = activeProjectManager.getActiveProject();
        sendJson(res, 200, { ok: true, active_project: active });
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/active-project/switch") {
        const body = await readBody(req);
        sendJson(res, 200, activeProjectManager.switchProject(body.project_id || ""));
        return;
      }

      if (req.method === "GET" && pathname === "/api/ai-os/projects/list") {
        sendJson(res, 200, activeProjectManager.listProjects());
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/ideation/expand") {
        const body = await readBody(req);
        sendJson(res, 200, await ideationEngine.expandIdea(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/business-analysis") {
        const body = await readBody(req);
        sendJson(res, 200, await businessAnalysisEngine.analyzeProject(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/verify") {
        const body = await readBody(req);
        sendJson(res, 200, await verificationLoop.runVerification(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/review") {
        const body = await readBody(req);
        sendJson(res, 200, await projectReviewEngine.reviewProject(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/delivery/package") {
        const body = await readBody(req);
        sendJson(res, 200, await deliveryPackageBuilder.buildDeliveryPackage(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/chat") {
        const body = await readBody(req);
        // Structural attachment signal → intake handler (no keyword matching on user text)
        if (body.zip_path || body.directory_path ||
            (body.project_id && hasActiveIntakeSession(body.project_id))) {
          sendJson(res, 200, await processIntakeRequest(body));
          return;
        }
        sendJson(res, 200, await conversationEngine.processMessage(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/chat/stream") {
        const body = await readBody(req);
        const projectId = String(body.project_id || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        const message = String(body.message || "").trim();
        const user_language = String(body.user_language || "ar");

        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        });

        const sendEvent = (payload) => {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        };

        if (!message || !projectId) {
          sendEvent({ type: "error", reason: "MISSING_MESSAGE_OR_PROJECT" });
          res.end();
          return;
        }

        try {
          const result = await conversationEngine.processMessage({
            ...body,
            project_id: projectId,
            message,
            user_language
          });

          if (!result.ok) {
            sendEvent({ type: "error", reason: result.reason || "PROCESS_FAILED" });
            res.end();
            return;
          }

          if (result.message) {
            const tokens = result.message.match(/\S+|\s+/g) || [];
            for (const token of tokens) {
              sendEvent({ type: "chunk", c: token });
            }
          }

          sendEvent({
            type: "done",
            message: result.message || "",
            suggest_next: result.suggest_next || "",
            mode: result.mode,
            suggested_answers: result.suggested_answers || [],
            confirmation_key: result.confirmation_key,
            target_state: result.target_state,
            current_state: result.current_state,
            project_id: projectId
          });
        } catch (err) {
          sendEvent({ type: "error", reason: err.message || "STREAM_FAILED" });
        }

        res.end();
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/project/start-pipeline") {
        sendJson(res, 200, {
          ok:     false,
          mode:   "ENDPOINT_DISABLED",
          reason: "This endpoint is disabled. Use /api/ai-os/project/request-idea-summary to synthesize the conversation, then /api/ai-os/project/confirm-idea to confirm before entering the pipeline."
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/project/request-idea-summary") {
        const body = await readBody(req);
        sendJson(res, 200, await conversationEngine.requestIdeaSummary(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/project/confirm-idea") {
        const body = await readBody(req);
        sendJson(res, 200, await conversationEngine.confirmIdea(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/project/formalize-spec") {
        const body = await readBody(req);
        sendJson(res, 200, await conversationEngine.formalizeSpec(body));
        return;
      }

      if (req.method === "GET" && pathname === "/api/projects") {
        sendJson(res, 200, await listProjects());
        return;
      }

      if (req.method === "POST" && pathname === "/api/projects/create") {
        const body = await readBody(req);
        const result = await createProject(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/projects/activate") {
        const body = await readBody(req);
        const projectId = await writeActiveProject(
          typeof body.project_id === "string" ? body.project_id.trim() : ""
        );
        const state = await persistProjectState(projectId);
        sendJson(res, 200, {
          ok: true,
          active_project_id: projectId,
          project: state
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/projects/delete") {
        const body = await readBody(req);
        const result = await deleteProject(body);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (req.method === "GET" && pathname === "/api/ai/history") {
        const projectId =
          typeof requestUrl.searchParams.get("project_id") === "string"
            ? requestUrl.searchParams.get("project_id")
            : "";
        sendJson(res, 200, { items: getRecentWrites(projectId, 10) });
        return;
      }

      if (req.method === "POST" && req.url === "/api/ai/clarify") {
        const body = await readBody(req);
        await handleClarify(body, res);
        return;
      }

      if (req.method === "POST" && req.url === "/api/ai/analyze") {
        const body = await readBody(req);
        await handleAnalyze(body, res);
        return;
      }

      if (req.method === "POST" && req.url === "/api/ai/options") {
        const body = await readBody(req);
        await handleOptions(body, res);
        return;
      }

      if (req.method === "POST" && req.url === "/api/ai/select-strategy") {
        const body = await readBody(req);
        await handleSelectStrategy(body, res);
        return;
      }

      if (req.method === "POST" && req.url === "/api/ai/confirm-strategy") {
        const body = await readBody(req);
        await handleConfirmStrategy(body, res);
        return;
      }

      if (req.method === "POST" && req.url === "/api/ai/propose") {
        const body = await readBody(req);
        await handlePropose(body, res);
        return;
      }

      if (req.method === "POST" && req.url === "/api/ai/read-file") {
        const body = await readBody(req);

        const relPath = normalizeRelativePath(body.path);
        const absolutePath = path.resolve(root, relPath);

        if (!relPath) {
          sendJson(res, 400, { error: "File path is required" });
          return;
        }

        if (!isPathAllowed(absolutePath)) {
          sendJson(res, 403, { error: "Access denied for path" });
          return;
        }

        if (!fs.existsSync(absolutePath)) {
          sendJson(res, 404, { error: "File not found" });
          return;
        }

        const content = fs.readFileSync(absolutePath, "utf-8");

        sendJson(res, 200, {
          ok: true,
          path: relPath,
          content
        });
        return;
      }

      if (req.method === "POST" && req.url === "/api/ai/preview") {
        const body = await readBody(req);
        await handlePreview(body, res);
        return;
      }

      if (req.method === "POST" && req.url === "/api/ai/decision") {
        const body = await readBody(req);
        await handleDecision(body, res);
        return;
      }

      if (
        (req.method === "POST" && req.url === "/api/auth/register") ||
        (req.method === "POST" && req.url === "/api/auth/login")
      ) {
        const body = await readBody(req);

        if (handleAuthRequest(req, res, body, sendJson)) {
          return;
        }
      }

      // --- Governance routes ---
      if (req.method === "POST" && pathname === "/api/governance/vision-compliance") {
        sendJson(res, 200, runVisionComplianceGate({ root }));
        return;
      }

      if (req.method === "POST" && pathname === "/api/governance/spec-completeness") {
        sendJson(res, 200, runSpecCompletenessEnforcer({ root }));
        return;
      }

      // --- AI OS extended routes ---
      if (req.method === "POST" && pathname === "/api/ai-os/doc-build-loop") {
        const body = await readBody(req);
        sendJson(res, 200, await documentationBuildLoop.runDocBuildLoop(body));
        return;
      }

      if (req.method === "GET" && pathname === "/api/ai-os/doc-build-loop/state") {
        const projectId = requestUrl.searchParams.get("project_id") || "";
        sendJson(res, 200, documentationBuildLoop.getLoopState(projectId));
        return;
      }

      // ── Alerts ──────────────────────────────────────────────────────────────
      // POST /api/alerts/test — fires a test payload to FORGE_ALERT_WEBHOOK_URL.
      // 503 if env var absent (webhook disabled). Does NOT route failures through
      // log_writer to avoid alert-about-alert re-entrancy.

      if (req.method === "POST" && pathname === "/api/alerts/test") {
        const webhookUrl = process.env.FORGE_ALERT_WEBHOOK_URL;
        if (!webhookUrl) {
          sendJson(res, 503, {
            error:  "webhook not configured",
            detail: "FORGE_ALERT_WEBHOOK_URL is not set — see INSTALL.md §Alerts"
          });
          return;
        }

        const reg = getDefaultRegistry();
        const payload = JSON.stringify({
          type:    "forge.alert.test",
          source:  "forge-api",
          ts:      new Date().toISOString(),
          message: "Forge alert webhook test — delivery confirmed"
        });

        const postResult = await reg.invoke(
          "http.post",
          {
            url:        webhookUrl,
            body:       payload,
            headers:    { "content-type": "application/json" },
            timeout_ms: 10000
          },
          { root }
        );

        if (postResult.status !== "SUCCESS") {
          sendJson(res, 502, {
            error:  "webhook delivery failed",
            detail: postResult.error || "http.post returned non-SUCCESS"
          });
          return;
        }

        sendJson(res, 200, {
          ok:                   true,
          webhook_url_configured: true,
          status_code:          postResult.output.status_code,
          detail:               "test alert delivered"
        });
        return;
      }

      // ── PHASE-15: Vision + KB read endpoints ────────────────────────────────
      // GET /api/vision — read current project vision (wraps visionEngine.getCurrentVision)
      if (req.method === "GET" && pathname === "/api/vision") {
        const projectId = requestUrl.searchParams.get("project_id") || readActiveProjectId();
        try {
          const { createVisionEngine } = require("../ai_os/visionEngine");
          const vision = await createVisionEngine({ root }).getCurrentVision(projectId);
          sendJson(res, 200, { ok: true, project_id: projectId, vision });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err && err.message ? err.message : "VISION_READ_FAILED" });
        }
        return;
      }

      // GET /api/kb/sources — list KB source records for a project (wraps kb.list_sources)
      if (req.method === "GET" && pathname === "/api/kb/sources") {
        const projectId = requestUrl.searchParams.get("project_id") || readActiveProjectId();
        const scope     = requestUrl.searchParams.get("scope") || "project";
        try {
          const reg    = getDefaultRegistry();
          const result = await reg.invoke("kb.list_sources", { project_id: projectId, scope }, { root });
          if (result.status !== "SUCCESS") {
            sendJson(res, 500, { ok: false, error: (result.metadata && result.metadata.reason) || "KB_LIST_SOURCES_FAILED" });
            return;
          }
          sendJson(res, 200, { ok: true, project_id: projectId, scope, sources: result.output.sources, count: result.output.count });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err && err.message ? err.message : "KB_LIST_SOURCES_FAILED" });
        }
        return;
      }

      // §ARC-8: binary ZIP upload — fs.writeFileSync exempt (text tool cannot handle raw Buffer)
      if (req.method === "POST" && pathname === "/api/intake/upload") {
        const projectId  = requestUrl.searchParams.get("project_id") || "unknown";
        const filename   = req.headers["x-filename"] || "upload.zip";
        const safename   = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const uploadsDir = path.resolve(root, "artifacts", "uploads");
        fs.mkdirSync(uploadsDir, { recursive: true });
        const zipName    = `${Date.now()}_${safename}`;
        const savedPath  = path.join(uploadsDir, zipName);
        const fileBuffer = await readBinaryBody(req);
        fs.writeFileSync(savedPath, fileBuffer);
        const zipPath    = `artifacts/uploads/${zipName}`;
        sendJson(res, 200, { ok: true, zip_path: zipPath, project_id: projectId });
        return;
      }

      // Handler C — SPA fallback: GET non-/api/* routes → serve index.html
      // Catches /chat, /projects, /vision, /kb, /doctor (React Router client-side routes).
      if (req.method === "GET" && !pathname.startsWith("/api/")) {
        const reg = getDefaultRegistry();
        const r   = await reg.invoke("fs.read_file", { path: "web/index.html" }, { root });
        if (r.status === "SUCCESS") {
          const html = _activeToken !== null
            ? _injectForgeToken(r.output.content, _activeToken)
            : r.output.content;
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
        } else {
          sendJson(res, 404, { error: "Not found" });
        }
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : "Internal server error" });
    }
  });

  return {
    port,
    host: process.env.FORGE_BIND_HOST || "127.0.0.1",
    server,
    async start() {
      const crypto          = require("crypto");
      const logWriter       = require("../runtime/logging/log_writer");
      const secretProvider  = require("../runtime/secrets/secret_provider");
      const { checkOrCreateUidPin }    = require("../runtime/production/uid_pin");
      const { ensureMetricsWindow24h } = require("../runtime/logging/metrics_initializer");
      const reg = getDefaultRegistry();

      // (1) UID pin check — throws Error("UID_PIN_MISMATCH: ...") on mismatch
      await checkOrCreateUidPin({ root });

      // (2) Generate 32-byte capability token
      const token = crypto.randomBytes(32).toString("hex");

      // (3) Store via secret_provider (§ARC-5 authorized)
      await secretProvider.set("forge.capability_token", token);

      // (4) Write web/.forge-session via L2 (permissionRules SYSTEM_SESSION_FILE exception)
      const sessionContent =
        "# FORGE-SESSION — DO NOT SERVE EXTERNALLY\n" +
        JSON.stringify({ token, ts: new Date().toISOString() }) + "\n";
      await reg.invoke(
        "fs.write_file",
        { path: "web/.forge-session", content: sessionContent },
        { root }
      );

      // (5) Inject active token into request handler closure
      _activeToken = token;

      // (6) Initialise metrics window
      ensureMetricsWindow24h({ root });

      // (7) Bind and listen
      const host = process.env.FORGE_BIND_HOST || "127.0.0.1";
      if (host !== "127.0.0.1" && host !== "localhost") {
        logWriter.warn("non-localhost binding detected", { host });
      }
      return new Promise((resolve) => {
        server.listen(port, host, () => resolve({ port, host }));
      });
    }
  };
}

module.exports = {
  createWorkspaceApiServer
};