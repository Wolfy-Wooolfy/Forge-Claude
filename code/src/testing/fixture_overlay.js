"use strict";

// ── PHASE-41 Fixture Engine — D1 Ephemeral Overlay Root ───────────────────────
// Test-infra only (code/src/testing/**), OUTSIDE Track A's live-runtime scope.
//
// Goal: a full `bin/forge-test.js` run must leave ZERO byproducts in the tracked
// working tree. The runner threads a single `root` for BOTH module `require`
// (path.join(root,"code",...)) AND data writes (decision_log.json, status.json,
// project dirs, ...). Several test helpers also capture `process.cwd()` as their
// own ROOT at require time. PHASE-36 already made every runtime write honor the
// passed root, so the runtime is root-relocatable: we build an ephemeral overlay
// root under os.tmpdir(), JUNCTION the read-only input dirs back to the real repo
// (require/read via root → realpath resolves to the real files, single module
// identity), give it FRESH writable artifacts/ + progress/ seeded with the
// read-then-write inputs, pass it as `root`, and chdir() into it (so cwd-default
// writers and cwd-ROOT helpers isolate too). Every write lands in the overlay and
// is torn down.
//
// Junction lifecycle verified on this toolchain (Windows, no admin): symlinkSync
// (...,"junction") creates without privilege; require resolves through it;
// lstat().isSymbolicLink()===true; rmdir(link)+rmSync leave the target intact.

const fs   = require("fs");
const os   = require("os");
const path = require("path");

// Top-level read-only input dirs the runtime / cwd-ROOT helpers resolve via root
// (require targets, doc/web reads, install_path markers under code/, install +
// service scripts). Junctioned, never written through.
const TOP_JUNCTION_DIRS = ["code", "docs", "web", "architecture", "node_modules", "scripts"];

// Read-only input dirs that live UNDER the write-zone artifacts/ (so artifacts/
// itself stays a fresh writable dir; only these specific subdirs are junctioned).
//   - vendor/tree-sitter-grammars (WASM grammars + MANIFEST) — read by intake_tools
//     (__dirname) AND by the S183 regression helper (cwd-ROOT).
//   - test_fixtures/ — intake fixtures (fixture_pycli/nextjs/gocli), read via cwd-ROOT.
//   - projects/_reference_todo_api — L5b reference project; junctioned (not copied)
//     so the builtproject harness uses its real node_modules. Its harness outputs
//     (forge_tests/last_report.json, loopback_signal.json) are .gitignore'd (§17),
//     so writing them through the junction leaves the tracked tree clean — same as
//     pre-overlay behavior.
const NESTED_JUNCTION_RELS = [
  path.join("artifacts", "vendor"),
  path.join("artifacts", "test_fixtures"),
  path.join("artifacts", "projects", "_reference_todo_api"),
];

// Read-only root-level config files the runtime/doctor reads via root
// (e.g. install_path canonical marker `ecosystem.config.js`). Copied (cheap).
const COPY_FILES = ["package.json", "ecosystem.config.js"];

function _junction(realRoot, fixtureRoot, rel, junctions) {
  const target = path.join(realRoot, rel);
  if (!fs.existsSync(target)) return;
  const link = path.join(fixtureRoot, rel);
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(target, link, "junction");
  junctions.push(link);
}

function buildOverlay(realRoot) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "forge-su-"));
  const junctions   = [];

  // 1. Junction top-level read-only input dirs. `require(path.join(root,"code",...))`
  //    opens fixtureRoot/code/... → realpath → realRoot/code/... (same module cache).
  for (const d of TOP_JUNCTION_DIRS) _junction(realRoot, fixtureRoot, d, junctions);

  // 2. Copy read-only root-level config files (install_path markers, etc.).
  for (const f of COPY_FILES) {
    const src = path.join(realRoot, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(fixtureRoot, f));
  }

  // 3. Fresh writable progress/ seeded with status.json (read by apiServer:308;
  //    patched by runDoctor._patchStatusRuntimeHealth — S196 / cwd-default path).
  fs.mkdirSync(path.join(fixtureRoot, "progress"), { recursive: true });
  const statusSrc = path.join(realRoot, "progress", "status.json");
  if (fs.existsSync(statusSrc)) {
    fs.copyFileSync(statusSrc, path.join(fixtureRoot, "progress", "status.json"));
  }

  // 4. Fresh writable artifacts/ seeded with the read-then-write inputs read via
  //    root. Everything else under artifacts/ (decision_log.json, projects/test_*,
  //    health/, audit/, ...) is created on demand by the writers in the overlay.
  const llmDir = path.join(fixtureRoot, "artifacts", "llm");
  fs.mkdirSync(llmDir, { recursive: true });
  const apSrc = path.join(realRoot, "artifacts", "llm", "approval_policy.json"); // apiServer:63
  if (fs.existsSync(apSrc)) fs.copyFileSync(apSrc, path.join(llmDir, "approval_policy.json"));

  // 5. Junction the read-only input subdirs that live under artifacts/.
  for (const rel of NESTED_JUNCTION_RELS) _junction(realRoot, fixtureRoot, rel, junctions);

  return { root: fixtureRoot, junctions };
}

function teardownOverlay(overlay) {
  if (!overlay || !overlay.root) return;
  let exists = false;
  try { exists = fs.existsSync(overlay.root); } catch (_) { return; }
  if (!exists) return;

  // SAFETY: remove every junction LINK first (rmdir on a junction removes the
  // reparse point, NEVER the target). Only when ALL junctions are confirmed
  // cleared do we rmSync the remaining (real, copied) tree — so a stray junction
  // can never let the recursive delete follow into the real repo.
  let allCleared = true;
  for (const link of (overlay.junctions || [])) {
    let st;
    try { st = fs.lstatSync(link); } catch (_) { continue; } // absent → nothing to clear
    if (st.isSymbolicLink()) {
      try { fs.rmdirSync(link); }
      catch (_) { try { fs.unlinkSync(link); } catch (_) { allCleared = false; } }
    } else {
      allCleared = false; // unexpected real dir where a junction was expected — do not risk it
    }
  }
  if (!allCleared) return; // leave the temp dir (harmless, in os.tmpdir()); never risk realRoot
  try { fs.rmSync(overlay.root, { recursive: true, force: true }); } catch (_) {}
}

module.exports = { buildOverlay, teardownOverlay, TOP_JUNCTION_DIRS, NESTED_JUNCTION_RELS, COPY_FILES };
