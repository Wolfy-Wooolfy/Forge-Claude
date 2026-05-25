"use strict";

const path   = require("path");
const fs     = require("fs");
const crypto = require("crypto");

function uniqueLower(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  ));
}

function normalizeRelativePath(inputPath) {
  return String(inputPath || "").trim().replace(/\\/g, "/");
}

function assertApproverRoleAllowed(approverRole, requiredRoles) {
  const normalizedRole = String(approverRole || "").trim().toLowerCase();

  if (!normalizedRole) {
    throw new Error("Approver role is required");
  }

  if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) {
    throw new Error("Approval policy resolution failed");
  }

  if (!requiredRoles.includes(normalizedRole)) {
    throw new Error(`Approval blocked for role: ${normalizedRole}`);
  }

  return normalizedRole;
}

function buildDecisionBatchStats(files) {
  const list = Array.isArray(files) ? files : [];
  const totalBytes = list.reduce((sum, file) => {
    return sum + Buffer.byteLength(String(file && file.content ? file.content : ""), "utf8");
  }, 0);

  return {
    file_count: list.length,
    total_bytes: totalBytes,
    operation_mode: list.length > 1 ? "MULTI_FILE" : "SINGLE_FILE"
  };
}

function sha256(content) {
  return crypto.createHash("sha256").update(String(content || ""), "utf8").digest("hex");
}

function buildSimpleDiff(oldContent, newContent) {
  const oldText = String(oldContent || "").replace(/\r\n/g, "\n");
  const newText = String(newContent || "").replace(/\r\n/g, "\n");

  if (oldText === newText) {
    return "No changes";
  }

  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }

  let oldSuffix = oldLines.length - 1;
  let newSuffix = newLines.length - 1;
  while (
    oldSuffix >= prefix &&
    newSuffix >= prefix &&
    oldLines[oldSuffix] === newLines[newSuffix]
  ) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  const removed = oldLines.slice(prefix, oldSuffix + 1);
  const added = newLines.slice(prefix, newSuffix + 1);

  const out = [];

  removed.forEach((line) => {
    out.push(`- ${line}`);
  });

  added.forEach((line) => {
    out.push(`+ ${line}`);
  });

  return out.length > 0 ? out.join("\n") : "No changes";
}

function detectOperationType(oldContent, newContent) {
  const clean = (text) =>
    String(text || "")
      .replace(/\/\/ ==== AI GENERATED ADDITION ====[\s\S]*?$/g, "")
      .replace(/\/\/ ==== AI MERGED ADDITION ====[\s\S]*?$/g, "")
      .trim();

  const oldText = clean(oldContent);
  const newText = clean(newContent);

  if (!oldText) {
    return "CREATE";
  }

  if (oldText === newText) {
    return "DUPLICATE";
  }

  if (oldText && newText && newText.includes(oldText)) {
    return "EXPAND";
  }

  return "MODIFY";
}

function readJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    return fallback;
  }
}

function readTextSafe(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }

  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return "";
  }
}

function buildRequestAwareFileContext(fileContent, requestText) {
  const text = String(fileContent || "");
  const request = String(requestText || "").toLowerCase().trim();

  if (!text) {
    return "";
  }

  const maxChars = 4000;
  const exactNeedles = [];
  const broadNeedles = [];

  if (request.includes("top of") || request.includes("at the top") || request.includes("header")) {
    exactNeedles.push("<!DOCTYPE html>", "<html", "<head", "\"use strict\";");
  }

  if (request.includes("bottom of") || request.includes("at the bottom") || request.includes("footer")) {
    exactNeedles.push("</body>", "</html>", "module.exports");
  }

  if (request.includes("comment")) {
    broadNeedles.push("<!--", "<!DOCTYPE html>", "\"use strict\";");
  }

  if (request.includes("button")) {
    broadNeedles.push("<button", "</button>", "<body", "</body>");
  }

  if (request.includes("script")) {
    broadNeedles.push("<script", "</script>");
  }

  if (request.includes("api") || request.includes("endpoint") || request.includes("route")) {
    broadNeedles.push('req.url === "', 'req.method === "', "sendJson(", "http.createServer");
  }

  if (request.includes("auth") || request.includes("login") || request.includes("register")) {
    broadNeedles.push("/api/auth/register", "/api/auth/login", "handleAuthRequest");
  }

  const allNeedles = [...exactNeedles, ...broadNeedles].filter(Boolean);

  for (const needle of allNeedles) {
    const idx = text.indexOf(needle);

    if (idx >= 0) {
      const isTopRequest =
        request.includes("top of") ||
        request.includes("at the top") ||
        request.includes("header");

      if (isTopRequest && (needle === "<!DOCTYPE html>" || needle === "<html" || needle === "<head")) {
        const end = Math.min(text.length, idx + 2200);
        const slice = text.slice(idx, end);

        if (slice.length <= maxChars) {
          return slice;
        }

        return slice.slice(0, maxChars);
      }

      const start = Math.max(0, idx - 1200);
      const end = Math.min(text.length, idx + Math.max(needle.length, 1) + 1200);
      const slice = text.slice(start, end);

      if (slice.length <= maxChars) {
        return slice;
      }

      return slice.slice(0, maxChars);
    }
  }

  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(0, maxChars);
}

function normalizePatchOperations(operations) {
  if (!Array.isArray(operations)) {
    return [];
  }

  return operations
    .map((operation) => ({
      type: typeof (operation && operation.type) === "string"
        ? operation.type.trim()
        : "",
      find: typeof (operation && operation.find) === "string"
        ? operation.find
        : "",
      replace: typeof (operation && operation.replace) === "string"
        ? operation.replace
        : "",
      anchor: typeof (operation && operation.anchor) === "string"
        ? operation.anchor
        : "",
      content: typeof (operation && operation.content) === "string"
        ? operation.content
        : (typeof (operation && operation.insert) === "string"
            ? operation.insert
            : "")
    }))
    .filter((operation) => operation.type.length > 0);
}

function interpretUserIntent(requestText) {
  const text = String(requestText || "").toLowerCase();

  let mode = "ANALYSIS";
  let intent = "GENERAL";
  let needsClarification = false;

  if (!text || text.trim().length === 0) {
    return {
      mode: "BLOCKED",
      intent: "EMPTY",
      needs_clarification: true,
      clarification_question: "What do you want to do?"
    };
  }

  if (
    text.includes("create") ||
    text.includes("add") ||
    text.includes("build") ||
    text.includes("function") ||
    text.includes("modify") ||
    text.includes("edit") ||
    text.includes("implement") ||
    text.includes("connect") ||
    text.includes("integrate")
  ) {
    mode = "PROPOSAL";
    intent = "CODE_GENERATION";
  }

  if (
    text.includes("why") ||
    text.includes("explain") ||
    text.includes("what") ||
    text.includes("analyze")
  ) {
    mode = "ANALYSIS";
    intent = "QUESTION";
  }

  if (text.length <= 5) {
    needsClarification = true;

    return {
      mode,
      intent,
      needs_clarification: true,
      clarification_question: "Your request is too short. Can you describe what you want to build or modify?",
      normalized_request: requestText
    };
  }

  return {
    mode,
    intent,
    needs_clarification: needsClarification,
    normalized_request: requestText
  };
}

function toPascalCase(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function buildSmartProposalCode(requestText) {
  const raw = String(requestText || "").trim();
  const lower = raw.toLowerCase();

  if (
    (lower.includes("create") || lower.includes("build")) &&
    (lower.includes("authentication") || lower.includes("auth") || lower.includes("login")) &&
    lower.includes("connect") &&
    lower.includes("server")
  ) {
    return {
      strategy: "AUTH_SYSTEM_WITH_SERVER_INTEGRATION",
      files: [
        {
          path: "code/src/auth/authSystem.js",
          content:
`const express = require("express");

function registerAuthRoutes(app) {
  app.post("/api/auth/register", (req, res) => {
    const { username, password } = req.body;
    res.json({ ok: true, message: "User registered", username });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username } = req.body;
    res.json({ ok: true, message: "Login successful", username });
  });
}

module.exports = { registerAuthRoutes };`
        },
        {
          path: "code/src/workspace/apiServer.js",
          content:
`// Connect auth routes to the API server
const { registerAuthRoutes } = require("../auth/authSystem");
registerAuthRoutes(app);`,
          operations: [
            {
              type: "insert_before",
              anchor: "app.listen",
              content: `const { registerAuthRoutes } = require("../auth/authSystem");\nregisterAuthRoutes(app);\n`
            }
          ]
        }
      ]
    };
  }

  if (/^create\s+a\s+function\s+that\s+prints\s+(.+)$/i.test(lower)) {
    const match = lower.match(/^create\s+a\s+function\s+that\s+prints\s+(.+)$/i);
    const subject = match ? toPascalCase(match[1]) : "Message";
    return {
      strategy: "FUNCTION_PRINT",
      target_file: "code/test_workspace_integration.js",
      content:
`function print${subject}() {
  console.log("${subject}");
}

print${subject}();`
    };
  }

  if (/^create\s+an?\s+api\s+endpoint\s+called\s+(.+)$/i.test(lower)) {
    const match = lower.match(/^create\s+an?\s+api\s+endpoint\s+called\s+(.+)$/i);
    const endpointName = match ? match[1].trim().replace(/\s+/g, "-") : "new-endpoint";
    return {
      strategy: "API_ENDPOINT_CREATE",
      target_file: "code/src/workspace/apiServer.js",
      content:
`app.get("/api/${endpointName}", (req, res) => {
  res.json({ ok: true, endpoint: "${endpointName}" });
});`
    };
  }

  if (lower.includes("button") || lower.includes("ui") || lower.includes("html")) {
    const buttonText = lower.includes("login") ? "Login"
      : lower.includes("submit") ? "Submit"
      : lower.includes("save") ? "Save"
      : "New Button";

    return {
      strategy: "HTML_BUTTON_CREATE",
      target_file: "web/index.html",
      content: `  <button id="${buttonText.toLowerCase().replace(/\s+/g, "")}Btn">${buttonText}</button>`,
      operations: [
        {
          type: "insert_before",
          anchor: "</body>",
          content: `  <button id="${buttonText.toLowerCase().replace(/\s+/g, "")}Btn">${buttonText}</button>\n`
        }
      ]
    };
  }

  if (lower.includes("edit") && lower.includes("logging")) {
    return {
      strategy: "EDIT_ADD_LOGGING_STRUCTURE_AWARE",
      target_file: "code/test_workspace_integration.js",
      content:
`// Logging injected
function log(message) {
  console.log("[LOG]", new Date().toISOString(), message);
}`,
      operations: [
        {
          type: "insert_before",
          anchor: "module.exports",
          content:
`function log(message) {
  console.log("[LOG]", new Date().toISOString(), message);
}\n`
        }
      ]
    };
  }

  return {
    strategy: "FALLBACK_ECHO",
    target_file: "code/test_workspace_integration.js",
    content:
`// Generated by Forge Workspace AI
// Request: ${raw}
function generatedFunction() {
  console.log("Executing: ${raw}");
}

generatedFunction();`
  };
}

function buildCodeAwareEditProposal(requestText, currentContent, targetFile) {
  const raw = String(requestText || "").trim();
  const lower = raw.toLowerCase();
  const content = String(currentContent || "");

  if (!lower.includes("edit") && !lower.includes("modify")) {
    return null;
  }

  if (lower.includes("logging")) {
    const logFunctionExists = content.includes("function log(") || content.includes("console.log");

    if (!logFunctionExists) {
      return {
        strategy: "EDIT_ADD_LOGGING_STRUCTURE_AWARE",
        target_file: targetFile || "code/test_workspace_integration.js",
        content:
`function log(message) {
  console.log("[LOG]", new Date().toISOString(), message);
}`,
        operations: [
          {
            type: "insert_before",
            anchor: "module.exports",
            content:
`function log(message) {
  console.log("[LOG]", new Date().toISOString(), message);
}\n`
          }
        ]
      };
    }

    return {
      strategy: "EDIT_ADD_LOGGING_FILE_AWARE_FALLBACK",
      target_file: targetFile || "code/test_workspace_integration.js",
      content: `// Logging already present - no change needed`,
      operations: []
    };
  }

  const functionMatch = raw.match(/edit\s+(?:the\s+)?(?:function\s+)?['"`]?(\w+)['"`]?/i);

  if (functionMatch) {
    const funcName = functionMatch[1];
    const funcExists = content.includes(`function ${funcName}`) || content.includes(`${funcName}(`);

    if (funcExists) {
      return {
        strategy: "EDIT_EXISTING_FUNCTION_" + funcName.toUpperCase(),
        target_file: targetFile,
        content: `// Edit to ${funcName} applied`,
        operations: [
          {
            type: "find_replace",
            find: `function ${funcName}`,
            replace: `function ${funcName} /* edited */`
          }
        ]
      };
    }
  }

  return null;
}

function scanProjectFiles(root) {
  const candidates = [
    "web/index.html",
    "code/src/workspace/apiServer.js",
    "code/test_workspace_integration.js"
  ];

  return candidates
    .map((relPath) => {
      const absPath = path.resolve(root, relPath);
      return {
        path: relPath,
        exists: fs.existsSync(absPath),
        content: readTextSafe(absPath)
      };
    })
    .filter((item) => item.exists);
}

function resolveTargetFileForRequest(requestText, projectFiles) {
  const text = String(requestText || "").toLowerCase();
  const available = Array.isArray(projectFiles) ? projectFiles : [];

  const hasFile = (relPath) => available.some((item) => item.path === relPath);

  if (
    (text.includes("ui") ||
      text.includes("interface") ||
      text.includes("frontend") ||
      text.includes("html") ||
      text.includes("page")) &&
    hasFile("web/index.html")
  ) {
    return "web/index.html";
  }

  if (
    (text.includes("api server") ||
      text.includes("workspace api") ||
      text.includes("server") ||
      text.includes("backend")) &&
    hasFile("code/src/workspace/apiServer.js")
  ) {
    return "code/src/workspace/apiServer.js";
  }

  if (hasFile("code/test_workspace_integration.js")) {
    return "code/test_workspace_integration.js";
  }

  return available.length > 0 ? available[0].path : "code/test_workspace_integration.js";
}

function buildStrategyCandidates(requestText, targetFile) {
  const raw = String(requestText || "").trim();
  const lower = raw.toLowerCase();
  const file = String(targetFile || "").trim();

  const strategies = [];

  if (/^create\s+a\s+function\s+that\s+prints\s+(.+)$/i.test(lower)) {
    strategies.push({
      strategy_id: "FUNCTION_PRINT",
      title: "Generate print function",
      score: 0.95,
      target_file: file,
      rationale: "The request explicitly asks to create a function that prints a message."
    });
  }

  if (/^create\s+an?\s+api\s+endpoint\s+called\s+(.+)$/i.test(lower)) {
    strategies.push({
      strategy_id: "API_ENDPOINT_CREATE",
      title: "Generate API endpoint",
      score: 0.95,
      target_file: file,
      rationale: "The request explicitly asks to create an API endpoint with a specific name."
    });
  }

  if (lower.includes("edit") && lower.includes("logging")) {
    strategies.push({
      strategy_id: "EDIT_ADD_LOGGING_STRUCTURE_AWARE",
      title: "Inject logging into existing function structure",
      score: 0.92,
      target_file: file,
      rationale: "The request asks to modify the current file by adding logging safely."
    });

    strategies.push({
      strategy_id: "EDIT_ADD_LOGGING_FILE_AWARE_FALLBACK",
      title: "Prepend logging to file",
      score: 0.55,
      target_file: file,
      rationale: "Fallback strategy in case no function structure is available."
    });
  }

  if (
    file === "web/index.html" &&
    lower.includes("button")
  ) {
    strategies.push({
      strategy_id: "HTML_BUTTON_CREATE",
      title: "Add HTML button",
      score: 0.9,
      target_file: file,
      rationale: "The request targets the UI and explicitly mentions a button."
    });
  }

  if (
    file === "code/src/workspace/apiServer.js" &&
    lower.includes("logging")
  ) {
    strategies.push({
      strategy_id: "BACKEND_LOGGING_MIDDLEWARE",
      title: "Add backend logging middleware",
      score: 0.88,
      target_file: file,
      rationale: "The request targets the backend server and explicitly mentions logging."
    });
  }

  if (
    (lower.includes("create") || lower.includes("build")) &&
    (lower.includes("authentication") || lower.includes("auth") || lower.includes("login")) &&
    lower.includes("connect") &&
    lower.includes("server")
  ) {
    strategies.push({
      strategy_id: "AUTH_SYSTEM_WITH_SERVER_INTEGRATION",
      title: "Create auth system and connect it to API server",
      score: 0.99,
      target_file: "MULTI_FILE",
      rationale: "The request clearly asks to create the auth system and connect it to the API server in one coordinated change."
    });
  }

  if (
    lower.includes("connect") &&
    (lower.includes("auth") || lower.includes("authentication")) &&
    lower.includes("server")
  ) {
    strategies.push({
      strategy_id: "CONNECT_AUTH_TO_SERVER",
      title: "Connect auth system to API server",
      score: 0.90,
      target_file: "code/src/workspace/apiServer.js",
      rationale: "The request clearly asks to connect the authentication system to the API server."
    });
  }

  if (
    lower.includes("authentication") ||
    lower.includes("auth") ||
    lower.includes("login")
  ) {
    strategies.push({
      strategy_id: "USER_AUTH_SYSTEM",
      title: "Full user authentication system",
      score: 0.95,
      target_file: "code/src/auth/authSystem.js",
      rationale: "The request clearly asks for a user authentication system."
    });
  }

  if (strategies.length === 0) {
    strategies.push({
      strategy_id: "FALLBACK_ECHO",
      title: "Fallback echo generation",
      score: 0.4,
      target_file: file,
      rationale: "No stronger strategy matched the request."
    });
  }

  strategies.sort((a, b) => b.score - a.score);

  return strategies;
}

function buildFileTypeAwareProposal(requestText, targetFile) {
  const raw = String(requestText || "").trim();
  const lower = raw.toLowerCase();
  const file = String(targetFile || "").trim();

  if (
    file === "web/index.html" &&
    lower.includes("button")
  ) {
    return {
      strategy: "HTML_BUTTON_CREATE",
      target_file: file,
      content: "",
      operations: [
        {
          type: "insert_before",
          anchor: "</body>",
          content: `  <button id="newButton">Click Me</button>\n`
        }
      ]
    };
  }

  if (
    file === "code/src/workspace/apiServer.js" &&
    lower.includes("logging")
  ) {
    return {
      strategy: "BACKEND_LOGGING_MIDDLEWARE",
      target_file: file,
      content:
`app.use((req, res, next) => {
  console.log(\`\${req.method} \${req.url}\`);
  next();
});`
    };
  }

  return null;
}

function normalizeProjectId(projectIdInput) {
  const s = typeof projectIdInput === "string"
    ? projectIdInput.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    : "";
  return s || "default_project";
}

function normalizeProjectName(projectNameInput) {
  return typeof projectNameInput === "string" && projectNameInput.trim() !== ""
    ? projectNameInput.trim()
    : "New Project";
}

function buildProjectId(projectIdInput, projectNameInput) {
  const directValue = typeof projectIdInput === "string" ? projectIdInput.trim().toLowerCase() : "";
  const fallbackValue = normalizeProjectName(projectNameInput).toLowerCase();

  const normalized = (directValue || fallbackValue)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || `project_${Date.now()}`;
}

function getProjectStateRel(projectIdInput) {
  return `artifacts/projects/${normalizeProjectId(projectIdInput)}/project_state.json`;
}

function getProjectDecisionLinksRel(projectIdInput, linkId) {
  return `artifacts/projects/${normalizeProjectId(projectIdInput)}/ai/decision_links/${linkId}.json`;
}

function getProjectExecutionPackageRel(projectIdInput) {
  return `artifacts/projects/${normalizeProjectId(projectIdInput)}/execute/execution_package.json`;
}

function renderDecisionPacketMd(packet) {
  const lines = [];

  lines.push("# Decision Packet");
  lines.push("");
  lines.push(`- execution_id: ${packet.execution_id}`);
  lines.push(`- workspace_id: ${packet.workspace_id}`);
  lines.push(`- project_id: ${packet.project_id}`);
  lines.push(`- source: ${packet.source}`);
  lines.push("");

  lines.push("## Approval");
  lines.push(`- policy_version: ${packet.approval.policy_version}`);
  lines.push(`- approved_by_role: ${packet.approval.approved_by_role}`);
  lines.push(`- required_roles: ${(packet.approval.required_roles || []).join(", ")}`);
  lines.push(`- approved_at: ${packet.approval.approved_at}`);
  lines.push("");

  lines.push("## Operation");
  lines.push(`- mode: ${packet.operation.mode}`);
  lines.push(`- file_count: ${packet.operation.file_count}`);
  lines.push(`- total_bytes: ${packet.operation.total_bytes}`);
  lines.push("");

  lines.push("## Question");
  lines.push(packet.question);
  lines.push("");

  lines.push("## Context Summary");
  lines.push(packet.context_summary || "N/A");
  lines.push("");

  lines.push("## Proposed Files");
  (packet.proposed_files || []).forEach((file) => {
    lines.push(`- ${file.path}`);
    lines.push(`  - allow_overwrite: ${file.allow_overwrite ? "true" : "false"}`);
    lines.push(`  - sha256: ${file.sha256}`);
    lines.push(`  - required_roles: ${(file.required_roles || []).join(", ")}`);
    lines.push(`  - file_index: ${file.file_index}/${file.file_count}`);
  });

  return lines.join("\n");
}

function buildExecutionPackage(packet) {
  const proposedFiles = Array.isArray(packet && packet.proposed_files)
    ? packet.proposed_files
    : [];

  const projectId = normalizeProjectId(packet && packet.project_id ? packet.project_id : "");

  return {
    package_id: `execution_package_${Date.now()}`,
    created_at: new Date().toISOString(),
    source: "EXTERNAL_AI_WORKSPACE",
    handoff_status: "APPROVED_PENDING_FORGE",
    project_id: projectId,
    execution_id: String(packet && packet.execution_id ? packet.execution_id : ""),
    artifact_path: getProjectExecutionPackageRel(projectId),
    approved_scope: {
      summary: String(packet && packet.context_summary ? packet.context_summary : ""),
      operation_mode:
        packet && packet.operation && typeof packet.operation.mode === "string"
          ? packet.operation.mode
          : "",
      file_count:
        packet && packet.operation && Number.isInteger(packet.operation.file_count)
          ? packet.operation.file_count
          : proposedFiles.length
    },
    target_project_path: null,
    requested_outputs: proposedFiles.map((file) => `Apply approved change to ${String(file && file.path ? file.path : "")}`),
    file_or_artifact_targets: proposedFiles.map((file) => String(file && file.path ? file.path : "")),
    dependency_assumptions: [],
    risk_notes: proposedFiles.length > 1 ? ["MULTI_FILE_CHANGESET"] : [],
    execution_approval_reference: {
      decision_packet_json: `artifacts/projects/${projectId}/decisions/decision_packet.json`,
      decision_packet_md: `artifacts/projects/${projectId}/decisions/decision_packet.md`,
      approved_by_role:
        packet && packet.approval && typeof packet.approval.approved_by_role === "string"
          ? packet.approval.approved_by_role
          : "",
      approved_at:
        packet && packet.approval && typeof packet.approval.approved_at === "string"
          ? packet.approval.approved_at
          : ""
    },
    finalized_documentation_set: [
      `artifacts/projects/${projectId}/decisions/decision_packet.json`,
      `artifacts/projects/${projectId}/decisions/decision_packet.md`
    ],
    execution_plan: {
      mode:
        packet && packet.operation && typeof packet.operation.mode === "string"
          ? packet.operation.mode
          : "",
      file_count:
        packet && packet.operation && Number.isInteger(packet.operation.file_count)
          ? packet.operation.file_count
          : proposedFiles.length,
      proposed_files: proposedFiles.map((file) => ({
        path: String(file && file.path ? file.path : ""),
        allow_overwrite: !!(file && file.allow_overwrite === true),
        sha256: String(file && file.sha256 ? file.sha256 : ""),
        required_roles: Array.isArray(file && file.required_roles) ? file.required_roles : [],
        diff: String(file && file.diff ? file.diff : "")
      }))
    },
    business_and_scope_decisions: {
      confirmation_required_format:
        typeof (packet && packet.confirmation_required_format) === "string"
          ? packet.confirmation_required_format
          : "",
      context_summary: String(packet && packet.context_summary ? packet.context_summary : ""),
      options: Array.isArray(packet && packet.options) ? packet.options : []
    }
  };
}

module.exports = {
  uniqueLower,
  normalizeRelativePath,
  assertApproverRoleAllowed,
  buildDecisionBatchStats,
  sha256,
  buildSimpleDiff,
  detectOperationType,
  readJsonSafe,
  readTextSafe,
  buildRequestAwareFileContext,
  normalizePatchOperations,
  interpretUserIntent,
  toPascalCase,
  buildSmartProposalCode,
  buildCodeAwareEditProposal,
  scanProjectFiles,
  resolveTargetFileForRequest,
  buildStrategyCandidates,
  buildFileTypeAwareProposal,
  normalizeProjectId,
  normalizeProjectName,
  buildProjectId,
  getProjectStateRel,
  getProjectDecisionLinksRel,
  getProjectExecutionPackageRel,
  renderDecisionPacketMd,
  buildExecutionPackage
};
