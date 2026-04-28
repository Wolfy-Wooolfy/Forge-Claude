const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256File(absPath) {
  const data = fs.readFileSync(absPath);
  return sha256Buffer(data);
}

function isExcluded(relPath) {
  const p = relPath.replace(/\\/g, "/");

  if (p === ".git" || p.startsWith(".git/")) return true;
  if (p === "node_modules" || p.startsWith("node_modules/")) return true;

  if (p === "artifacts/intake" || p.startsWith("artifacts/intake/")) return true;

  return false;
}

function walk(rootAbs, relBase) {
  const abs = path.join(rootAbs, relBase);
  const st = fs.statSync(abs);

  const items = [];

  if (st.isDirectory()) {
    const children = fs.readdirSync(abs).sort((a, b) => a.localeCompare(b));
    for (const name of children) {
      const childRel = relBase ? path.join(relBase, name) : name;
      const normalized = childRel.replace(/\\/g, "/");
      if (isExcluded(normalized)) {
        continue;
      }
      items.push(...walk(rootAbs, childRel));
    }

    if (relBase) {
      const normalizedDir = relBase.replace(/\\/g, "/");
      if (!isExcluded(normalizedDir)) {
        items.push({
          path: normalizedDir.endsWith("/") ? normalizedDir : `${normalizedDir}/`,
          type: "dir",
          size_bytes: 0,
          hash: sha256Buffer(Buffer.from("")),
          captured_at: "SNAPSHOT_LOCKED"
        });
      }
    }

    return items;
  }

  const normalizedFile = relBase.replace(/\\/g, "/");
  if (isExcluded(normalizedFile)) {
    return [];
  }

  items.push({
    path: normalizedFile,
    type: "file",
    size_bytes: st.size,
    hash: sha256File(abs),
    captured_at: "SNAPSHOT_LOCKED"
  });

  return items;
}

function readJsonIfExists(absPath) {
  if (!fs.existsSync(absPath)) {
    return null;
  }

  const raw = fs.readFileSync(absPath, "utf-8");
  return JSON.parse(raw);
}

function detectRepositoryState(rootAbs) {
  const hasDocs = fs.existsSync(path.join(rootAbs, "docs")) && fs.statSync(path.join(rootAbs, "docs")).isDirectory();
  const hasCode = fs.existsSync(path.join(rootAbs, "code")) && fs.statSync(path.join(rootAbs, "code")).isDirectory();
  const hasArtifacts = fs.existsSync(path.join(rootAbs, "artifacts")) && fs.statSync(path.join(rootAbs, "artifacts")).isDirectory();
  const hasStatus = fs.existsSync(path.join(rootAbs, "progress", "status.json"));

  if (!hasDocs && !hasCode && !hasArtifacts) {
    return {
      repository_state: "IDEA_ONLY",
      docs_present: false,
      code_present: false,
      artifacts_present: false,
      status_present: hasStatus,
      rules: ["no docs/", "no code/", "no artifacts/"]
    };
  }

  if (hasDocs && !hasCode) {
    return {
      repository_state: "DOCS_ONLY",
      docs_present: true,
      code_present: false,
      artifacts_present: hasArtifacts,
      status_present: hasStatus,
      rules: ["docs/ present", "code/ missing"]
    };
  }

  if (hasCode && !hasDocs) {
    return {
      repository_state: "CODE_ONLY",
      docs_present: false,
      code_present: true,
      artifacts_present: hasArtifacts,
      status_present: hasStatus,
      rules: ["code/ present", "docs/ missing"]
    };
  }

  return {
    repository_state: "MIXED",
    docs_present: hasDocs,
    code_present: hasCode,
    artifacts_present: hasArtifacts,
    status_present: hasStatus,
    rules: ["docs/code mixed repository state detected"]
  };
}

function classifyOperatingMode(rootAbs, projectRequest, repositoryStateInfo) {
  const reasoning = [];
  const requestModeRaw =
    projectRequest &&
    typeof projectRequest === "object" &&
    typeof projectRequest.operating_mode === "string"
      ? projectRequest.operating_mode.trim().toUpperCase()
      : "";

  const requestPresent = !!projectRequest;
  const docsPresent = !!repositoryStateInfo.docs_present;
  const codePresent = !!repositoryStateInfo.code_present;

  let buildPossible = false;
  let improvePossible = false;

  if (requestModeRaw === "BUILD") {
    buildPossible = true;
    reasoning.push("project_request.operating_mode explicitly requests BUILD");
  }

  if (requestModeRaw === "IMPROVE") {
    improvePossible = true;
    reasoning.push("project_request.operating_mode explicitly requests IMPROVE");
  }

  if (!codePresent) {
    buildPossible = true;
    reasoning.push("no working code detected");
  }

  if (codePresent || docsPresent) {
    improvePossible = true;
    reasoning.push("existing code or docs detected");
  }

  if (buildPossible && !improvePossible) {
    return {
      operating_mode: "BUILD",
      blocked: false,
      reasoning,
      request_present: requestPresent
    };
  }

  if (improvePossible && !buildPossible) {
    return {
      operating_mode: "IMPROVE",
      blocked: false,
      reasoning,
      request_present: requestPresent
    };
  }

  if (buildPossible && improvePossible) {
    return {
      operating_mode: "BLOCKED",
      blocked: true,
      reasoning: reasoning.concat(["BUILD and IMPROVE are both possible"]),
      request_present: requestPresent
    };
  }

  return {
    operating_mode: "BLOCKED",
    blocked: true,
    reasoning: reasoning.concat(["neither BUILD nor IMPROVE conditions were satisfied"]),
    request_present: requestPresent
  };
}

function renderIntakeReportMd(payload) {
  const rules = payload.rules_triggered.map((r) => `- ${r}`).join("\n");
  const comps = payload.observed_components.map((c) => `- ${c}`).join("\n");
  const validations = payload.validation_summary.map((v) => `- ${v}`).join("\n");
  const reasoning = payload.classification_reasoning.map((r) => `- ${r}`).join("\n");

  return `# intake_report

## Operating Mode
- result: ${payload.operating_mode}

## Repository State
- result: ${payload.repository_state}

## Request Presence
- project_request.json: ${payload.request_present ? "present" : "missing"}

## Classification Reasoning
${reasoning}

## Rules Triggered
${rules}

## Observed Components
${comps}

## Intake Validation Summary
${validations}

## Deterministic Confirmation
- SNAPSHOT_LOCKED: true
- inventory_sorted: true
- hash_algorithm: sha256
- fail_closed: ${payload.blocked ? "true" : "false"}
`;
}

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function writeJson(absPath, obj) {
  fs.writeFileSync(absPath, JSON.stringify(obj, null, 2), "utf-8");
}

function runIntake(context) {
  if (!context || typeof context !== "object") {
    throw new Error("Intake requires context object");
  }

  const rootAbs = path.resolve(__dirname, "../../..");
  const artifactsAbs = path.join(rootAbs, "artifacts", "intake");
  ensureDir(artifactsAbs);

  const projectRequestAbs = path.join(rootAbs, "artifacts", "intake", "project_request.json");
  const projectRequest = readJsonIfExists(projectRequestAbs);
  const repositoryStateInfo = detectRepositoryState(rootAbs);
  const operatingModeInfo = classifyOperatingMode(rootAbs, projectRequest, repositoryStateInfo);
  const entries = walk(rootAbs, "");
  const normalized = entries
    .map((e) => Object.assign({}, e, { path: String(e.path || "").replace(/\\/g, "/") }))
    .sort((a, b) => a.path.localeCompare(b.path));

  let totalFiles = 0;
  let totalDirs = 0;
  for (const e of normalized) {
    if (e.type === "file") totalFiles += 1;
    if (e.type === "dir") totalDirs += 1;
  }

  const repoInventoryRel = "artifacts/intake/repository_inventory.json";
  const intakeSnapshotRel = "artifacts/intake/intake_snapshot.json";
  const intakeContextRel = "artifacts/intake/intake_context.json";
  const intakeReportRel = "artifacts/intake/intake_report.md";

  const inventoryPayload = normalized.map((e) => ({
    path: e.path,
    size_bytes: e.size_bytes,
    hash: e.hash,
    captured_at: e.captured_at
  }));

  const repositoryRootHash = sha256Buffer(Buffer.from(JSON.stringify(inventoryPayload)));

  writeJson(path.join(rootAbs, repoInventoryRel), inventoryPayload);

  const snapshotPayload = {
    module: "INTAKE",
    generated_at: new Date().toISOString(),
    total_files: totalFiles,
    total_directories: totalDirs,
    classification: operatingModeInfo.operating_mode,
    repository_state: repositoryStateInfo.repository_state,
    repository_root_hash: repositoryRootHash,
    locked_snapshot_flag: true
  };

  writeJson(path.join(rootAbs, intakeSnapshotRel), snapshotPayload);

  const intakeContextPayload = {
    operating_mode: operatingModeInfo.operating_mode,
    repository_state: repositoryStateInfo.repository_state,
    docs_present: repositoryStateInfo.docs_present,
    code_present: repositoryStateInfo.code_present,
    artifacts_present: repositoryStateInfo.artifacts_present,
    request_present: operatingModeInfo.request_present,
    blocked: operatingModeInfo.blocked,
    classification_reasoning: operatingModeInfo.reasoning
  };

  writeJson(path.join(rootAbs, intakeContextRel), intakeContextPayload);

  const intakeReportMd = renderIntakeReportMd({
    operating_mode: operatingModeInfo.operating_mode,
    repository_state: repositoryStateInfo.repository_state,
    request_present: operatingModeInfo.request_present,
    blocked: operatingModeInfo.blocked,
    classification_reasoning: operatingModeInfo.reasoning,
    rules_triggered: repositoryStateInfo.rules,
    observed_components: [
      fs.existsSync(path.join(rootAbs, "docs")) ? "docs/" : "docs/ (missing)",
      fs.existsSync(path.join(rootAbs, "code")) ? "code/" : "code/ (missing)",
      fs.existsSync(path.join(rootAbs, "artifacts")) ? "artifacts/" : "artifacts/ (missing)",
      fs.existsSync(path.join(rootAbs, "progress", "status.json")) ? "progress/status.json" : "progress/status.json (missing)",
      fs.existsSync(projectRequestAbs) ? "artifacts/intake/project_request.json" : "artifacts/intake/project_request.json (missing)"
    ],
    validation_summary: [
      "repository readable",
      "inventory generated",
      "inventory sorted lexicographically by path",
      "artifacts written under artifacts/intake/",
      "locked_snapshot_flag true",
      operatingModeInfo.blocked ? "execution blocked by fail-closed intake classification" : "operating mode classification resolved"
    ]
  });

  fs.writeFileSync(path.join(rootAbs, intakeReportRel), intakeReportMd, "utf-8");

  if (operatingModeInfo.blocked) {
    throw new Error(`INTAKE BLOCKED: unable to resolve operating mode deterministically (${operatingModeInfo.reasoning.join("; ")})`);
  };

  return {
    stage_progress_percent: context.status && typeof context.status.stage_progress_percent === "number"
      ? context.status.stage_progress_percent
      : 0,
    artifact: intakeContextRel,
    status_patch: {
      current_task: "MODULE: Audit",
      next_step: "MODULE_FLOW — next=Audit (set current_task to MODULE: Audit to continue)"
    },
    clear_current_task: false
  };
}

module.exports = {
  runIntake
};