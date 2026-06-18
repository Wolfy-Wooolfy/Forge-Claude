# PHASE-36 §4 (PROMPT-E) — C3 MID-CHECKPOINT

**Date:** 2026-06-18
**Scope of this step:** C3 ONLY (PROMPT-mode boot fail-fast + active-delete enforcement + .gitignore).
C1 + C2 DONE & CTO-verified. This is the last code stage before PROMPT-F (closure).
**Status:** ⛔ BLOCKED — C3 code done & S328/S329 GREEN, but STEP B1 regresses **S259**, which
encodes a previously-ratified, owner-Gate-#10-confirmed UX behavior (DECISION-2026-06-07 D4:
"if the active project is deleted, the backend auto-reverts to default_project"). Full SU = **321/1/5**
(only S259 red). This is a governance conflict (B1 deny vs. D4 auto-revert) — STOP-AND-REPORT for CTO
decision before proceeding. See §BLOCKER below.

---

## STEP A — PROMPT-mode boot fail-fast

### The gap
If the resolved control mode is `PROMPT` there is NO respond surface wired (no `/api/permission/*`
endpoints). Every gated op would call `prompter.request()`, block for the full `DEFAULT_TIMEOUT_MS`
(~5 min), then settle DENY/"TIMEOUT" — a silent stall, not an honest failure.

### PROBE-1 finding (reported + CTO-approved before implementing)
PROBE-1 expected NO PROMPT scenarios but found **two**: `S08_permission_prompt_mode` and
`S64_container_exec_prompt_denied` (both `direct_tool`, `"permission":"PROMPT"`). They run through
`scenario_runner._runDirectTool`, which builds the policy with `active_mode:"PROMPT"` + the
`_autoDenyPrompter` (a real responder — answers DENY immediately, no stall). A naive fail-fast would
throw at `createPolicy` and break both. CTO-approved resolution: those scenarios legitimately HAVE a
responder, so the harness opts into the escape hatch.

### The fix
- [permissionPolicy.js](../../../code/src/runtime/permission/permissionPolicy.js) `createPolicy`,
  right after `active_mode` is resolved: compute `control_mode` via `resolveActiveContext(active_mode, {})`;
  if it is `"PROMPT"` AND `opts.prompt_respond_surface !== true` → **throw** a clear Error (set
  WORKSPACE_WRITE/TEST, or wire a surface + pass `{ prompt_respond_surface:true }`). Data modes and
  TEST control mode are unaffected. The runtime PROMPT branches in `authorize()` are untouched.
- [scenario_runner.js](../../../code/src/testing/scenario_runner.js) `_runDirectTool` createPolicy:
  added `prompt_respond_surface: prompter ? true : undefined` — ties the opt-in to the responder's
  presence (only PROMPT scenarios get `_autoDenyPrompter`, so it is a no-op for all others).
- **Production guard NOT weakened:** `getDefaultPolicy()` → `createPolicy()` passes no
  `prompt_respond_surface`, so a real `FORGE_PERMISSION_MODE=PROMPT` boot still fails fast.

**MID-CHECK A** (`-s S152 -s S146 -s S08 -s S64`): **4 pass / 0 fail**. S08/S64 green via the escape
hatch; S152/S146 (TEST-mode orchestration/owner-gate) green — guard never fires. No other PROMPT
scenario exists (PROBE-1), so no other policy-creation path needed the flag.

## STEP B — active-delete enforcement (TWO findings)

### Findings
1. **Dead rule with a FALSE comment:** `delete_active_project` HARD_DENY
   ([permissionRules.js](../../../code/src/runtime/permission/permissionRules.js)) had
   `applies(){return false}` and claimed the check was "delegated to project_tools.delete tool-level
   check" — but `project.delete` had NO such check.
2. **The REAL gap (severe):** the real delete path is `POST /api/projects/delete` →
   `apiServer.deleteProject` ([apiServer.js:899-919](../../../code/src/workspace/apiServer.js#L899)),
   which `reg.invoke("fs.delete_dir", …)` on the project directory with NO guard, then reset active →
   `default_project`. The `project.delete` TOOL the dead rule pointed at is used by NOTHING (PROBE-2).
   A tool-only fix would have been scenario-green / real-broken.

### The fix (B1 primary + B2 defense + B3 honesty)
- **B1 (real path):** in `apiServer.deleteProject`, AFTER the default/exists checks and BEFORE
  `fs.delete_dir`: `if (projectId === readActiveProjectId()) return { ok:false, reason:"CANNOT_DELETE_ACTIVE" };`
  (`readActiveProjectId` already in scope).
- **B2 (defense in depth):** in `project_tools.js` `project.delete`, before removing the entry:
  `if (input.id === index.active) return failed("CANNOT_DELETE_ACTIVE", "...activate another first.");`
- **B3 (honesty):** updated the `delete_active_project` rule comment to reflect reality — active-delete
  is enforced at `apiServer.deleteProject` (primary) + `project.delete` tool (defense). The rule stays
  `applies(){return false}` as an honest documentation-only marker (a blanket L3 hard-deny cannot tell
  the active project from any other; the endpoint/tool layer that reads the active id is correct). NOT
  activated.

**MID-CHECK B** (`-s S260 -s S204..S207 -s S216 -s S217 -s S27 -s S28`): **9 pass / 0 fail**. The only
existing delete scenario (S260, regr_collide) stays green — regr_collide is never active, so the guard
does not fire.

## STEP C — S328 + S329 (helper [c3_permission_test_helper.js](../../../code/src/testing/helpers/c3_permission_test_helper.js))

- **S328** (PROMPT fail-fast, pure factory): `createPolicy({active_mode:"PROMPT"})` THROWS;
  `createPolicy({active_mode:"PROMPT", prompt_respond_surface:true})` does NOT; `TEST` / `WORKSPACE_WRITE`
  do NOT. GREEN.
- **S329** (active-delete denied, REAL endpoint): boots the apiServer (direct `listen(0)`, no auth gate —
  mirrors `runS260Regression`), drives `/api/projects/{create,activate,delete}`. create A; create +
  activate B; delete B → `ok:false` / `CANNOT_DELETE_ACTIVE` and B's dir survives; delete A (inactive) →
  `ok:true` / `deleted` and A's dir gone. Drives the real endpoint, NOT the unused tool. GREEN.
- **Negative control (run + reverted):** removed the B1 endpoint guard → S329 FAILED on
  `delete_active_denied` (got false — delete succeeded) and `active_dir_survived` (got false — B's dir
  was deleted). Restored B1. Proves S329 tests the real path (same discipline as S327).

## STEP D — .gitignore (deliberate)

- **`decision_log.json` stays TRACKED** — honoring the existing §6 comment "KEEP committed:
  artifacts/llm/decision_log.json (until >1MB)". NOT added to .gitignore.
- **conversation_context.json byproducts:** added the TIGHTEST pattern
  `artifacts/projects/test_conv_*/ai_os/conversation_context.json` (in §17). `test_conv_*` projects are
  created by `scenario_runner._runConversation` (`test_conv_<id>`) — regenerable SU byproducts, not
  governance. Confirmed 4 tracked `conversation_context.json`: `test_conv_s06`, `test_conv_s11` (clear
  byproducts, matched), and `crm_t`, `test_pr` (UNCERTAIN whether fixture or byproduct → per the prompt,
  left untouched; the broader `test_*` pattern was deliberately NOT used). Adding the pattern does NOT
  untrack the already-tracked files — `git rm --cached` is a closure-stage action (PROMPT-F), not done here.

## Gates
1. `-s S328 -s S329` (+ S08/S64) → **all PASS**.
2. Full SU `--max-old-space-size=4096` → **321 pass / 1 fail / 5 skip (327 total)** — the ONE failure is
   **S259** (the B1 regression below). S08 + S64 GREEN; orchestration cluster S139/S140/S145–S156 GREEN;
   S325–S329 GREEN. Expected 322/0/5 is NOT met pending the §BLOCKER decision.
3. `forge-doctor` — pending (deferred until the S259 conflict is resolved).

---

## ⛔ BLOCKER — STEP B1 conflicts with ratified UX decision D4 (S259)

**What regressed:** `S259_projects_delete_active_reverts` ("/api/projects/delete auto-reverts
active_project.json to default_project") — an `apiserver` scenario that POSTs `/api/projects/delete` on
the **active** project (`test_apiserver_s259`) and asserts `ok:true, deleted:true` + `active_project.json`
reverts to `default_project`. STEP B1 now returns `{ok:false, reason:"CANNOT_DELETE_ACTIVE"}`, so all five
S259 assertions fail.

**Why this is a governance conflict (not a stale test):** S259 was authored by
[DECISION-2026-06-07-ux-multiselect-delete.md](../DECISION-2026-06-07-ux-multiselect-delete.md) **D4**:
*"If the active project is deleted, the backend auto-reverts to `default_project`; FE refreshes via
loadProjects()."* That decision is **CLOSED** and **owner-confirmed via Gate #10** (browser). The
multi-select-delete UX relies on it: D3 hides `default_project`, D4 handles the active project by
auto-reverting. So C3 B1's premise ("deleting the active project then silently resetting active → default
is a gap") collides head-on with a deliberate, ratified, owner-blessed feature.

**PROBE-2 miss (honest note):** PROBE-2 grepped for the `project.delete` TOOL and found no callers — true.
But S259 exercises the `/api/projects/delete` ENDPOINT on the active project, which PROBE-2 (tool-scoped)
did not surface, and MID-CHECK B's targeted set (S260 + S204–S217 + S27/S28) did not include S259. The
full suite caught it (the C1-lesson: mid-check sets must include the relevant writers).

**Options for the CTO (not actioned — awaiting decision):**
- **(1) Keep B1, supersede D4 (recommended if security is the priority).** Update S259 to assert the new
  secure behavior (`CANNOT_DELETE_ACTIVE`, active project survives, `active_project.json` unchanged), and
  AMEND DECISION-2026-06-07 D4 to record that active-delete is now refused; the FE multi-select must skip
  the active project (as it already skips `default_project` per D3) or prompt "activate another first."
  This is a behavior change to a ratified UX decision + an FE follow-up → needs explicit owner/CTO sign-off
  (beyond C3's "no scope beyond A/B/C").
- **(2) Keep D4, drop/soften B1.** Allow active-delete-with-auto-revert at the endpoint (revert B1), keep
  only the B2 tool guard (defense-in-depth for the unused tool). Then C3 STEP B's "real fix" is effectively
  dropped — the real path keeps the auto-revert. Contradicts this session's C3 framing.
- **(3) Hybrid.** Keep B1 but make `default_project` (or a sentinel) the only auto-revert path AND deny
  for non-default — i.e., refine semantics. Needs a precise rule from the CTO.

**Current tree state:** B1/B2/B3 + STEP A + STEP C + STEP D are all implemented and committed to the
working tree (no git commit). S259 is left RED on purpose so the conflict is visible. I did NOT rewrite
S259 or amend D4 unilaterally (both are ratified governance). Tell me which option and I'll finish in one
clean pass + re-run all gates.

## Files changed
- `code/src/runtime/permission/permissionPolicy.js` — STEP A fail-fast guard.
- `code/src/testing/scenario_runner.js` — STEP A test-harness opt-in.
- `code/src/workspace/apiServer.js` — STEP B1 endpoint guard.
- `code/src/runtime/tools/project_tools.js` — STEP B2 tool guard.
- `code/src/runtime/permission/permissionRules.js` — STEP B3 honest rule comment.
- `code/src/testing/helpers/c3_permission_test_helper.js` — NEW (S328/S329).
- `code/src/testing/scenarios/S328_*.json`, `S329_*.json` — NEW.
- `.gitignore` — STEP D test_conv_* byproduct pattern.
- `artifacts/decisions/_phase_36_checkpoints/stage_c3_mid.md` — THIS file.

Track A clean (no new `fs.*Sync`/`child_process`/`fetch`/`new OpenAI` in production). §ARC stays 8
(permission guard + endpoint/tool guard + scenarios; no new side-effect channel). Mock-only, $0.
NO commit, NO closure. Wait for CTO C3 verification before PROMPT-F.
