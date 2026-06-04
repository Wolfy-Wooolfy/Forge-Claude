"use strict";

// Per §ARC convention, test helpers may use fs.*Sync directly (test
// infrastructure, not production code).

const fs   = require("fs");
const path = require("path");
const os   = require("os");

const FORGE_ROOT = path.resolve(__dirname, "../../../../");

const CANONICAL_MARKERS = [
  "progress/status.json",
  "code/src/workspace/apiServer.js",
  "ecosystem.config.js"
];

// ── fixture helpers ───────────────────────────────────────────────────────────

function _makeFixtureRoot(withMarkers) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-guard-test-"));
  if (withMarkers) {
    fs.mkdirSync(path.join(tmpDir, "progress"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "progress", "status.json"), "{}", "utf8");
    fs.mkdirSync(path.join(tmpDir, "code", "src", "workspace"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "code", "src", "workspace", "apiServer.js"), "", "utf8");
    fs.writeFileSync(path.join(tmpDir, "ecosystem.config.js"), "", "utf8");
  }
  return tmpDir;
}

function _cleanFixture(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ── S250 ─────────────────────────────────────────────────────────────────────
// Guard called with a valid fixture root (all markers present) → no process.exit.

async function runS250GuardMarkersPresent() {
  const { assertForgeRoot } = require("../../startup/forge_root_guard");

  const fixtureRoot = _makeFixtureRoot(true);
  let guardExits  = false;
  let exitCode    = null;
  let pathLogged  = false;

  const origExit = process.exit;
  const origLog  = console.log;

  try {
    process.exit = (code) => {
      guardExits = true;
      exitCode   = code;
      throw new Error("__process_exit_intercepted__:" + code);
    };
    console.log = (...args) => {
      const msg = args.join(" ");
      if (msg.includes(fixtureRoot)) pathLogged = true;
    };

    assertForgeRoot(fixtureRoot);
  } catch (e) {
    if (!e.message.startsWith("__process_exit_intercepted__")) throw e;
  } finally {
    process.exit  = origExit;
    console.log   = origLog;
    _cleanFixture(fixtureRoot);
  }

  return { guard_exits: guardExits, exit_code: exitCode, path_logged: pathLogged };
}

// ── S251 ─────────────────────────────────────────────────────────────────────
// Guard called with empty dir (no markers) → process.exit(1).

async function runS251GuardMarkersMissing() {
  const { assertForgeRoot } = require("../../startup/forge_root_guard");

  const emptyRoot = _makeFixtureRoot(false);
  let guardExits = false;
  let exitCode   = null;

  const origExit  = process.exit;
  const origError = console.error;

  try {
    process.exit = (code) => {
      guardExits = true;
      exitCode   = code;
      throw new Error("__process_exit_intercepted__:" + code);
    };
    console.error = () => {};

    assertForgeRoot(emptyRoot);
  } catch (e) {
    if (!e.message.startsWith("__process_exit_intercepted__")) throw e;
  } finally {
    process.exit  = origExit;
    console.error = origError;
    _cleanFixture(emptyRoot);
  }

  return { guard_exits: guardExits, exit_code: exitCode };
}

// ── S252 ─────────────────────────────────────────────────────────────────────
// Doctor install_path check: PASS on real Forge root, no stale sibling.

async function runS252DoctorCheckPass() {
  const checkPath = require.resolve("../../runtime/doctor/checks/install_path");
  delete require.cache[checkPath];
  const check = require(checkPath);

  const ctx = {
    root: FORGE_ROOT,
    _test_stale_sibling_path: path.join(os.tmpdir(), "forge_nonexistent_stale_" + Date.now())
  };

  const result = await Promise.resolve(check.fn(ctx));

  return {
    check_status_is_pass: result.status === "PASS",
    detail_has_path:      typeof result.detail === "string" && result.detail.includes(FORGE_ROOT)
  };
}

// ── S253 ─────────────────────────────────────────────────────────────────────
// Doctor install_path check: WARN when stale sibling fixture exists.

async function runS253DoctorCheckWarnStaleSibling() {
  const checkPath = require.resolve("../../runtime/doctor/checks/install_path");
  delete require.cache[checkPath];
  const check = require(checkPath);

  const staleFixture = _makeFixtureRoot(true);
  let result;

  try {
    const ctx = {
      root: FORGE_ROOT,
      _test_stale_sibling_path: staleFixture
    };
    result = await Promise.resolve(check.fn(ctx));
  } finally {
    _cleanFixture(staleFixture);
  }

  const detailNamesRoot  = typeof result.detail === "string" && result.detail.includes(FORGE_ROOT);
  const detailNamesStale = typeof result.detail === "string" && result.detail.includes(staleFixture);

  return {
    check_status_is_warn:    result.status === "WARN",
    detail_names_both_paths: detailNamesRoot && detailNamesStale
  };
}

module.exports = {
  runS250GuardMarkersPresent,
  runS251GuardMarkersMissing,
  runS252DoctorCheckPass,
  runS253DoctorCheckWarnStaleSibling
};
