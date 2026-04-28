const http = require("http");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const webRoot = path.resolve(root, "web");
const indexPath = path.join(webRoot, "index.html");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const llmRoot = path.resolve(root, "artifacts/llm");
const allowedWriteRoots = [
  path.resolve(root, "artifacts/llm"),
  path.resolve(root, "web"),
  path.resolve(root, "code/tools"),
  path.resolve(root, "code")
];

const approvalPolicyPath = path.resolve(root, "artifacts/llm/approval_policy.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isWithin(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) || relative === "";
}

function normalizeDraftFiles(files) {
  if (!Array.isArray(files)) {
    throw new Error("Draft payload missing files array");
  }

  return files.map(file => {
    const filePath = typeof file.path === "string" ? file.path.trim() : "";
    const fileContent = typeof file.content === "string" ? file.content : "";

    if (!filePath) {
      throw new Error("Draft contains invalid file path");
    }

    if (path.isAbsolute(filePath)) {
      throw new Error("Absolute paths are not allowed");
    }

    const normalizedPath = filePath.replace(/\\/g, "/");
    const targetPath = path.resolve(root, normalizedPath);

    const exists = fs.existsSync(targetPath);

    if (exists) {
      if (file.allow_overwrite !== true) {
        throw new Error(`Overwrite requires allow_overwrite=true: ${normalizedPath}`);
      }
    }

    if (!isWithin(root, targetPath)) {
      throw new Error(`Path escapes workspace: ${normalizedPath}`);
    }

    const allowed = allowedWriteRoots.some(basePath => isWithin(basePath, targetPath));

    if (!allowed) {
      throw new Error(`Write blocked for path: ${normalizedPath}`);
    }

    return {
      path: normalizedPath,
      content: fileContent,
      absolutePath: targetPath
    };
  });
}

function uniqueLower(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map(value => String(value || "").trim().toLowerCase())
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
        ? parsed.path_rules.map(rule => ({
            match_prefix: typeof rule.match_prefix === "string" ? rule.match_prefix.trim().replace(/\\/g, "/") : "",
            required_roles: uniqueLower(rule.required_roles)
          })).filter(rule => rule.match_prefix && rule.required_roles.length > 0)
        : []
    };
  } catch (err) {
    return fallback;
  }
}

function resolveRequiredRolesForFiles(files) {
  const policy = loadApprovalPolicy();
  const matchedRoles = new Set();

  (Array.isArray(files) ? files : []).forEach(file => {
    const relPath = String(file && file.path ? file.path : "").trim().replace(/\\/g, "/");

    policy.path_rules.forEach(rule => {
      if (relPath.startsWith(rule.match_prefix)) {
        rule.required_roles.forEach(role => matchedRoles.add(role));
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

  return (Array.isArray(files) ? files : []).map(file => {
    const relPath = String(file && file.path ? file.path : "").trim().replace(/\\/g, "/");
    const matchedRoles = new Set();

    policy.path_rules.forEach(rule => {
      if (relPath.startsWith(rule.match_prefix)) {
        rule.required_roles.forEach(role => matchedRoles.add(role));
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

function createDecisionPacket(draft, userRequest, approverRole) {
  const normalizedFiles = normalizeDraftFiles(draft.files);

  const batchPolicy = assertDecisionBatchAllowed(normalizedFiles);
  const fileRoleRequirements = resolveFileRoleRequirements(normalizedFiles);

  const approvalPolicy = resolveRequiredRolesForFiles(normalizedFiles);
  const approvedByRole = assertApproverRoleAllowed(approverRole, approvalPolicy.required_roles);

  const diffs = normalizedFiles.map(file => {
    let oldContent = "";

    if (fs.existsSync(file.absolutePath)) {
      try {
        oldContent = fs.readFileSync(file.absolutePath, "utf-8");
      } catch (err) {
        oldContent = "";
      }
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
  const projectId = normalizeProjectId(
    draft && typeof draft.project_id === "string" ? draft.project_id : ""
  );
  const projectDecisionsRoot = getProjectDecisionsRoot(projectId);

  ensureDir(projectDecisionsRoot);

  const decisionPacketId = `workspace_decision_${Date.now()}`;
  const workspaceId = "personal";

  const requestPath = path.join(llmRoot, "requests", `${decisionPacketId}.request.json`);
  const responsePath = path.join(llmRoot, "responses", `${decisionPacketId}.response.json`);
  const metadataPath = path.join(llmRoot, "metadata", `${decisionPacketId}.decision.json`);

  const decisionPacketJsonRel = getProjectDecisionPacketJsonRel(projectId);
  const decisionPacketMdRel = getProjectDecisionPacketMdRel(projectId);
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
    triggering_gaps: [
      "WORKSPACE_CHANGE_REQUEST"
    ],
    question: "Approve the queued workspace draft for governed deterministic application?",
    context_summary: userRequest || "",
    options: [
      {
        option_id: "OPTION-APPROVE-WORKSPACE-DRAFT",
        description: "Queue the workspace draft as a governed pending change set.",
        impact_scope: "EXTERNAL_WORKSPACE",
        risk_level: "MEDIUM",
        downstream_effects: normalizedFiles.map(file => `Apply candidate change to ${file.path}`),
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
        fileRoleRequirements.find(item => item.path === file.path)?.required_roles || approvalPolicy.required_roles,
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
    files: normalizedFiles.map(file => ({
      path: file.path,
      content: file.content
    }))
  }, null, 2));

  fs.writeFileSync(decisionPacketJsonAbs, JSON.stringify(packet, null, 2));
  fs.writeFileSync(decisionPacketMdAbs, renderDecisionPacketMd(packet));

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
      decisionPacketJsonRel,
      decisionPacketMdRel
    ],
    queued_files: normalizedFiles.map(file => file.path),
    summary: typeof draft.summary === "string" ? draft.summary : "Decision packet created successfully.",
    diffs
  };

  fs.writeFileSync(metadataPath, JSON.stringify(result, null, 2));

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
    queued_files: normalizedFiles.map(file => file.path)
  });

  return result;
}

function getRecentWrites(limit = 10) {
  const metadataDir = path.join(llmRoot, "metadata");

  if (!fs.existsSync(metadataDir)) {
    return [];
  }

  const items = fs.readdirSync(metadataDir)
    .filter(name => name.endsWith(".write.json") || name.endsWith(".decision.json"))
    .map(name => {
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
        fullPath,
        mtimeMs: stat.mtimeMs,
        data: parsed
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map(item => {
      const data = item.data && typeof item.data === "object" ? item.data : {};
      const isDecision = item.name.endsWith(".decision.json");

      return {
        entry_type: isDecision ? "DECISION_PACKET" : "WRITE",
        write_id: typeof data.write_id === "string" ? data.write_id : "",
        decision_packet_id: typeof data.decision_packet_id === "string" ? data.decision_packet_id : "",
        approver_role: typeof data.approver_role === "string" ? data.approver_role : "",
        required_roles: Array.isArray(data.required_roles) ? data.required_roles : [],
        approval_policy_version: typeof data.approval_policy_version === "string" ? data.approval_policy_version : "",
        operation_mode: typeof data.operation_mode === "string" ? data.operation_mode : "",
        file_count: Number.isInteger(data.file_count) ? data.file_count : 0,
        total_bytes: Number.isInteger(data.total_bytes) ? data.total_bytes : 0,
        written_files: Array.isArray(data.written_files) ? data.written_files : [],
        queued_files: Array.isArray(data.queued_files) ? data.queued_files : [],
        summary: typeof data.summary === "string" ? data.summary : "",
        ok: !!data.ok,
        logged_at: new Date(item.mtimeMs).toISOString()
      };
    });

  return items;
}

function buildSimpleDiff(oldContent, newContent) {
  if (oldContent === newContent) {
    return "No changes";
  }

  const oldLines = String(oldContent || "").split("\n");
  const newLines = String(newContent || "").split("\n");
  const maxLength = Math.max(oldLines.length, newLines.length);
  const diffLines = [];

  for (let i = 0; i < maxLength; i += 1) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        diffLines.push(`  ${oldLine}`);
      }
      continue;
    }

    if (oldLine !== undefined) {
      diffLines.push(`- ${oldLine}`);
    }

    if (newLine !== undefined) {
      diffLines.push(`+ ${newLine}`);
    }
  }

  return diffLines.join("\n");
}

function normalizeProjectId(projectIdInput) {
  return typeof projectIdInput === "string" && projectIdInput.trim() !== ""
    ? projectIdInput.trim()
    : "default_project";
}

function getProjectDecisionsRoot(projectIdInput) {
  return path.resolve(
    root,
    "artifacts",
    "projects",
    normalizeProjectId(projectIdInput),
    "decisions"
  );
}

function getProjectDecisionPacketJsonRel(projectIdInput) {
  return `artifacts/projects/${normalizeProjectId(projectIdInput)}/decisions/decision_packet.json`;
}

function getProjectDecisionPacketMdRel(projectIdInput) {
  return `artifacts/projects/${normalizeProjectId(projectIdInput)}/decisions/decision_packet.md`;
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

function sha256(content) {
  return crypto.createHash("sha256").update(String(content || ""), "utf8").digest("hex");
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

  lines.push("## Question");
  lines.push(packet.question);
  lines.push("");

  lines.push("## Context Summary");
  lines.push(packet.context_summary || "N/A");
  lines.push("");

  lines.push("## Options");
  (packet.options || []).forEach(option => {
    lines.push(`- ${option.option_id}: ${option.description}`);
    lines.push(`  - impact_scope: ${option.impact_scope}`);
    lines.push(`  - risk_level: ${option.risk_level}`);
    (option.downstream_effects || []).forEach(effect => {
      lines.push(`  - downstream_effect: ${effect}`);
    });
  });
  lines.push("");

  lines.push("## Proposed Files");
  (packet.proposed_files || []).forEach(file => {
    lines.push(`- ${file.path}`);
    lines.push(`  - allow_overwrite: ${file.allow_overwrite ? "true" : "false"}`);
    lines.push(`  - sha256: ${file.sha256}`);
  });
  lines.push("");

  lines.push("## Confirmation Required Format");
  lines.push(`- ${packet.confirmation_required_format}`);
  lines.push("");

  return lines.join("\n");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(text);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function buildPrompt(userRequest) {
  return `
You generate FILE DRAFTS for a local workspace.

Return STRICT JSON only in this exact shape:

{
  "summary": "short summary",
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "content": "full file content"
    }
  ]
}

Rules:
- Return JSON only
- Do not wrap JSON in markdown
- Paths must be relative
- Do not include explanations outside JSON
- Do not propose deleting files
- Do not write anything inside Forge pipeline governance paths
- Allowed write areas are only:
  - artifacts/llm/
  - web/
  - code/tools/
- Do not use absolute paths
- Do not use path traversal
- When updating an existing file, you MUST include:
  "allow_overwrite": true
  inside the file object
- If the request is an update and you do not include allow_overwrite, the write will be rejected

User request:
${userRequest}
`.trim();
}

async function generateDraft(userRequest) {
  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "You are a strict JSON file-drafting engine."
      },
      {
        role: "user",
        content: buildPrompt(userRequest)
      }
    ]
  });

  const content = response.choices?.[0]?.message?.content || "";

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error("Model returned invalid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid draft payload");
  }

  const normalizedFiles = normalizeDraftFiles(parsed.files).map((file, index) => ({
    path: file.path,
    content: file.content,
    allow_overwrite: parsed.files[index] && parsed.files[index].allow_overwrite === true
  }));

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "Draft generated successfully.",
    files: normalizedFiles
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      const html = fs.readFileSync(indexPath, "utf-8");
      sendText(res, 200, html, "text/html; charset=utf-8");
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/artifacts/ai/drafts/")) {
      const relativePath = decodeURIComponent(req.url.slice(1));
      const draftsRoot = path.resolve(root, "artifacts/ai/drafts");
      const targetPath = path.resolve(root, relativePath);

      if (!isWithin(draftsRoot, targetPath) || !fs.existsSync(targetPath)) {
        sendJson(res, 404, { error: "Draft artifact not found" });
        return;
      }

      const content = fs.readFileSync(targetPath, "utf-8");
      sendText(res, 200, content, "application/json; charset=utf-8");
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && req.url === "/api/ai/history") {
      const items = getRecentWrites(10);
      sendJson(res, 200, { items });
      return;
    }

    if (req.method === "GET" && req.url === "/api/ai/approval-policy") {
      const policy = loadApprovalPolicy();
      sendJson(res, 200, policy);
      return;
    }
    
    if (req.method === "POST" && req.url === "/api/ai/draft") {
      if (!process.env.OPENAI_API_KEY) {
        sendJson(res, 500, { error: "OPENAI_API_KEY is not set" });
        return;
      }

      const rawBody = await readRequestBody(req);
      let body;

      try {
        body = JSON.parse(rawBody || "{}");
      } catch (err) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }

      const userRequest = typeof body.request === "string" ? body.request.trim() : "";

      if (!userRequest) {
        sendJson(res, 400, { error: "Request text is required" });
        return;
      }

      const draft = await generateDraft(userRequest);
      sendJson(res, 200, draft);
      return;
    }

    if (req.method === "POST" && req.url === "/api/ai/preview") {
      const rawBody = await readRequestBody(req);
      let body;

      try {
        body = JSON.parse(rawBody || "{}");
      } catch (err) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }

      const draft = body && typeof body === "object" ? body.draft : null;

      if (!draft || typeof draft !== "object") {
        sendJson(res, 400, { error: "Draft payload is required" });
        return;
      }

      const normalizedFiles = normalizeDraftFiles(draft.files);

      const approvalPolicy = resolveRequiredRolesForFiles(normalizedFiles);

      const batchPolicy = assertDecisionBatchAllowed(normalizedFiles);
      const fileRoleRequirements = resolveFileRoleRequirements(normalizedFiles);

      const diffs = normalizedFiles.map(file => {
        let oldContent = "";

        if (fs.existsSync(file.absolutePath)) {
          try {
            oldContent = fs.readFileSync(file.absolutePath, "utf-8");
          } catch (err) {
            oldContent = "";
          }
        }

        return {
          path: file.path,
          diff: buildSimpleDiff(oldContent, file.content || "")
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
      return;
    }

    if (req.method === "POST" && (req.url === "/api/ai/write" || req.url === "/api/ai/decision")) {
      const rawBody = await readRequestBody(req);
      let body;

      try {
        body = JSON.parse(rawBody || "{}");
      } catch (err) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }

      const draft = body && typeof body === "object" ? body.draft : null;
      const userRequest = typeof body.request === "string" ? body.request.trim() : "";

      const approverRole = typeof body.approver_role === "string" ? body.approver_role.trim() : "";

      if (!draft || typeof draft !== "object") {
        sendJson(res, 400, { error: "Draft payload is required" });
        return;
      }

      const result = createDecisionPacket(draft, userRequest, approverRole);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Server error" });
  }
});

server.listen(3000, () => {
  console.log("Forge AI Workspace running at http://localhost:3000");
});