"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { handleAuthRequest } = require("../auth/authSystem");
const { createAiOsRuntime } = require("../ai_os/projectRuntime");

const ProviderRouter = require("../providers/providerRouter");

function createWorkspaceApiServer(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const port = Number(options.port || process.env.FORGE_WORKSPACE_API_PORT || 3100);

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

  function uniqueLower(values) {
    return Array.from(new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
    ));
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

  function normalizeRelativePath(inputPath) {
    return String(inputPath || "").trim().replace(/\\/g, "/");
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

  function buildFocusedFileContext(fileContent) {
    const text = String(fileContent || "");
    const maxChars = 12000;

    if (text.length <= maxChars) {
      return text;
    }

    const head = text.slice(0, 7000);
    const tail = text.slice(-4000);

    return [
      head,
      "",
      "/* ... FILE CONTEXT TRUNCATED FOR PATCH GENERATION ... */",
      "",
      tail
    ].join("\n");
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

  function applyPatchOperations(baseContent, operations, filePath = "") {
    const normalizedOperations = normalizePatchOperations(operations);

    if (normalizedOperations.length === 0) {
      throw new Error(`Patch operations are required for: ${filePath || "unknown file"}`);
    }

    let nextContent = String(baseContent || "");

    normalizedOperations.forEach((operation) => {
      if (operation.type === "write_full_file") {
        nextContent = operation.content;
        return;
      }

      if (operation.type === "replace_once") {
        if (!operation.find) {
          throw new Error(`replace_once missing find for: ${filePath}`);
        }

        if (nextContent.includes(operation.find)) {
          nextContent = nextContent.replace(operation.find, operation.replace);
          return;
        }

        const normalizedCurrent = nextContent.replace(/\r\n/g, "\n");
        const normalizedFind = operation.find.replace(/\r\n/g, "\n");
        const normalizedReplace = operation.replace.replace(/\r\n/g, "\n");

        if (!normalizedCurrent.includes(normalizedFind)) {
          throw new Error(`replace_once anchor not found for: ${filePath}`);
        }

        nextContent = normalizedCurrent.replace(normalizedFind, normalizedReplace);
        return;
      }

      if (operation.type === "insert_after") {
        const anchor = operation.anchor || operation.find;
        const content = operation.content || operation.replace;

        if (!anchor) {
          throw new Error(`insert_after missing anchor for: ${filePath}`);
        }

        if (!nextContent.includes(anchor)) {
          throw new Error(`insert_after anchor not found for: ${filePath}`);
        }

        nextContent = nextContent.replace(
          anchor,
          `${anchor}${content}`
        );
        return;
      }

      if (operation.type === "insert_before") {
        const anchor = operation.anchor || operation.find;
        const content = operation.content || operation.replace;

        if (!anchor) {
          throw new Error(`insert_before missing anchor for: ${filePath}`);
        }

        if (!nextContent.includes(anchor)) {
          throw new Error(`insert_before anchor not found for: ${filePath}`);
        }

        nextContent = nextContent.replace(
          anchor,
          `${content}${anchor}`
        );
        return;
      }

      if (operation.type === "delete_once") {
        if (!operation.find) {
          throw new Error(`delete_once missing find for: ${filePath}`);
        }

        if (!nextContent.includes(operation.find)) {
          throw new Error(`delete_once target not found for: ${filePath}`);
        }

        nextContent = nextContent.replace(operation.find, "");
        return;
      }

      throw new Error(`Unsupported patch operation type: ${operation.type}`);
    });

    return nextContent;
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

module.exports = {
  registerAuthRoutes
};`
          },
          {
            path: "code/src/workspace/apiServer.js",
            content:
`const { registerAuthRoutes } = require("../auth/authSystem");

function integrateAuth(app) {
  registerAuthRoutes(app);
}`
          }
        ]
      };
    }

    if (
      lower.includes("connect") &&
      (lower.includes("auth") || lower.includes("authentication")) &&
      lower.includes("server")
    ) {
      return {
        strategy: "CONNECT_AUTH_TO_SERVER",
        target_file: "code/src/workspace/apiServer.js",
        content:
`const { registerAuthRoutes } = require("../auth/authSystem");

function integrateAuth(app) {
  registerAuthRoutes(app);
}`
      };
    }

    if (
      lower.includes("authentication") ||
      lower.includes("auth") ||
      lower.includes("login")
    ) {
      return {
        strategy: "USER_AUTH_SYSTEM",
        target_file: "code/src/auth/authSystem.js",
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

module.exports = {
  registerAuthRoutes
};`
      };
    }

    const printMatch = lower.match(/^create\s+a\s+function\s+that\s+prints\s+(.+)$/i);
    if (printMatch) {
      const message = raw.slice(raw.toLowerCase().indexOf("prints") + "prints".length).trim();
      const functionName = `print${toPascalCase(message) || "Message"}`;
      const safeMessage = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      return {
        strategy: "FUNCTION_PRINT",
        target_file: "code/test_workspace_integration.js",
        content:
`function ${functionName}() {
  console.log("${safeMessage}");
}`
      };
    }

    const apiMatch = lower.match(/^create\s+an?\s+api\s+endpoint\s+called\s+(.+)$/i);
    if (apiMatch) {
      const endpointNameRaw = raw.slice(raw.toLowerCase().indexOf("called") + "called".length).trim();
      const endpointName = endpointNameRaw
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "new-endpoint";

      return {
        strategy: "API_ENDPOINT_CREATE",
        target_file: "code/test_workspace_integration.js",
        content:
`function register${toPascalCase(endpointName)}Endpoint(app) {
  app.post("/api/${endpointName}", (req, res) => {
    res.json({ ok: true, endpoint: "${endpointName}" });
  });
}`
      };
    }

    const loggingMatch = lower.match(/^edit\s+this\s+file\s+to\s+add\s+logging$/i);
    if (loggingMatch) {
      return {
        strategy: "EDIT_ADD_LOGGING",
        target_file: "code/test_workspace_integration.js",
        content:
`console.log("Logging enabled");

function testWorkspaceIntegration() {
  console.log("testWorkspaceIntegration started");
}`
      };
    }

    const safeRaw = raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    return {
      strategy: "FALLBACK_ECHO",
      target_file: "code/test_workspace_integration.js",
      content:
`// Generated from request:
// ${raw}

console.log("${safeRaw}");`
    };
  }

  function buildCodeAwareEditProposal(requestText, currentContent, targetFile) {
    const raw = String(requestText || "").trim();
    const lower = raw.toLowerCase();
    const existing = String(currentContent || "");

    if (/^edit\s+this\s+file\s+to\s+add\s+logging$/i.test(lower)) {
      const trimmedExisting = existing.trim();

      if (!trimmedExisting) {
        return {
          strategy: "EDIT_ADD_LOGGING_EMPTY_FILE",
          target_file: targetFile,
          content:
`function testWorkspaceIntegration() {
  console.log("testWorkspaceIntegration started");
}`
        };
      }

      if (trimmedExisting.includes('console.log("testWorkspaceIntegration started");')) {
        return {
          strategy: "EDIT_ADD_LOGGING_ALREADY_PRESENT",
          target_file: targetFile,
          content: trimmedExisting
        };
      }

      const functionMatch = existing.match(/function\s+([a-zA-Z0-9_]+)\s*\(\)\s*\{([\s\S]*?)\}/);

      if (functionMatch) {
        const functionName = functionMatch[1];
        const fullMatch = functionMatch[0];
        const bodyContent = functionMatch[2];

        const logLine = `  console.log("${functionName} started");`;

        if (bodyContent.includes(`${functionName} started`)) {
          return {
            strategy: "EDIT_ADD_LOGGING_ALREADY_PRESENT",
            target_file: targetFile,
            content: trimmedExisting
          };
        }

        const normalizedBody = bodyContent.replace(/^\s*\n/, "");
        const cleanedBody = bodyContent
  .replace(/^\s*\n/, "")
  .replace(/\s*$/, "");

const updatedFunction =
`function ${functionName}() {
${logLine}${cleanedBody ? `\n${cleanedBody}` : ""}
}`;

        return {
          strategy: "EDIT_ADD_LOGGING_STRUCTURE_AWARE",
          target_file: targetFile,
          content: existing.replace(fullMatch, updatedFunction).trim()
        };
      }

      return {
        strategy: "EDIT_ADD_LOGGING_FILE_AWARE_FALLBACK",
        target_file: targetFile,
        content:
`console.log("Logging enabled");

${trimmedExisting}`
      };
    }

    return null;
  }

  function scanProjectFiles() {
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

  function buildAiAnalysisArtifacts(requestText) {
    const sessionId = `ai_analysis_${Date.now()}`;
    const createdAt = new Date().toISOString();

    ensureDir(aiConversationsRoot);
    ensureDir(aiContextRoot);
    ensureDir(aiAnalysisRoot);

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

    fs.writeFileSync(path.resolve(root, conversationRel), JSON.stringify(conversationArtifact, null, 2));
    fs.writeFileSync(path.resolve(root, contextRel), JSON.stringify(contextArtifact, null, 2));
    fs.writeFileSync(path.resolve(root, analysisRel), JSON.stringify(analysisArtifact, null, 2));

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

  function buildExecutionPlanFromDraft(draftArtifact, executionId) {
    const files = Array.isArray(draftArtifact.files) ? draftArtifact.files : [];

    return {
      workspace_execution_id: executionId,
      generated_at: new Date().toISOString(),
      files: files.map((file) => {
        const operations = normalizePatchOperations(file.operations);

        if (operations.length > 0) {
          return {
            file_path: file.path,
            operation: "modify",
            changes: [
              {
                type: "targeted_patch",
                operations
              }
            ]
          };
        }

        return {
          file_path: file.path,
          operation: "create",
          changes: [
            {
              type: "full_content",
              content: file.content
            }
          ]
        };
      })
    };
  }

  function materializeDraftFilesForApproval(draftArtifact) {
    const files = Array.isArray(draftArtifact && draftArtifact.files)
      ? draftArtifact.files
      : [];

    return files.map((file) => {
      const relPath = normalizeRelativePath(file && file.path ? file.path : "");
      const absolutePath = path.resolve(root, relPath);
      const baseContent = fs.existsSync(absolutePath)
        ? fs.readFileSync(absolutePath, "utf8")
        : "";
      const operations = normalizePatchOperations(file && file.operations);

      const content = operations.length > 0
        ? applyPatchOperations(baseContent, operations, relPath)
        : (typeof (file && file.content) === "string" ? file.content : "");

      return {
        path: relPath,
        content,
        allow_overwrite: file && file.allow_overwrite === true
      };
    });
  }

  function applyExecutionPlan(executionPlan) {
    const plan = executionPlan && typeof executionPlan === "object" ? executionPlan : {};
    const files = Array.isArray(plan.files) ? plan.files : [];

    if (files.length === 0) {
      throw new Error("Execution plan contains no files");
    }

    const appliedFiles = files.map((file) => {
      const relPath = normalizeRelativePath(file && file.file_path ? file.file_path : "");
      const absolutePath = path.resolve(root, relPath);

      if (!relPath) {
        throw new Error("Execution plan file_path is required");
      }

      if (!isPathAllowed(absolutePath)) {
        throw new Error(`Execution blocked for path: ${relPath}`);
      }

      const changes = Array.isArray(file.changes) ? file.changes : [];
      const patchChange = changes.find((change) => change && change.type === "targeted_patch");
      const fullContentChange = changes.find((change) => change && change.type === "full_content");

      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

      let finalContent = "";
      let bytesWritten = 0;

      if (patchChange) {
        const existing = fs.existsSync(absolutePath)
          ? fs.readFileSync(absolutePath, "utf8")
          : "";

        finalContent = applyPatchOperations(
          existing,
          patchChange.operations,
          relPath
        );

        bytesWritten = Buffer.byteLength(finalContent, "utf8");
      } else if (fullContentChange) {
        const content = typeof fullContentChange.content === "string" ? fullContentChange.content : "";

        finalContent = content;

        if (fs.existsSync(absolutePath)) {
          const existing = fs.readFileSync(absolutePath, "utf8");

          const hasGeneratedRequestBlock =
            content.includes("// Generated from request:") ||
            content.includes("// Generated from request:\r\n");

          if (hasGeneratedRequestBlock) {
            let baseContent = existing;

            baseContent = baseContent.replace(
              /\n*\/\/ ==== AI GENERATED ADDITION ====\n[\s\S]*?(?=\n\/\/ ==== AI GENERATED ADDITION ====|\n\/\/ ==== AI MERGED ADDITION ====|$)/g,
              ""
            );

            baseContent = baseContent.replace(
              /\n*\/\/ ==== AI MERGED ADDITION ====\n[\s\S]*?(?=\n\/\/ ==== AI GENERATED ADDITION ====|\n\/\/ ==== AI MERGED ADDITION ====|$)/g,
              ""
            );

            baseContent = baseContent.trimEnd();

            finalContent = baseContent
              ? `${baseContent}\n\n// ==== AI MERGED ADDITION ====\n\n${content}`
              : content;
          } else {
            finalContent = existing
              ? `${existing}\n\n${content}`
              : content;
          }
        }

        bytesWritten = Buffer.byteLength(content, "utf8");
      } else {
        throw new Error(`Execution plan missing supported change for: ${relPath}`);
      }

      fs.writeFileSync(absolutePath, finalContent, "utf8");

      return {
        file_path: relPath,
        operation: file.operation || "create",
        bytes_written: bytesWritten
      };
    });

    return {
      ok: true,
      workspace_execution_id: typeof plan.workspace_execution_id === "string"
        ? plan.workspace_execution_id
        : "",
      applied_files: appliedFiles,
      file_count: appliedFiles.length,
      applied_at: new Date().toISOString()
    };
  }

  function buildAiProposalArtifacts(requestText, providerOutput = null, projectIdInput = "") {
    const proposalId = `ai_proposal_${Date.now()}`;
    const createdAt = new Date().toISOString();

    const projectId =
      typeof projectIdInput === "string" && projectIdInput.trim() !== ""
        ? projectIdInput.trim()
        : "default_project";

    const aiProposalsRoot = path.resolve(root, "artifacts", "projects", projectId, "ai", "proposals");
    const aiDraftsRoot = path.resolve(root, "artifacts", "projects", projectId, "ai", "drafts");

    ensureDir(aiProposalsRoot);
    ensureDir(aiDraftsRoot);

    const projectFiles = scanProjectFiles();
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

    fs.writeFileSync(path.resolve(root, proposalRel), JSON.stringify(proposalArtifact, null, 2));
    fs.writeFileSync(path.resolve(root, draftRel), JSON.stringify(draftArtifact, null, 2));

    writeActiveProject(projectId);
    persistProjectState(projectId, {
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

  function normalizeProjectId(projectIdInput) {
    return typeof projectIdInput === "string" && projectIdInput.trim() !== ""
      ? projectIdInput.trim()
      : "default_project";
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

  function writeActiveProject(projectIdInput) {
    const projectId = normalizeProjectId(projectIdInput);
    ensureDir(projectsRoot);
    fs.writeFileSync(activeProjectPath, JSON.stringify({
      project_id: projectId,
      updated_at: new Date().toISOString()
    }, null, 2));
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
      active_project_flag: readActiveProjectId() === projectId,
      last_updated_at: new Date().toISOString()
    };

    return state;
  }

  function persistProjectState(projectIdInput, overrides = {}) {
    const projectId = normalizeProjectId(projectIdInput);
    const state = buildProjectState(projectId, overrides);
    const projectStateAbs = getProjectStateAbs(projectId);

    ensureDir(path.dirname(projectStateAbs));
    fs.writeFileSync(projectStateAbs, JSON.stringify(state, null, 2));

    ensureDir(projectsRoot);

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

    fs.writeFileSync(projectRegistryPath, JSON.stringify(registry, null, 2));

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

  function listProjects() {
    ensureDir(projectsRoot);

    if (!fs.existsSync(activeProjectPath)) {
      writeActiveProject("default_project");
    }

    const items = listKnownProjectIds().map((projectId) => persistProjectState(projectId));

    return {
      active_project_id: readActiveProjectId(),
      items
    };
  }

  function createProject(body = {}) {
    const projectName = normalizeProjectName(body.project_name);
    const baseProjectId = buildProjectId(body.project_id, projectName);

    let projectId = baseProjectId;
    let suffix = 1;

    while (fs.existsSync(getProjectArtifactsRoot(projectId))) {
      projectId = `${baseProjectId}_${suffix}`;
      suffix += 1;
    }

    writeActiveProject(projectId);

    const state = persistProjectState(projectId, {
      project_name: projectName,
      project_status: "ACTIVE"
    });

    return {
      ok: true,
      created: true,
      active_project_id: projectId,
      project: state
    };
  }

  function getProjectArtifactsRoot(projectIdInput) {
    return path.resolve(root, "artifacts", "projects", normalizeProjectId(projectIdInput));
  }

  function getProjectDecisionLinksRoot(projectIdInput) {
    return path.join(getProjectArtifactsRoot(projectIdInput), "ai", "decision_links");
  }

  function getProjectDecisionLinksRel(projectIdInput, linkId) {
    return `artifacts/projects/${normalizeProjectId(projectIdInput)}/ai/decision_links/${linkId}.json`;
  }

  function getProjectExecutionPackageRel(projectIdInput) {
    return `artifacts/projects/${normalizeProjectId(projectIdInput)}/execute/execution_package.json`;
  }

  function getProjectExecutionPackageAbs(projectIdInput) {
    return path.resolve(root, getProjectExecutionPackageRel(projectIdInput));
  }

  function writeDecisionLinkArtifact(proposalId, decisionPacketId, projectIdInput = "") {
    const projectId = normalizeProjectId(projectIdInput);
    const linkRoot = getProjectDecisionLinksRoot(projectId);
    ensureDir(linkRoot);

    const link = {
      link_id: `ai_decision_link_${Date.now()}`,
      created_at: new Date().toISOString(),
      proposal_id: proposalId || "",
      decision_packet_id: decisionPacketId || "",
      project_id: projectId,
      relationship: "PROPOSAL_TO_DECISION"
    };

    const rel = getProjectDecisionLinksRel(projectId, link.link_id);
    fs.writeFileSync(path.resolve(root, rel), JSON.stringify(link, null, 2));

    return rel;
  }

  function appendDecisionLog(entry) {
    const logPath = path.join(llmRoot, "decision_log.json");
    const current = readJsonSafe(logPath, []);
    const items = Array.isArray(current) ? current : [];
    items.push(entry);
    fs.writeFileSync(logPath, JSON.stringify(items, null, 2));
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
    target_project_path: root,
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

  function createDecisionPacket(draft, userRequest, approverRole) {
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

    ensureDir(path.join(llmRoot, "requests"));
    ensureDir(path.join(llmRoot, "responses"));
    ensureDir(path.join(llmRoot, "metadata"));

    const decisionPacketId = `workspace_decision_${Date.now()}`;
    const workspaceId = "personal";
    const projectId = normalizeProjectId(draft.project_id);

    const projectDecisionsRoot = path.resolve(root, "artifacts", "projects", projectId, "decisions");
    ensureDir(projectDecisionsRoot);



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

    fs.writeFileSync(requestPath, JSON.stringify({
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
    }, null, 2));

    fs.writeFileSync(responsePath, JSON.stringify({
      summary: typeof draft.summary === "string" ? draft.summary : "Decision packet created successfully.",
      files: normalizedFiles.map((file) => ({
        path: file.path,
        content: file.content
      }))
    }, null, 2));

    fs.writeFileSync(decisionPacketJsonAbs, JSON.stringify(packet, null, 2));
    fs.writeFileSync(decisionPacketMdAbs, renderDecisionPacketMd(packet));

    const executionPackageAbs = getProjectExecutionPackageAbs(projectId);
    const executionPackage = buildExecutionPackage(packet);

    fs.mkdirSync(path.dirname(executionPackageAbs), { recursive: true });
    fs.writeFileSync(executionPackageAbs, JSON.stringify(executionPackage, null, 2));

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

    fs.writeFileSync(metadataPath, JSON.stringify(result, null, 2));

    writeActiveProject(projectId);
    persistProjectState(projectId, {
      current_phase: "EXECUTION_READY",
      active_runtime_state: "EXECUTION_PREPARATION",
      documentation_state: "APPROVED",
      execution_package_state: "APPROVED",
      execution_state: "PENDING_FORGE",
      accepted_options: ["OPTION-APPROVE-WORKSPACE-DRAFT"]
    });

    appendDecisionLog({
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

    const result = createDecisionPacket(draft, userRequest, approverRole);

    const proposalId =
      body && typeof body.proposal_id === "string"
        ? body.proposal_id
        : "";

    if (proposalId && result && result.decision_packet_id) {
      const linkPath = writeDecisionLinkArtifact(
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
    const result = buildAiAnalysisArtifacts(requestText);
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

    const projectFiles = scanProjectFiles();
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

    const projectFiles = scanProjectFiles();
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

    const projectFiles = scanProjectFiles();
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

    const projectFiles = scanProjectFiles();
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

    const result = buildAiProposalArtifacts(
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

  async function handleApprove(body, res) {
    const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
    const approverRole = typeof body.approver_role === "string" && body.approver_role.trim()
      ? body.approver_role.trim()
      : "cto";

    const discoveryGate = assertWorkspaceDiscoveryComplete(body);

    if (!discoveryGate.ok) {
      sendJson(res, 409, discoveryGate);
      return;
    }

    if (!proposalId) {
      sendJson(res, 400, { error: "proposal_id is required" });
      return;
    }

    const projectId =
      typeof body.project_id === "string" && body.project_id.trim() !== ""
        ? body.project_id.trim()
        : "default_project";

    const draftPath = path.resolve(
      root,
      "artifacts",
      "projects",
      projectId,
      "ai",
      "drafts",
      `${proposalId}.draft.json`
    );
    const proposalPath = path.resolve(
      root,
      "artifacts",
      "projects",
      projectId,
      "ai",
      "proposals",
      `${proposalId}.proposal.json`
    );

    if (!fs.existsSync(draftPath)) {
      sendJson(res, 404, { error: "Draft not found" });
      return;
    }

    const draftArtifact = readJsonSafe(draftPath, null);
    const proposalArtifact = readJsonSafe(proposalPath, null);

    if (!draftArtifact || !Array.isArray(draftArtifact.files)) {
      sendJson(res, 400, { error: "Invalid draft artifact" });
      return;
    }

    const materializedFiles = materializeDraftFilesForApproval(draftArtifact);

    const decisionResult = createDecisionPacket(
      {
        ...draftArtifact,
        files: materializedFiles,
        summary: proposalArtifact && typeof proposalArtifact.description === "string"
          ? proposalArtifact.description
          : "Proposal approved for execution."
      },
      proposalArtifact && typeof proposalArtifact.request === "string"
        ? proposalArtifact.request
        : "",
      approverRole
    );

    draftArtifact.approved = true;
    draftArtifact.ready_for_decision = true;
    draftArtifact.approved_at = new Date().toISOString();
    draftArtifact.approved_by_role = approverRole;

    if (proposalArtifact && typeof proposalArtifact === "object") {
      proposalArtifact.execution_approved = true;
      proposalArtifact.execution_approved_at = new Date().toISOString();
      proposalArtifact.execution_approved_by_role = approverRole;
      fs.writeFileSync(proposalPath, JSON.stringify(proposalArtifact, null, 2), "utf8");
    }

    fs.writeFileSync(draftPath, JSON.stringify(draftArtifact, null, 2), "utf8");

    if (decisionResult && decisionResult.decision_packet_id) {
      decisionResult.decision_link_artifact = writeDecisionLinkArtifact(
        proposalId,
        decisionResult.decision_packet_id,
        decisionResult.project_id
      );
    }

    sendJson(res, 200, {
      ok: true,
      mode: "APPROVED",
      proposal_id: proposalId,
      approver_role: approverRole,
      decision: decisionResult
    });
  }

  async function handleApplyExecutePlan(body, res) {
    sendJson(res, 409, {
      ok: false,
      error: "CONVERSATION_EXECUTION_BLOCKED",
      message: "Direct execution from conversation/workspace is blocked. Approved execution must be handed off to Forge through an approved execution package."
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://localhost");
      const pathname = requestUrl.pathname;
      if (req.method === "OPTIONS") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true, service: "forge-workspace-api" });
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
        sendJson(res, 200, aiOsRuntime.registerOptions(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/decision") {
        const body = await readBody(req);
        sendJson(res, 200, aiOsRuntime.decideOption(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/documentation/draft") {
        const body = await readBody(req);
        sendJson(res, 200, aiOsRuntime.saveDocumentationDraft(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/documentation/approve") {
        const body = await readBody(req);
        sendJson(res, 200, aiOsRuntime.approveDocumentation(body));
        return;
      }

      if (req.method === "POST" && pathname === "/api/ai-os/handoff") {
        const body = await readBody(req);
        sendJson(res, 200, aiOsRuntime.createExecutionHandoff(body));
        return;
      }

      if (req.method === "GET" && pathname === "/api/ai-os/project") {
        sendJson(res, 200, aiOsRuntime.getProject({
          project_id: requestUrl.searchParams.get("project_id") || ""
        }));
        return;
      }

      if (req.method === "GET" && pathname === "/api/projects") {
        sendJson(res, 200, listProjects());
        return;
      }

      if (req.method === "POST" && pathname === "/api/projects/create") {
        const body = await readBody(req);
        const result = createProject(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/projects/activate") {
        const body = await readBody(req);
        const projectId = writeActiveProject(
          typeof body.project_id === "string" ? body.project_id.trim() : ""
        );
        const state = persistProjectState(projectId);
        sendJson(res, 200, {
          ok: true,
          active_project_id: projectId,
          project: state
        });
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

      if (req.method === "POST" && req.url === "/api/ai/approve") {
        const body = await readBody(req);
        await handleApprove(body, res);
        return;
      }

      if (req.method === "POST" && req.url === "/api/ai/apply-execute-plan") {
        const body = await readBody(req);
        await handleApplyExecutePlan(body, res);
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

      if (req.method === "POST" && req.url === "/api/ai/draft") {
        const body = await readBody(req);

        const discoveryGate = assertWorkspaceDiscoveryComplete(body);

        if (!discoveryGate.ok) {
          sendJson(res, 409, discoveryGate);
          return;
        }

        const requestText = typeof body.request === "string" ? body.request.trim() : "";

        if (!requestText) {
          sendJson(res, 400, { error: "Request is required" });
          return;
        }

        const draft = {
          files: [
            {
              path: "code/test_workspace_integration.js",
              content: requestText.includes("Overwrite file")
                ? requestText.split("with:")[1]?.split("allow_overwrite")[0]?.trim() || ""
                : `console.log("Auto-generated from request");`,
              allow_overwrite: true
            }
          ]
        };

        sendJson(res, 200, draft);
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

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : "Internal server error" });
    }
  });

  return {
    port,
    server,
    start() {
      return new Promise((resolve) => {
        server.listen(port, () => resolve({ port }));
      });
    }
  };
}

module.exports = {
  createWorkspaceApiServer
};