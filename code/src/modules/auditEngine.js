const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256File(absPath) {
  const h = crypto.createHash("sha256");
  const data = fs.readFileSync(absPath);
  h.update(data);
  return h.digest("hex");
}

function ensureDir(abs) {
  fs.mkdirSync(abs, { recursive: true });
}

function readJson(absPath) {
  const raw = fs.readFileSync(absPath, "utf-8");
  return JSON.parse(raw);
}

function writeJson(absPath, obj) {
  fs.writeFileSync(absPath, JSON.stringify(obj, null, 2), "utf-8");
}

function writeText(absPath, text) {
  fs.writeFileSync(absPath, text, "utf-8");
}

function isBlockedState(status) {
  const issues = Array.isArray(status.issues) ? status.issues : [];
  const bq = Array.isArray(status.blocking_questions) ? status.blocking_questions : [];
  const ns = String(status.next_step || "");
  if (bq.length > 0) return true;
  if (issues.some((x) => x && x.severity === "CRITICAL")) return true;
  if (/^\s*BLOCKED\b/i.test(ns)) return true;
  return false;
}

function normalizePath(p) {
  return String(p || "").replace(/\\/g, "/");
}

function inventoryIndex(inventory) {
  const idx = new Map();
  for (const e of inventory) {
    if (!e || typeof e.path !== "string") continue;
    idx.set(normalizePath(e.path), e);
  }
  return idx;
}

function fileExistsInInventory(idx, relPath) {
  return idx.has(normalizePath(relPath));
}

function nonEmptyFile(absPath) {
  try {
    const st = fs.statSync(absPath);
    return st.isFile() && st.size > 0;
  } catch (e) {
    return false;
  }
}

function rmDirIfExists(abs) {
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  if (!st.isDirectory()) return;
  fs.rmSync(abs, { recursive: true, force: true });
}

function addViolation(violations, category, severity, relPath, description) {
  violations.push({
    category: String(category || ""),
    severity: String(severity || ""),
    path: String(relPath || ""),
    description: String(description || "")
  });
}

function getRegistryTaskIds() {
  const taskRegistryModule = require("../execution/task_registry");

  if (
    !taskRegistryModule ||
    typeof taskRegistryModule !== "object" ||
    !taskRegistryModule.registry ||
    typeof taskRegistryModule.registry !== "object"
  ) {
    throw new Error("FORGE GOVERNANCE VIOLATION: invalid task registry module");
  }

  return Object.keys(taskRegistryModule.registry)
    .map((key) => {
      const match = String(key).match(/TASK-\d+/i);
      return match ? match[0].toUpperCase() : "";
    })
    .filter(Boolean);
}

function getExecutionClosureFiles(rootAbs) {
  const tasksDirAbs = path.join(rootAbs, "artifacts", "tasks");

  if (!fs.existsSync(tasksDirAbs) || !fs.statSync(tasksDirAbs).isDirectory()) {
    return [];
  }

  return fs.readdirSync(tasksDirAbs)
    .filter((file) => /\.execution\.closure\.md$/i.test(String(file)));
}

function renderAuditReport(findings) {
  const lines = [];
  lines.push("# Audit Report");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- blocked: ${findings.blocked}`);
  lines.push(`- total_checks: ${findings.total_checks}`);
  lines.push(`- passed_checks: ${findings.passed_checks}`);
  lines.push(`- failed_checks: ${findings.failed_checks}`);
  lines.push("");
  lines.push("## Violations");
  if (!findings.violations || findings.violations.length === 0) {
    lines.push("- None");
    lines.push("");
    return lines.join("\n");
  }
  for (const v of findings.violations) {
    lines.push(`- **${v.severity}** [${v.category}] ${v.path} — ${v.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

function loadReleaseHashes(rootAbs) {
  const v2 = path.join(rootAbs, "release_local_v2.hashes.json");
  const v1 = path.join(rootAbs, "release_local.hashes.json");
  const v3 = path.join(rootAbs, "release_local_v3.hashes.json");
  const v4 = path.join(rootAbs, "release_local_v4.hashes.json");
  const candidates = [v4, v3, v2, v1].filter((p) => fs.existsSync(p));
  if (candidates.length === 0) return null;
  const chosen = candidates[0];
  const obj = readJson(chosen);
  return { file: normalizePath(path.relative(rootAbs, chosen)), hashes: obj };
}

function runAudit(context) {
  if (!context || typeof context !== "object" || !context.status) {
    throw new Error("Audit requires execution context with status");
  }

  const status = context.status;

  const rootAbs = path.resolve(__dirname, "../../..");
  const intakeDirAbs = path.join(rootAbs, "artifacts", "intake");
  const auditDirAbs = path.join(rootAbs, "artifacts", "audit");

  ensureDir(auditDirAbs);

  const executionId = `AUDIT-${new Date().toISOString()}`;

  const violations = [];
  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;

  const mark = (ok) => {
    totalChecks += 1;
    if (ok) passedChecks += 1;
    else failedChecks += 1;
  };

  const intakeSnapshotAbs = path.join(intakeDirAbs, "intake_snapshot.json");
  const inventoryAbs = path.join(intakeDirAbs, "repository_inventory.json");
  const intakeContextAbs = path.join(intakeDirAbs, "intake_context.json");
  const intakeReportAbs = path.join(intakeDirAbs, "intake_report.md");

  const preBlocked = isBlockedState(status);
  mark(true);
  if (preBlocked) {
    addViolation(
      violations,
      "StatusReflection",
      "WARNING",
      "progress/status.json",
      "Reflection indicates BLOCKED state, but Audit activation authority is governed by runtime artifacts."
    );
  }

  const intakeSnapshotExists = fs.existsSync(intakeSnapshotAbs);
  mark(intakeSnapshotExists);
  if (!intakeSnapshotExists) {
    addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_snapshot.json", "Missing Intake snapshot.");
  }

  const inventoryExists = fs.existsSync(inventoryAbs);
  mark(inventoryExists);
  if (!inventoryExists) {
    addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/repository_inventory.json", "Missing Intake repository inventory.");
  }

  const intakeContextExists = fs.existsSync(intakeContextAbs);
  mark(intakeContextExists);
  if (!intakeContextExists) {
    addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_context.json", "Missing Intake context.");
  }

  const intakeReportExists = fs.existsSync(intakeReportAbs);
  mark(intakeReportExists);
  if (!intakeReportExists) {
    addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_report.md", "Missing Intake report.");
  }

  let intakeSnapshot = null;
  let intakeContext = null;
  let inventory = null;

  if (intakeSnapshotExists) {
    try {
      intakeSnapshot = readJson(intakeSnapshotAbs);
      mark(true);
    } catch (e) {
      mark(false);
      addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_snapshot.json", `Invalid JSON: ${e && e.message ? e.message : String(e)}`);
    }
  }

  if (intakeContextExists) {
    try {
      intakeContext = readJson(intakeContextAbs);
      const ok = intakeContext && typeof intakeContext === "object" && !Array.isArray(intakeContext);
      mark(ok);
      if (!ok) {
        addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_context.json", "Intake context must be JSON object.");
      }
    } catch (e) {
      mark(false);
      addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_context.json", `Invalid JSON: ${e && e.message ? e.message : String(e)}`);
    }
  }

  if (inventoryExists) {
    try {
      inventory = readJson(inventoryAbs);
      const ok = Array.isArray(inventory);
      mark(ok);
      if (!ok) {
        addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/repository_inventory.json", "Inventory must be JSON array.");
      }
    } catch (e) {
      mark(false);
      addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/repository_inventory.json", `Invalid JSON: ${e && e.message ? e.message : String(e)}`);
    }
  }

  if (intakeSnapshot && typeof intakeSnapshot === "object") {
    const locked = intakeSnapshot.locked_snapshot_flag === true;
    mark(locked);
    if (!locked) {
      addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_snapshot.json", "locked_snapshot_flag must be true.");
    }
  } else if (intakeSnapshotExists) {
    mark(false);
    addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_snapshot.json", "Intake snapshot missing required fields.");
  }

  if (intakeContext && typeof intakeContext === "object") {
    const operatingMode = typeof intakeContext.operating_mode === "string" ? intakeContext.operating_mode.trim() : "";
    const repositoryState = typeof intakeContext.repository_state === "string" ? intakeContext.repository_state.trim() : "";
    const blockedFlag = intakeContext.blocked === true || intakeContext.blocked === false;

    const validMode = operatingMode === "BUILD" || operatingMode === "IMPROVE";
    mark(validMode);
    if (!validMode) {
      addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_context.json", "operating_mode must be BUILD or IMPROVE.");
    }

    const validRepositoryState =
      repositoryState === "IDEA_ONLY" ||
      repositoryState === "DOCS_ONLY" ||
      repositoryState === "CODE_ONLY" ||
      repositoryState === "MIXED";
    mark(validRepositoryState);
    if (!validRepositoryState) {
      addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_context.json", "repository_state must be IDEA_ONLY, DOCS_ONLY, CODE_ONLY, or MIXED.");
    }

    mark(blockedFlag);
    if (!blockedFlag) {
      addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_context.json", "blocked must be boolean.");
    }

    if (intakeContext.blocked === true) {
      addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_context.json", "Intake context is BLOCKED — Audit cannot proceed.");
    }
  } else if (intakeContextExists) {
    mark(false);
    addViolation(violations, "Activation", "CRITICAL", "artifacts/intake/intake_context.json", "Intake context missing required fields.");
  }

  const idx = Array.isArray(inventory) ? inventoryIndex(inventory) : new Map();

    let registryTasks = [];
  let closureFiles = [];

  try {
    registryTasks = getRegistryTaskIds();
    mark(registryTasks.length > 0);

    if (registryTasks.length === 0) {
      addViolation(
        violations,
        "RegistryClosureConsistency",
        "CRITICAL",
        "code/src/execution/task_registry.js",
        "No registry tasks found."
      );
    }
  } catch (e) {
    mark(false);
    addViolation(
      violations,
      "RegistryClosureConsistency",
      "CRITICAL",
      "code/src/execution/task_registry.js",
      e && e.message ? e.message : String(e)
    );
  }

  try {
    closureFiles = getExecutionClosureFiles(rootAbs);

    const orphanClosures = [];

    for (const file of closureFiles) {
      const match = String(file).match(/TASK-(\d+)\.execution\.closure\.md/i);
      if (!match) continue;

      const taskId = `TASK-${match[1]}`;

      if (!registryTasks.includes(taskId)) {
        orphanClosures.push(taskId);
      }
    }

    const ok = orphanClosures.length === 0;
    mark(ok);

    mark(true);

    if (orphanClosures.length > 0) {
      addViolation(
        violations,
        "RegistryClosureConsistency",
        "WARNING",
        "artifacts/tasks/",
        `NON-AUTHORITATIVE orphan execution closures detected -> ${orphanClosures.join(", ")}`
      );
    }
  } catch (e) {
    mark(false);
    addViolation(
      violations,
      "RegistryClosureConsistency",
      "CRITICAL",
      "artifacts/tasks/",
      e && e.message ? e.message : String(e)
    );
  }

  const operatingMode =
    intakeContext && typeof intakeContext.operating_mode === "string"
      ? String(intakeContext.operating_mode).trim()
      : "";

  const repositoryState =
    intakeContext && typeof intakeContext.repository_state === "string"
      ? String(intakeContext.repository_state).trim()
      : "";

  let requiredDirs = ["artifacts", "progress"];

  if (operatingMode === "IMPROVE") {
    requiredDirs = ["docs", "artifacts", "code", "progress"];
  } else if (operatingMode === "BUILD") {
    if (repositoryState === "DOCS_ONLY") {
      requiredDirs = ["docs", "artifacts", "progress"];
    } else if (repositoryState === "CODE_ONLY") {
      requiredDirs = ["code", "artifacts", "progress"];
    } else if (repositoryState === "MIXED") {
      requiredDirs = ["docs", "artifacts", "code", "progress"];
    }
  }

  for (const d of requiredDirs) {
    const abs = path.join(rootAbs, d);
    const exists = fs.existsSync(abs) && fs.statSync(abs).isDirectory();
    mark(exists);
    if (!exists) {
      addViolation(violations, "RepositoryStructure", "CRITICAL", `${d}/`, "Missing required directory for this classification tier.");
    }
  }

  const mandatoryGovernance = [
    "docs/03_pipeline/SELF_BUILDING_SYSTEM_BLUEPRINT_v1.md",
    "docs/03_pipeline/MODULE_ORCHESTRATION_GOVERNANCE_v1.md",
    "docs/03_pipeline/INTAKE_MODULE_CONTRACT_v1.md",
    "docs/03_pipeline/AUDIT_ENGINE_CONTRACT_v1.md"
  ];

  for (const rel of mandatoryGovernance) {
    const abs = path.join(rootAbs, rel);
    const exists = fs.existsSync(abs);
    mark(exists);
    if (!exists) {
      addViolation(violations, "GovernanceDocuments", "CRITICAL", rel, "Missing mandatory governance document.");
      continue;
    }

    const nonEmpty = nonEmptyFile(abs);
    mark(nonEmpty);
    if (!nonEmpty) {
      addViolation(violations, "GovernanceDocuments", "CRITICAL", rel, "Governance document is empty.");
    }

    if (Array.isArray(inventory)) {
      const presentWithExact = fileExistsInInventory(idx, rel);
      mark(presentWithExact);
      if (!presentWithExact) {
        addViolation(violations, "GovernanceDocuments", "CRITICAL", rel, "Governance document path casing mismatch or not present in inventory.");
      }
    }
  }

  const statusAbs = path.join(rootAbs, "progress", "status.json");
  const statusExists = fs.existsSync(statusAbs);
  mark(true);

  if (statusExists) {
    try {
      const s = readJson(statusAbs);

      const hasType = typeof s.status_type === "string" && s.status_type.trim() !== "";
      const hasStage = typeof s.current_stage === "string" && /^[A-D]$/i.test(s.current_stage);
      const hasPct = typeof s.stage_progress_percent === "number";
      const hasNext = typeof s.next_step === "string";

      mark(hasType);
      if (!hasType) {
        addViolation(violations, "StatusReflection", "WARNING", "progress/status.json", "status_type missing/invalid.");
      }

      mark(hasStage);
      if (!hasStage) {
        addViolation(violations, "StatusReflection", "WARNING", "progress/status.json", "current_stage missing/invalid.");
      }

      mark(hasPct);
      if (!hasPct) {
        addViolation(violations, "StatusReflection", "WARNING", "progress/status.json", "stage_progress_percent missing/invalid.");
      }

      if (hasPct) {
        const pctInRange = s.stage_progress_percent >= 0 && s.stage_progress_percent <= 100;
        mark(pctInRange);
        if (!pctInRange) {
          addViolation(violations, "StatusReflection", "WARNING", "progress/status.json", "stage_progress_percent must be between 0 and 100.");
        }
      }

      mark(hasNext);
      if (!hasNext) {
        addViolation(violations, "StatusReflection", "WARNING", "progress/status.json", "next_step missing/invalid.");
      }
    } catch (e) {
      mark(false);
      addViolation(
        violations,
        "StatusReflection",
        "WARNING",
        "progress/status.json",
        `Invalid JSON: ${e && e.message ? e.message : String(e)}`
      );
    }
  }

  const allowedModules = new Set(["intake", "audit", "trace", "gap", "decisions", "backfill", "execute", "closure", "release", "orchestration", "verify", "forge", "exploration", "cognitive", "coverage"]);
  const immutableLegacy = new Set(["tasks", "stage_A", "stage_B", "stage_C", "stage_D", "reports", "release", "archive"]);

  if (Array.isArray(inventory)) {
    const artifactPaths = inventory
      .filter((e) => e && typeof e.path === "string" && normalizePath(e.path).startsWith("artifacts/") && !normalizePath(e.path).endsWith("/"))
      .map((e) => normalizePath(e.path));

    for (const p of artifactPaths) {
      const parts = p.split("/");
      const ns = parts.length >= 2 ? parts[1] : "";
      const isAllowed = allowedModules.has(ns);
      const isImmutableLegacy = immutableLegacy.has(ns);

      if (isAllowed) {
        mark(true);
        continue;
      }

      if (isImmutableLegacy) {
        mark(true);
        continue;
      }

      mark(false);
      addViolation(violations, "ArtifactNamespaceIntegrity", "CRITICAL", p, `Artifact outside allowed namespaces: ${ns || "(missing)"}`);
    }

    const byBase = new Map();
    for (const p of artifactPaths) {
      const base = p.split("/").slice(-1)[0];
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(p);
    }
    const dupBases = Array.from(byBase.entries()).filter(([, arr]) => arr.length > 1);
    mark(dupBases.length === 0);
    if (dupBases.length > 0) {
      const ex = dupBases[0];
      addViolation(violations, "ArtifactNamespaceIntegrity", "WARNING", ex[1][0], `Duplicate artifact filename across namespaces: ${ex[0]}`);
    }
  }

  const deprecatedPatterns = [
    { id: "DEPRECATED_NAME_001", re: /Personal\s+Autonomous\s+Pipeline/i, label: "Deprecated system name pattern (001)" },
    { id: "DEPRECATED_NAME_002", re: /HALO\s+Personal\s+Autonomous\s+Pipeline/i, label: "Deprecated system name pattern (002)" },
    { id: "DEPRECATED_NAME_003", re: /\bPAPH\b/i, label: "Deprecated system name token (003)" }
  ];

  const scanTargets = [];
  if (Array.isArray(inventory)) {
    for (const e of inventory) {
      const p = normalizePath(e.path);
      if (!p || p.endsWith("/")) continue;
      if (p.startsWith("docs/") && p.toLowerCase().endsWith(".md")) scanTargets.push(p);
      if (p.startsWith("code/") && (p.toLowerCase().endsWith(".js") || p.toLowerCase().endsWith(".json"))) scanTargets.push(p);
    }
  }

  let foundDeprecated = null;
  for (const rel of scanTargets) {
    if (foundDeprecated) break;
    const abs = path.join(rootAbs, rel);
    if (!fs.existsSync(abs)) continue;
    let txt = "";
    try {
      txt = fs.readFileSync(abs, "utf-8");
    } catch (e) {
      continue;
    }
    for (const p of deprecatedPatterns) {
      if (p.re.test(txt)) {
        foundDeprecated = { rel, name: p.label };
        break;
      }
    }
  }

  mark(!foundDeprecated);
  if (foundDeprecated) {
    addViolation(violations, "NamingAuthority", "CRITICAL", foundDeprecated.rel, `Deprecated system name detected: ${foundDeprecated.name}`);
  }

  const releaseInfo = loadReleaseHashes(rootAbs);
  if (releaseInfo && releaseInfo.hashes && typeof releaseInfo.hashes === "object") {
    const entries = Object.entries(releaseInfo.hashes);
    let mismatch = null;

    for (const [rel, expected] of entries) {
      const relNorm = normalizePath(rel);
      const abs = path.join(rootAbs, relNorm);
      if (!fs.existsSync(abs)) {
        mismatch = { rel: relNorm, reason: "missing" };
        break;
      }
      const actual = sha256File(abs);
      if (String(actual) !== String(expected)) {
        mismatch = { rel: relNorm, reason: "hash_mismatch" };
        break;
      }
    }

    mark(!mismatch);
    if (mismatch) {
      addViolation(violations, "DriftDetection", "CRITICAL", mismatch.rel, `Hash snapshot mismatch detected (${mismatch.reason}) vs ${releaseInfo.file}`);
    }
  } else {
    mark(true);
  }

  const effectiveCriticalViolations = violations.filter((v) => {
    if (!v || v.severity !== "CRITICAL") return false;
    if (v.category !== "ArtifactNamespaceIntegrity") return true;

    const violationPath = normalizePath(v.path);
    if (violationPath.startsWith("artifacts/archive/")) return false;
    if (violationPath.startsWith("artifacts/exploration/")) return false;

    return true;
  });

  const blocked = effectiveCriticalViolations.length > 0;

  const findingsPayload = {
    execution_id: executionId,
    total_checks: totalChecks,
    passed_checks: passedChecks,
    failed_checks: effectiveCriticalViolations.length,
    blocked: effectiveCriticalViolations.length > 0,
    violations
  };

  writeJson(path.join(auditDirAbs, "audit_findings.json"), findingsPayload);
  writeText(path.join(auditDirAbs, "audit_report.md"), renderAuditReport(findingsPayload));

  if (blocked) {
    const question = "Which CRITICAL violation should we address first (choose one category to proceed)?";
    writeText(
      path.join(auditDirAbs, "audit_error.md"),
      `# Audit Halted\n\nblocked: true\n\n## Blocking Question\n- ${question}\n`
    );
  }

  if (!blocked) {
    rmDirIfExists(path.join(rootAbs, "artifacts", "trace"));
    rmDirIfExists(path.join(rootAbs, "artifacts", "gap"));
    rmDirIfExists(path.join(rootAbs, "artifacts", "decisions"));
    rmDirIfExists(path.join(rootAbs, "artifacts", "backfill"));
    rmDirIfExists(path.join(rootAbs, "artifacts", "execute"));
    rmDirIfExists(path.join(rootAbs, "artifacts", "closure"));
  }

  return {
    stage_progress_percent: 100,
    artifact: "artifacts/audit/audit_report.md",
    status_patch: blocked
     ? {
        issues: effectiveCriticalViolations,
        blocking_questions: ["Audit is BLOCKED — see artifacts/audit/audit_error.md"],
        current_task: "",
        next_step: ""
       }
     : {
        issues: [],
        blocking_questions: [],
        current_task: "",
        next_step: "MODULE_FLOW — Audit PASS. Next=Trace (mode-aware downstream alignment pending)."
       }
  };
}

module.exports = {
  runAudit
};