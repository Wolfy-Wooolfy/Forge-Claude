"use strict";

// PHASE-36 §4 (PROMPT-E/F) — C3 test helper.
//   S328 — PROMPT-mode boot fail-fast (pure createPolicy factory; try/catch booleans).
//
// (The earlier S329 active-delete branch was REMOVED in the PROMPT-F corrective: the CTO
//  retracted the active-delete "gap" finding — active-delete is intended behavior per
//  DECISION-2026-06-07 D4, already covered by S259. No active-delete scenario is wanted.)
//
// Track A note (test infrastructure): pure module require + try/catch; no fs / network.

function _throws(fn) {
  try { fn(); return false; } catch (_e) { return true; }
}

function runS328PromptFailFast() {
  const { createPolicy } = require("../../runtime/permission/permissionPolicy");
  return {
    // PROMPT control mode, no respond surface wired → MUST throw (no silent 5-min stall).
    prompt_no_surface_throws: _throws(() => createPolicy({ active_mode: "PROMPT" })),
    // PROMPT with the explicit opt-in → MUST NOT throw (caller asserts a responder is wired).
    prompt_with_surface_ok:   !_throws(() => createPolicy({ active_mode: "PROMPT", prompt_respond_surface: true })),
    // TEST control mode and the default data mode are unaffected → MUST NOT throw.
    test_mode_ok:             !_throws(() => createPolicy({ active_mode: "TEST" })),
    workspace_write_ok:       !_throws(() => createPolicy({ active_mode: "WORKSPACE_WRITE" }))
  };
}

module.exports = { runS328PromptFailFast };
