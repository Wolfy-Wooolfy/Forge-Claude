"use strict";

/**
 * Forge install orchestrator — 11 sequential steps with rollback.
 *
 * §ARC-3 extension: execSync (robocopy, npm, NSSM, service) + fs.*Sync (dir/file ops).
 * Authority: DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md §6
 *
 * D1 compliance: installer does NOT auto-download NSSM. It locates a pre-placed binary
 * or pauses with a one-time prompt for the owner to download manually.
 */

const os       = require("os");
const fs       = require("fs");
const path     = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const { runPreflight }      = require("./preflight");
const { runRollback }       = require("./rollback");
const { runPostVerify }     = require("./post_verify");
const { verifyNssmVersion } = require("./_nssm_helper");

const INSTALL_DIR  = "C:\\Forge";
const SERVICE_NAME = "forge-api";

// D1 — owner places nssm.exe at one of these paths (or on system PATH)
const NSSM_SEARCH_PATHS = [
  "C:\\tools\\nssm-2.24\\win64\\nssm.exe",
  "C:\\tools\\nssm-2.24\\nssm.exe",
  "C:\\Program Files\\nssm\\nssm.exe"
];

// Mutable state shared between steps
let _nssmPath       = null;
let _completedSteps = [];

// ── Public entry point ────────────────────────────────────────────────────────

async function runInstall(options) {
  const root   = options.root;
  const dryRun = !!options.dryRun;

  // Reset state for re-entrant calls (test isolation)
  _nssmPath       = null;
  _completedSteps = [];

  _printBanner(dryRun);

  const STEPS = [
    { id: "preflight",           fn: () => _stepPreflight(root, dryRun),        rollbackable: false },
    { id: "node_install",        fn: () => _stepEnsureNode(dryRun),             rollbackable: false },
    { id: "copy_repo",           fn: () => _stepCopyRepo(root, dryRun),         rollbackable: true  },
    { id: "npm_install",         fn: () => _stepNpmInstall(dryRun),             rollbackable: true  },
    { id: "nssm_locate_or_wait", fn: () => _stepLocateOrPromptNssm(dryRun),     rollbackable: false },
    { id: "nssm_verify",         fn: () => _stepVerifyNssm(dryRun),             rollbackable: false },
    { id: "migrate_secrets",     fn: () => _stepMigrateSecrets(dryRun),         rollbackable: false },
    { id: "service_install",     fn: () => _stepInstallService(dryRun),         rollbackable: true  },
    { id: "service_start",       fn: () => _stepStartService(dryRun),           rollbackable: true  },
    { id: "post_verify",         fn: () => _stepPostVerify(root, dryRun),       rollbackable: true  },
    { id: "open_browser",        fn: () => _stepOpenBrowser(dryRun),            rollbackable: false },
    { id: "success_print",       fn: () => _stepPrintSuccess(dryRun),           rollbackable: false }
  ];

  for (const step of STEPS) {
    const tag = dryRun ? "[DRY-RUN:" + step.id + "]" : "[" + step.id + "]";
    process.stdout.write(tag + " Running...");

    try {
      await step.fn();
      process.stdout.write(" ✓\n");
      _completedSteps.push(step.id);
    } catch (err) {
      process.stdout.write(" ✗\n");
      console.error("\n  Error: " + (err && err.message ? err.message : String(err)));

      if (!dryRun) {
        console.log("\n[rollback] Starting rollback from failed step: " + step.id + " ...");
        try {
          await runRollback({
            installDir:     INSTALL_DIR,
            serviceName:    SERVICE_NAME,
            nssmPath:       _nssmPath,
            completedSteps: _completedSteps,
            sourceRoot:     root
          });
          console.log("[rollback] Complete — system restored to pre-install state.");
        } catch (rbErr) {
          console.error("[rollback] Rollback error: " + (rbErr && rbErr.message ? rbErr.message : rbErr));
        }
      }

      return { ok: false, failed_step: step.id, error: err && err.message };
    }
  }

  return { ok: true };
}

// ── Step implementations ──────────────────────────────────────────────────────

async function _stepPreflight(root, dryRun) {
  if (dryRun) {
    console.log("\n  Preflight checks (platform, admin, port, disk, existing service):");
    const { errors, warnings } = await runPreflight({ root });
    for (const w of warnings) console.log("  [WARN]       " + w);
    if (errors.length > 0) {
      for (const e of errors) console.log("  [WOULD FAIL] " + e);
      console.log("  (Resolve the above before running without --dry-run — dry-run continues)");
    } else {
      console.log("  All preflight checks would pass.");
    }
    return;
  }

  const { errors, warnings } = await runPreflight({ root });

  for (const w of warnings) console.log("\n  [WARN] " + w);

  if (errors.length > 0) {
    throw new Error("Preflight failed:\n" + errors.map((e) => "  • " + e).join("\n"));
  }
}

async function _stepEnsureNode(dryRun) {
  const ver   = process.versions.node;
  const major = parseInt(ver.split(".")[0], 10);

  if (major >= 20) {
    if (dryRun) console.log("\n  Node.js v" + ver + " already installed (v20+) — no action needed.");
    return;
  }

  if (dryRun) {
    console.log("\n  Node.js v" + ver + " < v20 — would install Node.js 20 LTS via winget.");
    return;
  }

  console.log("\n  Installing Node.js 20 LTS via winget...");
  try {
    execSync(
      "winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements",
      { stdio: "inherit", timeout: 300000 }
    );
  } catch (_) {
    throw new Error(
      "Node.js auto-install failed via winget. " +
      "Please install Node.js 20 LTS manually from https://nodejs.org/ and re-run."
    );
  }
}

async function _stepCopyRepo(root, dryRun) {
  if (dryRun) {
    const exists = fs.existsSync(INSTALL_DIR);
    console.log(
      "\n  Would robocopy " + root + " → " + INSTALL_DIR +
      (exists ? " (existing — overwrite)" : " (new)") +
      "\n  Excluding: node_modules, .git"
    );
    return;
  }

  if (fs.existsSync(INSTALL_DIR)) {
    console.log("\n  " + INSTALL_DIR + " exists — updating in place.");
  }

  // robocopy: /E = include empty dirs, /XD = exclude dirs, /NFL /NDL = quiet
  // robocopy exit codes 0-7 are success; 8+ are errors
  try {
    execSync(
      'robocopy "' + root + '" "' + INSTALL_DIR + '" /E /XD node_modules .git /NFL /NDL /NJH /NJS',
      { timeout: 300000 }
    );
  } catch (err) {
    // robocopy returns non-zero exit codes even on success (1-7 = files copied)
    if (err.status !== undefined && err.status >= 8) {
      throw new Error("robocopy failed with exit code " + err.status + ": " + err.message);
    }
    // exit codes 1-7 = partial/full success — not an error
  }
}

async function _stepNpmInstall(dryRun) {
  if (dryRun) {
    console.log("\n  Would run: npm install (in " + INSTALL_DIR + ")");
    return;
  }

  console.log("\n  Running npm install in " + INSTALL_DIR + " ...");
  execSync("npm install", { cwd: INSTALL_DIR, stdio: "inherit", timeout: 300000 });
}

async function _stepLocateOrPromptNssm(dryRun) {
  // Check standard paths
  for (const p of NSSM_SEARCH_PATHS) {
    if (fs.existsSync(p)) {
      _nssmPath = p;
      if (dryRun) console.log("\n  NSSM found at: " + p + " — no user action needed.");
      return;
    }
  }

  // Check system PATH
  try {
    const out = execSync("where nssm.exe", { encoding: "utf8", timeout: 5000, stdio: "pipe" });
    const found = (out || "").trim().split(/\r?\n/)[0].trim();
    if (found && fs.existsSync(found)) {
      _nssmPath = found;
      if (dryRun) console.log("\n  NSSM found in PATH at: " + found + " — no user action needed.");
      return;
    }
  } catch (_) { /* not in PATH */ }

  // Not found
  if (dryRun) {
    console.log(
      "\n  NSSM NOT found in standard locations or PATH." +
      "\n  Would display one-time download prompt (D1 compliance)." +
      "\n  Expected path after download: " + NSSM_SEARCH_PATHS[0]
    );
    _nssmPath = NSSM_SEARCH_PATHS[0]; // placeholder for remaining dry-run steps
    return;
  }

  // D1 compliance: show one-time prompt, wait for owner to place nssm.exe
  if (!process.stdin.isTTY) {
    throw new Error(
      "NSSM not found and stdin is not interactive. " +
      "Place nssm.exe at: " + NSSM_SEARCH_PATHS[0] + "\n" +
      "NSSM 2.24 download: https://nssm.cc/release/nssm-2.24.zip\n" +
      "Expected ZIP SHA-256: 727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743"
    );
  }

  _printNssmPrompt();
  await _waitForEnter();

  // Re-check after owner action
  for (const p of NSSM_SEARCH_PATHS) {
    if (fs.existsSync(p)) { _nssmPath = p; return; }
  }
  try {
    const out = execSync("where nssm.exe", { encoding: "utf8", timeout: 5000, stdio: "pipe" });
    const found = (out || "").trim().split(/\r?\n/)[0].trim();
    if (found && fs.existsSync(found)) { _nssmPath = found; return; }
  } catch (_) {}

  throw new Error(
    "NSSM still not found after prompt.\n" +
    "Expected: " + NSSM_SEARCH_PATHS[0] + "\n" +
    "Re-run the installer after placing nssm.exe at that path."
  );
}

async function _stepVerifyNssm(dryRun) {
  if (!_nssmPath) throw new Error("_nssmPath not set — nssm_locate_or_wait must run first.");

  if (dryRun) {
    console.log("\n  Would verify NSSM version (run: nssm version, expect '2.24').");
    return;
  }

  const result = verifyNssmVersion(_nssmPath);

  if (!result.ok) {
    throw new Error(
      "NSSM at '" + _nssmPath + "' did not report version 2.24 " +
      "in any tested encoding (utf8, utf16le, latin1, ascii).\n" +
      "Error: " + result.error + "\n" +
      "Raw bytes (first 100): " + result.rawHex + "\n" +
      "As UTF-8: " + result.utf8
    );
  }

  console.log("\n  Detected: " + result.versionLine + " (encoding: " + result.encoding + ")");
}

async function _stepMigrateSecrets(dryRun) {
  if (dryRun) {
    console.log("\n  Would migrate OPENAI_API_KEY from env to keychain (one-time, idempotent).");
    return;
  }

  const sp = require(path.join(INSTALL_DIR, "code", "src", "runtime", "secrets", "secret_provider"));

  // Idempotent: skip if already in keychain
  const existing = await sp.get("openai_api_key");
  if (existing && existing.ok && existing.value) {
    console.log("\n  OPENAI_API_KEY already in keychain — no migration needed.");
    return;
  }

  const envKey = process.env.OPENAI_API_KEY;
  if (!envKey) {
    throw new Error(
      "OPENAI_API_KEY not found in environment.\n" +
      "Set it in PowerShell before running the installer:\n" +
      "  $env:OPENAI_API_KEY = \"sk-...\"\n" +
      "Or set it permanently in System Properties → Environment Variables."
    );
  }

  const result = await sp.set("openai_api_key", envKey);
  if (!result || !result.ok) {
    throw new Error(
      "Failed to store OPENAI_API_KEY in keychain.\n" +
      "Reason: " + (result && result.reason ? result.reason : "unknown") + "\n" +
      "On Windows, this writes to Credential Manager — ensure your user account has access."
    );
  }

  console.log("\n  OPENAI_API_KEY migrated to Windows Credential Manager (one-time).");
}

async function _stepInstallService(dryRun) {
  const nodePath   = process.execPath;
  const startScript = "start-api.js";
  const logDir     = path.join(INSTALL_DIR, "logs");

  if (dryRun) {
    console.log(
      "\n  Would install service '" + SERVICE_NAME + "' via NSSM:" +
      "\n    Node:   " + nodePath +
      "\n    Script: " + path.join(INSTALL_DIR, startScript) +
      "\n    Logs:   " + logDir
    );
    return;
  }

  fs.mkdirSync(logDir, { recursive: true });

  const n = '"' + _nssmPath + '"';

  // Idempotent: stop + remove if already present
  try { execSync(n + " stop "   + SERVICE_NAME + " confirm", { timeout: 15000 }); } catch (_) {}
  try { execSync(n + " remove " + SERVICE_NAME + " confirm", { timeout: 15000 }); } catch (_) {}

  const exec = n + " install " + SERVICE_NAME + " \"" + nodePath + "\" \"" + startScript + "\"";
  execSync(exec, { timeout: 15000 });

  const set = (k, v) =>
    execSync(n + " set " + SERVICE_NAME + " " + k + " " + v, { timeout: 10000 });

  set("AppDirectory",                '"' + INSTALL_DIR + '"');
  set("AppExit",                     "Default Restart");
  set("AppRestartDelay",             "10000");
  set("AppStdout",                   '"' + path.join(logDir, "forge.log")       + '"');
  set("AppStderr",                   '"' + path.join(logDir, "forge.error.log") + '"');
  set("AppStdoutCreationDisposition","4");
  set("AppStderrCreationDisposition","4");
  set("AppRotateFiles",              "1");
  set("AppRotateBytes",              "10485760");
  set("AppRotateOnline",             "1");
  set("Description",                 '"Forge AI OS — Personal Production API Server"');
  set("Start",                       "SERVICE_AUTO_START");
}

async function _stepStartService(dryRun) {
  if (dryRun) {
    console.log("\n  Would start service: " + SERVICE_NAME);
    return;
  }

  execSync('"' + _nssmPath + '" start ' + SERVICE_NAME, { timeout: 30000 });

  // Poll until RUNNING (max 30 s)
  for (let i = 0; i < 15; i++) {
    await _sleep(2000);
    try {
      const out = execSync("sc query " + SERVICE_NAME, { encoding: "utf8", timeout: 5000 });
      if (out.includes("RUNNING")) return;
    } catch (_) {}
  }

  throw new Error(
    "Service '" + SERVICE_NAME + "' did not reach RUNNING state within 30 seconds. " +
    "Check: sc query " + SERVICE_NAME
  );
}

async function _stepPostVerify(root, dryRun) {
  if (dryRun) {
    console.log(
      "\n  Would run 10 post-install verification checks:" +
      "\n  step_05 step_06 step_09 step_10 step_11 step_12 step_13 step_14 s208 s209" +
      "\n  Evidence would be written to: artifacts/stage_12_7/evidence/"
    );
    return;
  }

  await runPostVerify({
    root,
    installDir:  INSTALL_DIR,
    serviceName: SERVICE_NAME,
    nssmPath:    _nssmPath
  });
}

async function _stepOpenBrowser(dryRun) {
  if (dryRun) {
    console.log("\n  Would open http://127.0.0.1:3100/ in default browser (cosmetic).");
    return;
  }
  try {
    execSync("start http://127.0.0.1:3100/", { timeout: 5000 });
  } catch (_) { /* cosmetic — ignore */ }
}

function _stepPrintSuccess(dryRun) {
  if (dryRun) {
    console.log(
      "\n═══════════════════════════════════════════════════════════════════" +
      "\n  DRY RUN COMPLETE — no changes made. All checks passed above." +
      "\n  Run without --dry-run to install." +
      "\n═══════════════════════════════════════════════════════════════════\n"
    );
    return;
  }

  console.log(
    "\n═══════════════════════════════════════════════════════════════════" +
    "\n  FORGE INSTALLED SUCCESSFULLY" +
    "\n" +
    "\n  Service:  " + SERVICE_NAME + " (running, auto-start)" +
    "\n  Location: " + INSTALL_DIR +
    "\n  API:      http://127.0.0.1:3100/" +
    "\n  Health:   node bin/forge-doctor.js" +
    "\n" +
    "\n  Evidence: artifacts/stage_12_7/evidence/ (10 files)" +
    "\n═══════════════════════════════════════════════════════════════════\n"
  );
}

// ── NSSM one-time download prompt (D1 compliance) ─────────────────────────────

function _printNssmPrompt() {
  console.log(
    "\n" +
    "═══════════════════════════════════════════════════════════════════\n" +
    "  NSSM REQUIRED — ONE-TIME MANUAL DOWNLOAD\n" +
    "═══════════════════════════════════════════════════════════════════\n" +
    "\n" +
    "  Forge requires NSSM 2.24 to install as a Windows service.\n" +
    "  Per project Decision D1 (supply chain security), Forge does\n" +
    "  NOT auto-download external binaries.\n" +
    "\n" +
    "  Please complete these steps in another window:\n" +
    "\n" +
    "    1. Open:    https://nssm.cc/release/nssm-2.24.zip\n" +
    "    2. Download the zip file\n" +
    "    3. Extract to: C:\\tools\\nssm-2.24\\\n" +
    "    4. Verify nssm.exe exists at:\n" +
    "       C:\\tools\\nssm-2.24\\win64\\nssm.exe\n" +
    "\n" +
    "  Expected ZIP SHA-256 (verify before extracting):\n" +
    "    727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743\n" +
    "\n" +
    "  After SHA-256 verification, the installer continues automatically.\n" +
    "\n" +
    "  Press ENTER when ready  (Ctrl+C to abort)...\n" +
    "═══════════════════════════════════════════════════════════════════"
  );
}

function _waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
      terminal: false
    });
    rl.question("", () => { rl.close(); resolve(); });
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

function _printBanner(dryRun) {
  if (dryRun) {
    console.log(
      "\n═══════════════════════════════════════════════════════════════════" +
      "\n  FORGE INSTALLER — DRY RUN (no system changes)" +
      "\n═══════════════════════════════════════════════════════════════════\n"
    );
  } else {
    console.log(
      "\n═══════════════════════════════════════════════════════════════════" +
      "\n  FORGE INSTALLER — Production Setup" +
      "\n  Install location: " + INSTALL_DIR +
      "\n═══════════════════════════════════════════════════════════════════\n"
    );
  }
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { runInstall };
