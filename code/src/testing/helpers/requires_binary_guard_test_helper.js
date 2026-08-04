"use strict";

// PHASE-55 W-3 — S387: meta-lock (S340 version-pin pattern) asserting that S57
// declares the sanctioned requires_binary environment guard (scenario_runner.js
// :914-924; the five docker scenarios' precedent). Deterministic, $0, no binary
// is probed here — the guard's runtime semantics are already locked by the five
// docker scenarios; what THIS scenario locks is S57's declaration, so the guard
// cannot silently disappear (the exact R-14/PHASE-54 environment-restore lesson).
//
// The core-shape pins prevent the meta-lock being satisfied by gutting S57:
// the declaration must coexist with the real Tier-1 pip install scenario.

const { getDefaultRegistry } = require("../../runtime/tools/_registry");

const ROOT = process.cwd();
const S57_REL = "code/src/testing/scenarios/S57_pkg_install_pip_tier1.json";

async function runS387S57GuardDeclared() {
  const out = {};
  const reg = getDefaultRegistry();

  let s57 = null;
  try {
    const r = await reg.invoke("fs.read_file", { path: S57_REL }, { root: ROOT });
    if (r && r.status === "SUCCESS" && r.output && r.output.content) {
      s57 = JSON.parse(r.output.content);
    }
  } catch (_e) { s57 = null; }

  out.s57_file_parses = !!s57;
  // The W-3 declaration itself — value fixed by the R-17 measurement (both pip3
  // and pip probed SUCCESS on the owner's machine; pip3 mirrors the adapter's
  // primary choice at pip_adapter.js:22).
  out.s57_declares_requires_binary = !!(s57 && s57.requires_binary === "pip3");
  // Core-shape pins: the guard must guard the REAL scenario, not a husk.
  out.s57_still_direct_tool_pkg_install = !!(s57 && s57.type === "direct_tool" &&
    s57.tool === "pkg.install");
  out.s57_still_pip_adapter = !!(s57 && s57.input && s57.input.adapter_id === "pip");
  out.s57_assertions_intact = !!(s57 && Array.isArray(s57.assertions) &&
    s57.assertions.length >= 5);

  return out;
}

module.exports = { runS387S57GuardDeclared };
