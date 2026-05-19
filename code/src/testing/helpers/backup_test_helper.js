"use strict";

// Test helpers for S197–S200 (Stage 12.3 — Backup System).
// Per §ARC convention, test helpers may use fs.*Sync directly (test
// infrastructure, not production code).

const fs   = require("fs");
const path = require("path");
const os   = require("os");

// ── S197: backup.create applies DEFAULT_EXCLUDE correctly ────────────────────

async function runS197BackupCreateExcludes() {
  const AdmZip = require("adm-zip");
  const { getDefaultRegistry } = require("../../runtime/tools/_registry");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s197-"));
  try {
    // Files that MUST be excluded
    fs.mkdirSync(path.join(tempDir, "artifacts", "llm", "requests"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "artifacts", "llm", "requests", "req.json"), "{}");

    fs.mkdirSync(path.join(tempDir, "artifacts", "llm", "responses"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "artifacts", "llm", "responses", "res.json"), "{}");

    fs.writeFileSync(path.join(tempDir, ".env"), "OPENAI_API_KEY=sk-test");

    fs.mkdirSync(path.join(tempDir, "node_modules", "some-pkg"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "node_modules", "some-pkg", "index.js"), "{}");

    // Files that MUST be included
    fs.mkdirSync(path.join(tempDir, "artifacts", "llm", "metadata"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "artifacts", "llm", "metadata", "meta.json"), '{"tokens":100}');

    fs.mkdirSync(path.join(tempDir, "artifacts", "projects", "demo"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "artifacts", "projects", "demo", "file.txt"), "demo content");

    // Run backup.create via default registry (harness sets WORKSPACE_WRITE mode)
    const reg = getDefaultRegistry();
    const createResult = await reg.invoke("backup.create", {}, { root: tempDir });

    if (createResult.status !== "SUCCESS") {
      return { create_ok: false, create_status: createResult.status };
    }

    // Verify inclusions/exclusions by reading the produced zip directly
    const archiveAbs = path.resolve(tempDir, createResult.output.path);
    const zip        = new AdmZip(archiveAbs);
    const entries    = zip.getEntries()
      .filter(e => !e.isDirectory)
      .map(e => e.entryName.replace(/\\/g, "/"));

    return {
      requests_excluded:  !entries.some(e => e.startsWith("artifacts/llm/requests/")),
      responses_excluded: !entries.some(e => e.startsWith("artifacts/llm/responses/")),
      env_excluded:       !entries.includes(".env"),
      node_modules_excluded: !entries.some(e => e.startsWith("node_modules/")),
      metadata_kept:      entries.some(e => e.startsWith("artifacts/llm/metadata/")),
      project_file_kept:  entries.some(e => e.startsWith("artifacts/projects/demo/")),
      file_count:         createResult.output.file_count
    };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S198: backup.verify detects corruption ────────────────────────────────────

async function runS198BackupVerifyDetectsCorruption() {
  const { getDefaultRegistry } = require("../../runtime/tools/_registry");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s198-"));
  try {
    // Create a file to include in the backup
    fs.writeFileSync(path.join(tempDir, "content.txt"), "corruption test content");

    const reg = getDefaultRegistry();

    // Create a valid backup
    const createResult = await reg.invoke("backup.create", {}, { root: tempDir });
    if (createResult.status !== "SUCCESS") {
      return { create_ok: false, verify_returned_failure: false };
    }

    const archiveAbs = path.resolve(tempDir, createResult.output.path);

    // Verify the intact archive first (confirms verify works on valid zip)
    const validResult = await reg.invoke(
      "backup.verify", { path: createResult.output.path }, { root: tempDir }
    );

    // Corrupt the archive: overwrite the final 50 bytes, destroying the EOCD
    // and central directory. adm-zip will throw when trying to open it.
    const buf         = fs.readFileSync(archiveAbs);
    const corruptFrom = Math.max(0, buf.length - 50);
    buf.fill(0xFF, corruptFrom, buf.length);
    fs.writeFileSync(archiveAbs, buf);

    // Run verify on the corrupted archive
    const corruptResult = await reg.invoke(
      "backup.verify", { path: createResult.output.path }, { root: tempDir }
    );

    return {
      valid_backup_was_ok:  validResult.status === "SUCCESS" && validResult.output.ok === true,
      ok:                   corruptResult.output ? corruptResult.output.ok : null,
      reason:               corruptResult.output ? corruptResult.output.reason : null,
      verify_returned_failure:
        corruptResult.status === "SUCCESS" && corruptResult.output.ok === false
    };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S199: Doctor check warns when backup is stale ────────────────────────────

async function runS199DoctorWarnsOnStaleBackup() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s199-"));
  try {
    // Write a fake-old backup using a filename 9 days in the past.
    // Doctor check reads the timestamp from the filename, not file mtime.
    const nineOld = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    const oldTs   = nineOld.toISOString().replace(/:/g, "-").replace(/\./g, "-");

    fs.mkdirSync(path.join(tempDir, "artifacts", "backups"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "artifacts", "backups", oldTs + ".zip"), "");

    // Run the Doctor check directly (no full runDoctor needed)
    const backupStatus = require("../../runtime/doctor/checks/backup_status");
    const result       = await backupStatus.fn({ root: tempDir });

    return {
      doctor_status:       result.status,
      contains_days_warning: result.detail.includes("days old")
    };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S200: backup.restore round-trip + ENFORCEMENT_DENIED check ───────────────

async function runS200BackupRestoreRoundTrip() {
  const { createRegistry, getDefaultRegistry } = require("../../runtime/tools/_registry");
  const { createPolicy } = require("../../runtime/permission/permissionPolicy");

  const tempA = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s200a-"));
  const tempB = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s200b-"));
  try {
    // Create known test files in tempA
    fs.writeFileSync(path.join(tempA, "hello.txt"), "hello from s200");
    fs.mkdirSync(path.join(tempA, "src"), { recursive: true });
    fs.writeFileSync(path.join(tempA, "src", "app.js"), 'console.log("forge");');

    // Create backup in tempA using default registry (WORKSPACE_WRITE from harness)
    const defaultReg  = getDefaultRegistry();
    const createResult = await defaultReg.invoke("backup.create", {}, { root: tempA });

    if (createResult.status !== "SUCCESS") {
      return { restored_count: 0, content_matches: false, denied_in_workspace_write: false };
    }

    const archiveRelPath  = createResult.output.path;           // artifacts/backups/<ts>.zip
    const archiveAbsPathA = path.resolve(tempA, archiveRelPath);

    // Copy archive from tempA into tempB's backups directory for restore testing
    const archiveDirB     = path.join(tempB, "artifacts", "backups");
    const archiveAbsPathB = path.join(archiveDirB, path.basename(archiveRelPath));
    fs.mkdirSync(archiveDirB, { recursive: true });
    fs.copyFileSync(archiveAbsPathA, archiveAbsPathB);

    // Test 1 — DENIED in WORKSPACE_WRITE mode (default registry mode from harness)
    // backup.restore requires DANGER_FULL_ACCESS → permission policy denies it
    const deniedResult = await defaultReg.invoke(
      "backup.restore",
      { path: archiveRelPath },
      { root: tempB }
    );
    const denied_in_workspace_write = deniedResult.status === "DENIED";

    // Test 2 — SUCCESS with DANGER_FULL_ACCESS mode via a fresh permissive registry
    // createPolicy({ active_mode }) bypasses fromEnv() FORGE_ALLOW_SELF_MODIFY check
    const permissiveReg    = createRegistry({ root: tempB });
    permissiveReg.load();
    const permissivePolicy = createPolicy({ active_mode: "DANGER_FULL_ACCESS" });
    permissiveReg.setAuthorizeFunction(
      (tool, input, ctx) => permissivePolicy.authorize(tool, input, ctx)
    );

    const restoreResult = await permissiveReg.invoke(
      "backup.restore",
      { path: archiveRelPath },
      { root: tempB }
    );

    if (restoreResult.status !== "SUCCESS") {
      return {
        restored_count:          0,
        content_matches:         false,
        denied_in_workspace_write,
        restore_status:          restoreResult.status
      };
    }

    // Verify content equality between originals in tempA and restored files in tempB
    const helloOrig     = fs.readFileSync(path.join(tempA, "hello.txt"), "utf8");
    const helloRestored = fs.readFileSync(path.join(tempB, "hello.txt"), "utf8");
    const appOrig       = fs.readFileSync(path.join(tempA, "src", "app.js"), "utf8");
    const appRestored   = fs.readFileSync(path.join(tempB, "src", "app.js"), "utf8");

    return {
      restored_count:          restoreResult.output.extracted_count,
      content_matches:         helloOrig === helloRestored && appOrig === appRestored,
      denied_in_workspace_write
    };
  } finally {
    try { fs.rmSync(tempA, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tempB, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  runS197BackupCreateExcludes,
  runS198BackupVerifyDetectsCorruption,
  runS199DoctorWarnsOnStaleBackup,
  runS200BackupRestoreRoundTrip
};
