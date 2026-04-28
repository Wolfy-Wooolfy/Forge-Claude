const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../../..");

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function readJson(absPath) {
  const raw = fs.readFileSync(absPath, "utf8");
  return JSON.parse(raw);
}

function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true });
}

function fileExists(absPath) {
  return fs.existsSync(absPath) && fs.statSync(absPath).isFile();
}

function deriveDeterministicTimestamp(intakeSnapshot, executePlan, decisionJson) {
  const candidates = [
    executePlan && executePlan.generated_at ? executePlan.generated_at : "",
    executePlan && executePlan.release_timestamp ? executePlan.release_timestamp : "",
    decisionJson && decisionJson.timestamp ? decisionJson.timestamp : "",
    intakeSnapshot && intakeSnapshot.generated_at ? intakeSnapshot.generated_at : "",
    "1970-01-01T00:00:00.000Z"
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return "1970-01-01T00:00:00.000Z";
}

function listRepositoryFiles(absDir, baseDir, acc, excludedRelPaths) {
  const entries = fs.readdirSync(absDir, { withFileTypes: true });

  for (const entry of entries) {
    const abs = path.join(absDir, entry.name);
    const rel = path.relative(baseDir, abs).split(path.sep).join("/");

    if (entry.isDirectory()) {
      if (rel === ".git" || rel === "node_modules") {
        continue;
      }
      listRepositoryFiles(abs, baseDir, acc, excludedRelPaths);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (excludedRelPaths.has(rel)) {
      continue;
    }

    acc.push(rel);
  }
}

function computeRepositorySnapshot() {
  const excludedRelPaths = new Set([
    "artifacts/closure/closure_report.md",
    "artifacts/closure/closure_error.md",
    "artifacts/release/RELEASE_MANIFEST_v1.json",
    "artifacts/release/repository_hash_snapshot.json",
    "artifacts/tasks/TASK-055.execution.closure.md"
  ]);

  const relFiles = [];
  listRepositoryFiles(ROOT, ROOT, relFiles, excludedRelPaths);
  relFiles.sort((a, b) => a.localeCompare(b));

  const fileHashes = [];
  for (const rel of relFiles) {
    const abs = path.resolve(ROOT, rel);
    const content = fs.readFileSync(abs);
    const fileHash = crypto.createHash("sha256").update(content).digest("hex");
    fileHashes.push({
      path: rel,
      sha256: fileHash
    });
  }

  const combined = fileHashes.map((item) => `${item.path}:${item.sha256}`).join("\n");
  const repositoryHash = sha256Text(combined);

  return {
    total_files: fileHashes.length,
    repository_hash: repositoryHash,
    hash_algorithm: "sha256",
    files: fileHashes
  };
}

function countOrphanEntities(gapJson) {
  const gaps = Array.isArray(gapJson && gapJson.gaps) ? gapJson.gaps : [];
  let orphanCodeUnits = 0;
  let orphanRequirements = 0;
  let orphanArtifacts = 0;

  for (const gap of gaps) {
    const category = String(gap && gap.category ? gap.category : "").toUpperCase();

    if (category === "ORPHAN_CODE" || category === "ORPHAN_CODE_UNITS") {
      orphanCodeUnits += 1;
    } else if (category === "ORPHAN_REQUIREMENT" || category === "ORPHAN_REQUIREMENTS") {
      orphanRequirements += 1;
    } else if (category === "ORPHAN_ARTIFACT" || category === "ORPHAN_ARTIFACTS") {
      orphanArtifacts += 1;
    }
  }

  return {
    orphan_code_units: orphanCodeUnits,
    orphan_requirements: orphanRequirements,
    orphan_artifacts: orphanArtifacts
  };
}

function computeGapMetrics(gapJson) {
  const totalGaps =
    typeof (gapJson && gapJson.total_gaps) === "number"
      ? gapJson.total_gaps
      : Array.isArray(gapJson && gapJson.gaps)
        ? gapJson.gaps.length
        : 0;

  const criticalCount =
    typeof (gapJson && gapJson.critical_count) === "number"
      ? gapJson.critical_count
      : Array.isArray(gapJson && gapJson.gaps)
        ? gapJson.gaps.filter((gap) => String(gap && gap.severity ? gap.severity : "").toUpperCase() === "CRITICAL").length
        : 0;

  const orphanCounts = countOrphanEntities(gapJson);

  return {
    total_gaps: totalGaps,
    critical_violations: criticalCount,
    orphan_code_units: orphanCounts.orphan_code_units,
    orphan_requirements: orphanCounts.orphan_requirements,
    orphan_artifacts: orphanCounts.orphan_artifacts
  };
}

function artifactNamespaceValid(relPath) {
  return typeof relPath === "string" && relPath.startsWith("artifacts/");
}

function buildBlockingResult(message, details, errorArtifactRel) {
  const closureDir = path.resolve(ROOT, "artifacts", "closure");
  ensureDir(closureDir);

  const lines = [];
  lines.push("# MODULE FLOW — Closure Error");
  lines.push("");
  lines.push(`- outcome: BLOCKED`);
  lines.push(`- message: ${message}`);
  lines.push("");
  lines.push("## Details");
  for (const detail of details) {
    lines.push(`- ${detail}`);
  }
  lines.push("");

  fs.writeFileSync(path.resolve(ROOT, errorArtifactRel), lines.join("\n"), { encoding: "utf8" });

  return {
    stage_progress_percent: 100,
    blocked: true,
    artifact: errorArtifactRel,
    outputs: {
      md: errorArtifactRel
    },
    status_patch: {
      next_step: "",
      blocking_questions: [message]
    }
  };
}

function renderClosureReport(payload) {
  const lines = [];

  lines.push("# MODULE FLOW — Closure Report");
  lines.push("");
  lines.push(`- release_timestamp: ${payload.release_timestamp}`);
  lines.push(`- execution_id: ${payload.execution_id}`);
  lines.push(`- operating_mode: ${payload.operating_mode}`);
  lines.push(`- repository_state: ${payload.repository_state}`);
  lines.push(`- final_outcome: ${payload.final_outcome}`);
  lines.push("");
  lines.push("## Verified Modules");
  for (const item of payload.verified_modules) {
    lines.push(`- ${item.name}: ${item.status}`);
  }
  lines.push("");
  lines.push("## Gap Status");
  lines.push(`- gap_count: ${payload.gap_status.gap_count}`);
  lines.push(`- critical_violations: ${payload.gap_status.critical_violations}`);
  lines.push(`- orphan_code_units: ${payload.gap_status.orphan_code_units}`);
  lines.push(`- orphan_requirements: ${payload.gap_status.orphan_requirements}`);
  lines.push(`- orphan_artifacts: ${payload.gap_status.orphan_artifacts}`);
  lines.push(`- acceptable_for_final_closure: ${payload.gap_status.acceptable_for_final_closure ? "true" : "false"}`);
  lines.push("");
  lines.push("## Deterministic Validation");
  lines.push(`- intake_snapshot_locked: ${payload.deterministic_validation.intake_snapshot_locked ? "true" : "false"}`);
  lines.push(`- artifact_namespaces_valid: ${payload.deterministic_validation.artifact_namespaces_valid ? "true" : "false"}`);
  lines.push(`- decision_artifact_valid: ${payload.deterministic_validation.decision_artifact_valid ? "true" : "false"}`);
  lines.push(`- verify_contract_ready: ${payload.deterministic_validation.verify_contract_ready ? "true" : "false"}`);
  lines.push(`- deterministic_confirmation: ${payload.deterministic_validation.deterministic_confirmation ? "true" : "false"}`);
  lines.push(`- snapshot_hash: ${payload.deterministic_validation.snapshot_hash}`);
  lines.push("");
  lines.push("## Release Artifacts");
  lines.push(`- ${payload.release_artifacts.closure_report}`);
  lines.push(`- ${payload.release_artifacts.release_manifest}`);
  lines.push(`- ${payload.release_artifacts.repository_hash_snapshot}`);
  lines.push("");

  return lines.join("\n");
}

function runClosure(context) {
  const intakeContextRel = "artifacts/intake/intake_context.json";
  const intakeSnapshotRel = "artifacts/intake/intake_snapshot.json";
  const auditRel = "artifacts/audit/audit_findings.json";
  const traceRel = "artifacts/trace/trace_matrix.json";
  const gapRel = "artifacts/gap/gap_actions.json";
  const decisionRel = "artifacts/decisions/module_flow_decision_gate.json";
  const backfillRel = "artifacts/backfill/backfill_plan.json";
  const executeRel = "artifacts/execute/execute_plan.json";
  const executeDiffRel = "artifacts/execute/execute_diff.md";
  const executeLogRel = "artifacts/execute/execute_log.md";
  const verifyResultsRel = "artifacts/verify/verification_results.json";
  const verifyReportRel = "artifacts/verify/verification_report.md";
  const closureReportRel = "artifacts/closure/closure_report.md";
  const closureErrorRel = "artifacts/closure/closure_error.md";
  const releaseManifestRel = "artifacts/release/RELEASE_MANIFEST_v1.json";
  const repoSnapshotRel = "artifacts/release/repository_hash_snapshot.json";

  const intakeContextAbs = path.resolve(ROOT, intakeContextRel);
  const intakeSnapshotAbs = path.resolve(ROOT, intakeSnapshotRel);
  const auditAbs = path.resolve(ROOT, auditRel);
  const traceAbs = path.resolve(ROOT, traceRel);
  const gapAbs = path.resolve(ROOT, gapRel);
  const decisionAbs = path.resolve(ROOT, decisionRel);
  const backfillAbs = path.resolve(ROOT, backfillRel);
  const executeAbs = path.resolve(ROOT, executeRel);
  const executeDiffAbs = path.resolve(ROOT, executeDiffRel);
  const executeLogAbs = path.resolve(ROOT, executeLogRel);
  const verifyResultsAbs = path.resolve(ROOT, verifyResultsRel);
  const verifyReportAbs = path.resolve(ROOT, verifyReportRel);

  if (!fileExists(intakeContextAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/intake/intake_context.json).",
      ["Missing intake context artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(intakeSnapshotAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/intake/intake_snapshot.json).",
      ["Missing intake snapshot artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(auditAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/audit/audit_findings.json).",
      ["Missing audit artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(traceAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/trace/trace_matrix.json).",
      ["Missing trace artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(gapAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/gap/gap_actions.json).",
      ["Missing gap artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(decisionAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/decisions/module_flow_decision_gate.json).",
      ["Missing decision artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(backfillAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/backfill/backfill_plan.json).",
      ["Missing backfill plan artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(executeAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/execute/execute_plan.json).",
      ["Missing execute plan artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(executeDiffAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/execute/execute_diff.md).",
      ["Missing execute diff artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(executeLogAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/execute/execute_log.md).",
      ["Missing execute log artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(verifyResultsAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/verify/verification_results.json).",
      ["Missing verification results artifact."],
      closureErrorRel
    );
  }

  if (!fileExists(verifyReportAbs)) {
    return buildBlockingResult(
      "Closure BLOCKED: required artifact missing (artifacts/verify/verification_report.md).",
      ["Missing verification report artifact."],
      closureErrorRel
    );
  }

  const intakeContext = readJson(intakeContextAbs);
  const intakeSnapshot = readJson(intakeSnapshotAbs);
  const auditJson = readJson(auditAbs);
  const traceJson = readJson(traceAbs);
  const gapJson = readJson(gapAbs);
  const decisionJson = readJson(decisionAbs);
  const backfillJson = readJson(backfillAbs);
  const executeJson = readJson(executeAbs);
  const verifyResultsJson = readJson(verifyResultsAbs);

  const operatingMode = String(intakeContext && intakeContext.operating_mode ? intakeContext.operating_mode : "").toUpperCase();
  const repositoryState = String(intakeContext && intakeContext.repository_state ? intakeContext.repository_state : "").toUpperCase();

  if (intakeContext.blocked === true) {
    return buildBlockingResult(
      "Closure BLOCKED: intake_context is still blocked.",
      ["intake_context.blocked must be false before closure."],
      closureErrorRel
    );
  }

  if (operatingMode !== "BUILD" && operatingMode !== "IMPROVE") {
    return buildBlockingResult(
      "Closure BLOCKED: invalid operating mode.",
      [`Received operating_mode=${operatingMode || "(empty)"}.`],
      closureErrorRel
    );
  }

  if (intakeSnapshot.locked_snapshot_flag !== true) {
    return buildBlockingResult(
      "Closure BLOCKED: intake snapshot is not locked.",
      ["intake_snapshot.locked_snapshot_flag must equal true."],
      closureErrorRel
    );
  }

  if (auditJson.blocked === true) {
    return buildBlockingResult(
      "Closure BLOCKED: audit verification failed.",
      [
        `audit.blocked=${auditJson.blocked === true ? "true" : "false"}`,
        `audit.failed_checks=${Number(auditJson.failed_checks || 0)}`
      ],
      closureErrorRel
    );
  }

  if (!Array.isArray(traceJson.mappings) || String(traceJson.operating_mode || "").toUpperCase() !== operatingMode) {
    return buildBlockingResult(
      "Closure BLOCKED: trace verification failed.",
      [
        "trace_matrix must contain mappings array.",
        `trace.operating_mode=${String(traceJson.operating_mode || "")}`
      ],
      closureErrorRel
    );
  }

  const gapMetrics = computeGapMetrics(gapJson);

  if (gapMetrics.total_gaps !== 0) {
    return buildBlockingResult(
      "Closure BLOCKED: unresolved gaps remain.",
      [`gap_count=${gapMetrics.total_gaps}`],
      closureErrorRel
    );
  }

  if (gapMetrics.critical_violations > 0) {
    return buildBlockingResult(
      "Closure BLOCKED: unresolved critical violations remain.",
      [`critical_violations=${gapMetrics.critical_violations}`],
      closureErrorRel
    );
  }

  if (gapMetrics.orphan_code_units > 0 || gapMetrics.orphan_requirements > 0 || gapMetrics.orphan_artifacts > 0) {
    return buildBlockingResult(
      "Closure BLOCKED: orphan entities remain.",
      [
        `orphan_code_units=${gapMetrics.orphan_code_units}`,
        `orphan_requirements=${gapMetrics.orphan_requirements}`,
        `orphan_artifacts=${gapMetrics.orphan_artifacts}`
      ],
      closureErrorRel
    );
  }

  const acceptableForFinalClosure =
    gapMetrics.total_gaps === 0 &&
    gapMetrics.critical_violations === 0 &&
    gapMetrics.orphan_code_units === 0 &&
    gapMetrics.orphan_requirements === 0 &&
    gapMetrics.orphan_artifacts === 0;

  const decisionHasReview =
    Array.isArray(decisionJson.review_required_actions) && decisionJson.review_required_actions.length > 0;
  const decisionHasReject =
    Array.isArray(decisionJson.rejected_actions) && decisionJson.rejected_actions.length > 0;

  if (decisionHasReview || decisionHasReject) {
    return buildBlockingResult(
      "Closure BLOCKED: decision state is not final and executable.",
      [
        `review_required_actions=${decisionHasReview ? decisionJson.review_required_actions.length : 0}`,
        `rejected_actions=${decisionHasReject ? decisionJson.rejected_actions.length : 0}`
      ],
      closureErrorRel
    );
  }

  const backfillActions = Array.isArray(backfillJson.approved_code_actions)
    ? backfillJson.approved_code_actions
    : [];
  const executeActions = Array.isArray(executeJson.approved_code_actions)
    ? executeJson.approved_code_actions
    : Array.isArray(executeJson.actions)
      ? executeJson.actions
      : executeJson.plan && Array.isArray(executeJson.plan.actions)
        ? executeJson.plan.actions
        : [];

  if (backfillActions.length !== executeActions.length) {
    return buildBlockingResult(
      "Closure BLOCKED: execute plan is inconsistent with backfill plan.",
      [
        `backfill_actions=${backfillActions.length}`,
        `execute_actions=${executeActions.length}`
      ],
      closureErrorRel
    );
  }

  const verifyBlocked = verifyResultsJson && verifyResultsJson.blocked === true;

  const verifyOutcome = String(
    verifyResultsJson && (
      verifyResultsJson.final_outcome ||
      verifyResultsJson.outcome ||
      verifyResultsJson.status ||
      verifyResultsJson.verification_status ||
      ""
    )
  ).toUpperCase();

  const verifyContractReady =
    verifyResultsJson &&
    verifyResultsJson.closure_gate &&
    verifyResultsJson.closure_gate.closure_contract_ready === true;

  const verifyPassed =
    verifyBlocked !== true &&
    (verifyOutcome === "PASS" || verifyOutcome === "PASSED" || verifyOutcome === "OK") &&
    verifyContractReady === true;

  if (!verifyPassed) {
    return buildBlockingResult(
      "Closure BLOCKED: verification layer did not pass closure contract.",
      [
        `verify_blocked=${verifyBlocked === true ? "true" : "false"}`,
        `verify_outcome=${verifyOutcome || "(empty)"}`,
        `verify_contract_ready=${verifyContractReady === true ? "true" : "false"}`
      ],
      closureErrorRel
    );
  }

  const releasePaths = [
    closureReportRel,
    releaseManifestRel,
    repoSnapshotRel
  ];

  const artifactNamespacesValid = releasePaths.every((rel) => artifactNamespaceValid(rel));
  if (!artifactNamespacesValid) {
    return buildBlockingResult(
      "Closure BLOCKED: invalid artifact namespace detected.",
      releasePaths,
      closureErrorRel
    );
  }

  const snapshot = computeRepositorySnapshot();
  const deterministicTimestamp = deriveDeterministicTimestamp(intakeSnapshot, executeJson, decisionJson);
  const executionId = `MODULE_FLOW_CLOSURE_${sha256Text(`${snapshot.repository_hash}|${operatingMode}|${repositoryState}`).slice(0, 12)}`;

  const closureDir = path.resolve(ROOT, "artifacts", "closure");
  const releaseDir = path.resolve(ROOT, "artifacts", "release");
  const tasksDir = path.resolve(ROOT, "artifacts", "tasks");
  const taskClosureRel = "artifacts/tasks/TASK-055.execution.closure.md";
  const taskClosureAbs = path.resolve(ROOT, taskClosureRel);

  ensureDir(closureDir);
  ensureDir(releaseDir);
  ensureDir(tasksDir);

  const releaseManifest = {
    execution_id: executionId,
    release_timestamp: deterministicTimestamp,
    modules_executed: [
      "Intake",
      "Audit",
      "Trace",
      "Gap",
      "Decision",
      "Backfill",
      "Execute",
      "Verify",
      "Closure"
    ],
    gap_count: gapMetrics.total_gaps,
    critical_violations: gapMetrics.critical_violations,
    snapshot_hash: snapshot.repository_hash,
    deterministic_confirmation: true
  };

  const repositoryHashSnapshot = {
    execution_id: executionId,
    total_files: snapshot.total_files,
    repository_hash: snapshot.repository_hash,
    hash_algorithm: snapshot.hash_algorithm,
    captured_at: deterministicTimestamp
  };

  const closurePayload = {
    execution_id: executionId,
    release_timestamp: deterministicTimestamp,
    operating_mode: operatingMode,
    repository_state: repositoryState,
    final_outcome: "READY — Module Flow Closure COMPLETE",
    verified_modules: [
      { name: "Audit", status: "OK" },
      { name: "Trace", status: "OK" },
      { name: "Gap", status: "OK" },
      { name: "Decision Gate", status: "OK" },
      { name: "Backfill", status: "OK" },
      { name: "Execute", status: "OK" },
      { name: "Verify", status: "OK" },
      { name: "Closure", status: "OK" }
    ],
    gap_status: {
      gap_count: gapMetrics.total_gaps,
      critical_violations: gapMetrics.critical_violations,
      orphan_code_units: gapMetrics.orphan_code_units,
      orphan_requirements: gapMetrics.orphan_requirements,
      orphan_artifacts: gapMetrics.orphan_artifacts,
      acceptable_for_final_closure: acceptableForFinalClosure
    },
    deterministic_validation: {
      intake_snapshot_locked: true,
      artifact_namespaces_valid: true,
      decision_artifact_valid: true,
      verify_contract_ready: true,
      deterministic_confirmation: true,
      snapshot_hash: snapshot.repository_hash
    },
    release_artifacts: {
      verify_report: verifyReportRel,
      closure_report: closureReportRel,
      release_manifest: releaseManifestRel,
      repository_hash_snapshot: repoSnapshotRel
    }
  };

  fs.writeFileSync(path.resolve(ROOT, releaseManifestRel), JSON.stringify(releaseManifest, null, 2), { encoding: "utf8" });
  fs.writeFileSync(path.resolve(ROOT, repoSnapshotRel), JSON.stringify(repositoryHashSnapshot, null, 2), { encoding: "utf8" });
  fs.writeFileSync(path.resolve(ROOT, closureReportRel), renderClosureReport(closurePayload), { encoding: "utf8" });

  const taskClosureLines = [
    "# TASK-055 Execution Closure",
    "",
    `- task: TASK-055`,
    `- outcome: COMPLETE`,
    `- execution_id: ${executionId}`,
    `- closure_report: ${closureReportRel}`,
    `- release_manifest: ${releaseManifestRel}`,
    `- repository_hash_snapshot: ${repoSnapshotRel}`,
    ""
  ];

  fs.writeFileSync(taskClosureAbs, taskClosureLines.join("\n"), { encoding: "utf8" });

  return {
    stage_progress_percent: 100,
    closure_artifact: true,
    artifact: taskClosureRel,
    outputs: {
      md: closureReportRel,
      release_manifest: releaseManifestRel,
      repository_hash_snapshot: repoSnapshotRel
    },
    status_patch: {
      blocking_questions: [],
      next_step: "READY — Module Flow Closure COMPLETE"
    }
  };
}

module.exports = {
  runClosure
};
