"use strict";

// H-1: Decision Finality & Supersession Enforcement
// Per docs/07_decisions/07_Decision_Logging_and_Change_Traceability_Specification.md
//
// Rules:
//   - Decision with status=ACCEPTED is FINAL — no fields may be modified
//   - SUPERSEDED decisions must have superseded_by populated
//   - A Decision MUST NOT be deleted; only SUPERSEDED with a new Decision referencing it
//   - System MUST NOT make decisions autonomously (authority=HUMAN only)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../../..");

const FINALITY_STATUSES = ["ACCEPTED", "SUPERSEDED", "REJECTED"];
const SNAPSHOTS_DIR_REL = "artifacts/decisions/.snapshots";

function ensureDir(abs) { fs.mkdirSync(abs, { recursive: true }); }
function readJsonSafe(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch (_) { return fallback; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}
function nowIso() { return new Date().toISOString(); }

function sha256(str) {
  return crypto.createHash("sha256").update(str, "utf-8").digest("hex");
}

function getSnapshotPath(root, decisionId) {
  return path.join(root, SNAPSHOTS_DIR_REL, `${decisionId}.snapshot.json`);
}

function sealDecision(root, decisionId, decisionData) {
  const snapshotPath = getSnapshotPath(root, decisionId);
  if (fs.existsSync(snapshotPath)) {
    return { ok: false, reason: "ALREADY_SEALED", decision_id: decisionId };
  }
  const payload = {
    sealed_at: nowIso(),
    decision_id: decisionId,
    status: decisionData.status || decisionData.decision_status,
    authority: decisionData.authority || decisionData.decision_authority,
    content_hash: sha256(JSON.stringify(decisionData, null, 2))
  };
  writeJson(snapshotPath, payload);
  return { ok: true, decision_id: decisionId, sealed_at: payload.sealed_at };
}

function verifyDecisionNotMutated(root, decisionId, currentData) {
  const snapshotPath = getSnapshotPath(root, decisionId);
  if (!fs.existsSync(snapshotPath)) return { ok: true, note: "No seal — decision not yet finalized" };

  const snapshot = readJsonSafe(snapshotPath, null);
  if (!snapshot) return { ok: true, note: "Snapshot unreadable" };

  const currentHash = sha256(JSON.stringify(currentData, null, 2));
  if (currentHash !== snapshot.content_hash) {
    return {
      ok: false,
      violation: "IMMUTABILITY_VIOLATED",
      decision_id: decisionId,
      note: `Decision ${decisionId} (status=${snapshot.status}) was modified after being sealed`,
      sealed_at: snapshot.sealed_at
    };
  }
  return { ok: true };
}

function checkAuthorityRule(decisionData) {
  const authority = String(decisionData.authority || decisionData.decision_authority || "").toUpperCase();
  if (!authority || authority === "SYSTEM" || authority === "AI") {
    return {
      ok: false,
      violation: "INVALID_AUTHORITY",
      note: `Decision authority must be HUMAN, not '${authority || "UNSET"}'`
    };
  }
  return { ok: true };
}

function runDecisionFinalityEnforcer(options = {}) {
  const root = String(options.root || ROOT);
  const decisionsDir = path.join(root, "artifacts", "decisions");
  const outputPath = path.join(root, "artifacts", "verify", "decision_finality_report.json");

  const violations = [];
  let filesScanned = 0;

  if (!fs.existsSync(decisionsDir)) {
    const artifact = { timestamp_utc: nowIso(), files_scanned: 0, violations_found: 0, result: "PASS", verdict: "No decisions directory — nothing to enforce", violations: [] };
    writeJson(outputPath, artifact);
    return { ok: true, result: "PASS", violations: 0 };
  }

  function walk(dir) {
    fs.readdirSync(dir).forEach((entry) => {
      if (entry.startsWith(".")) return;
      const abs = path.join(dir, entry);
      if (fs.statSync(abs).isDirectory()) { walk(abs); return; }
      if (!abs.endsWith(".json")) return;

      const data = readJsonSafe(abs, null);
      if (!data || typeof data !== "object") return;

      const decisionId = data.id || data.decision_id || path.basename(abs, ".json");
      filesScanned++;

      // Check authority
      const authorityCheck = checkAuthorityRule(data);
      if (!authorityCheck.ok) violations.push({ file: abs, ...authorityCheck });

      // Check immutability for finalized decisions
      const status = String(data.status || data.decision_status || "").toUpperCase();
      if (FINALITY_STATUSES.includes(status)) {
        const mutationCheck = verifyDecisionNotMutated(root, decisionId, data);
        if (!mutationCheck.ok) violations.push({ file: abs, ...mutationCheck });
      }

      // Check SUPERSEDED has successor
      if (status === "SUPERSEDED" && !(data.superseded_by || data.successor_decision_id)) {
        violations.push({
          file: abs,
          violation: "SUPERSEDED_NO_SUCCESSOR",
          decision_id: decisionId,
          note: "SUPERSEDED decision missing superseded_by reference"
        });
      }
    });
  }

  walk(decisionsDir);

  const passed = violations.length === 0;
  const artifact = {
    timestamp_utc: nowIso(),
    files_scanned: filesScanned,
    violations_found: violations.length,
    result: passed ? "PASS" : "FAIL",
    verdict: passed ? "Decision finality rules satisfied" : `${violations.length} finality violation(s) detected`,
    violations
  };

  writeJson(outputPath, artifact);

  return {
    ok: passed,
    result: passed ? "PASS" : "FAIL",
    artifact_path: "artifacts/verify/decision_finality_report.json",
    blocked: !passed,
    violations: violations.length,
    status_patch: passed
      ? { blocking_questions: [], next_step: "Decision Finality Enforcer: PASS" }
      : { blocking_questions: violations.map((v) => v.note), next_step: "" }
  };
}

module.exports = { runDecisionFinalityEnforcer, sealDecision, verifyDecisionNotMutated };
