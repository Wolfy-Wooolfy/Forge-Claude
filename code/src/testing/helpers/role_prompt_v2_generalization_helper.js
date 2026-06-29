"use strict";

// PHASE-46 W-2 meta-regression helper — S341.
// Pure file/loader inspection — no LLM calls, no real OS APIs, no side effects.
// Mirrors the S208 / S340 pattern (file-inspection meta-regression).
// Per §ARC convention, test helpers may use fs.*Sync directly (test infrastructure).
//
// Verifies the architect + spec_writer roles are wired to the generalized A-8 id-clause
// prompts (architect_v2 / spec_writer_v2), proving the role → loader → v2 chain that
// W-2 introduces — NOT only a raw read of the .md:
//   (a) each role's declared system_prompt_id === its v2;
//   (b) each role source resolves its prompt via loadPrompt("<role>_v2");
//   (c) loadPrompt("<role>_v2") (that same resolution) contains all three STABLE anchor
//       tokens of the generalized clause (a): "sequential integer" (entity case —
//       Notes-API regression-safe), "short code" (shortener case), and "user-supplied"
//       (the retained default prohibition). Anchored on stable substrings, not on free
//       prose a benign reword could change. Note: the token is "user-supplied" (hyphen),
//       NOT the escape-hatch phrase "user-provided".

const fs   = require("fs");
const path = require("path");

const ROOT = process.cwd();

// Stable anchor tokens that must appear in BOTH generalized clause (a) wordings.
const ANCHOR_TOKENS = ["sequential integer", "short code", "user-supplied"];

function _roleSrcHasLoad(relRolePath, promptId) {
  try {
    const src = fs.readFileSync(path.join(ROOT, relRolePath), "utf8");
    return src.includes('loadPrompt("' + promptId + '")');
  } catch (_e) { return false; }
}

async function runS341RolePromptV2Generalization() {
  // Resolve via the SAME loader path the roles use; reset first so the read reflects
  // current 18b on disk (order-independent within the suite).
  const { loadPrompt, resetPromptCache } =
    require("../../runtime/agents/_prompt_loader");
  resetPromptCache();

  // Requiring each role triggers loadPrompt("<role>_v2") at module-load; if v2 were
  // absent the require would throw and this helper would surface FAILED.
  const architectRole  = require("../../runtime/agents/roles/architect_role");
  const specWriterRole = require("../../runtime/agents/roles/spec_writer_role");

  const architect_v2 = loadPrompt("architect_v2");
  const spec_writer_v2 = loadPrompt("spec_writer_v2");

  const architect_active_prompt_id_is_v2 =
    architectRole.system_prompt_id === "architect_v2";
  const architect_loads_v2_via_loader =
    _roleSrcHasLoad("code/src/runtime/agents/roles/architect_role.js", "architect_v2");
  const architect_v2_has_anchor_tokens =
    ANCHOR_TOKENS.every((t) => architect_v2.includes(t));

  const spec_writer_active_prompt_id_is_v2 =
    specWriterRole.system_prompt_id === "spec_writer_v2";
  const spec_writer_loads_v2_via_loader =
    _roleSrcHasLoad("code/src/runtime/agents/roles/spec_writer_role.js", "spec_writer_v2");
  const spec_writer_v2_has_anchor_tokens =
    ANCHOR_TOKENS.every((t) => spec_writer_v2.includes(t));

  return {
    architect_active_prompt_id_is_v2,
    architect_loads_v2_via_loader,
    architect_v2_has_anchor_tokens,
    spec_writer_active_prompt_id_is_v2,
    spec_writer_loads_v2_via_loader,
    spec_writer_v2_has_anchor_tokens
  };
}

module.exports = { runS341RolePromptV2Generalization };
