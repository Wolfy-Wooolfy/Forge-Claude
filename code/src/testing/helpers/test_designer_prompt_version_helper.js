"use strict";

// PHASE-46 W-1 meta-regression helper — S340.
// Pure file/loader inspection — no LLM calls, no real OS APIs, no side effects.
// Mirrors the S208 pattern (file-inspection meta-regression).
// Per §ARC convention, test helpers may use fs.*Sync directly (test infrastructure).
//
// Verifies the test_designer role is wired to the strengthened test_designer_v3
// prompt (assertion-name discipline), proving the role → loader → v3 chain that
// W-1 changes — NOT only a raw read of the .md:
//   (a) the role's declared system_prompt_id === "test_designer_v3";
//   (b) the role source resolves its prompt via loadPrompt("test_designer_v3")
//       (the same resolution the role uses);
//   (c) loadPrompt("test_designer_v3") (that same resolution) returns text that
//       contains all 9 canonical assertion-type names; AND
//   (d) the resolved v3 text carries the forbidden-names prohibition — anchored on
//       the stable tokens "http_status_equals" (the canonical status type) AND
//       "response_status_equals" (the invented name, which appears in v3 ONLY as a
//       forbidden example), not on free prose a benign reword could change.

const fs   = require("fs");
const path = require("path");

const ROOT = process.cwd();

// The 9 canonical L5b assertion-type names — must match harness_runner.js ASSERTION_TYPES.
const CANONICAL_ASSERTION_TYPES = [
  "http_status_equals",
  "response_body_contains_key",
  "response_body_field_equals",
  "response_body_is_array",
  "response_body_matches_schema",
  "process_exit_code_equals",
  "file_exists",
  "stdout_contains",
  "response_header_equals"
];

async function runS340TestDesignerPromptVersion() {
  // Resolve via the SAME loader path the role uses; reset first so the read
  // reflects current 18b on disk (order-independent within the suite).
  const { loadPrompt, resetPromptCache } =
    require("../../runtime/agents/_prompt_loader");
  resetPromptCache();

  // (a) role's declared active prompt id.
  // Requiring the role triggers loadPrompt("test_designer_v3") at module-load; if
  // v3 were absent the require would throw and this helper would surface FAILED.
  const role = require("../../runtime/agents/roles/test_designer_role");
  const active_prompt_id_is_v3 = role.system_prompt_id === "test_designer_v3";

  // (b) role source resolves its prompt via loadPrompt("test_designer_v3").
  let role_loads_v3_via_loader = false;
  try {
    const roleSrc = fs.readFileSync(
      path.join(ROOT, "code", "src", "runtime", "agents", "roles", "test_designer_role.js"),
      "utf8"
    );
    role_loads_v3_via_loader = roleSrc.includes('loadPrompt("test_designer_v3")');
  } catch (_e) { /* false */ }

  // (c)+(d) resolve v3 the same way the role does and inspect its content.
  const v3 = loadPrompt("test_designer_v3");
  const v3_has_all_9_canonical_names =
    CANONICAL_ASSERTION_TYPES.every((name) => v3.includes(name));
  const v3_forbids_invented_status_name =
    v3.includes("http_status_equals") && v3.includes("response_status_equals");

  return {
    active_prompt_id_is_v3,
    role_loads_v3_via_loader,
    v3_has_all_9_canonical_names,
    v3_forbids_invented_status_name
  };
}

module.exports = { runS340TestDesignerPromptVersion };
