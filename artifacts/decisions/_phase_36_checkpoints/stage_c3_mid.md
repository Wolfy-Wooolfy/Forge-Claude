# PHASE-36 §4 — C3 MID-CHECKPOINT (corrected by PROMPT-F)

**Date:** 2026-06-18
**Corrected scope of C3:** PROMPT-mode boot fail-fast (STEP A) + honest dead-rule comment (B3) +
.gitignore housekeeping (STEP D). C1 + C2 DONE & CTO-verified.
**Status:** ✅ GREEN — full SU **321 / 0 / 5 (326 total)**; doctor §ARC=8, L2=80, roles=13, doctor=35.
Awaiting CTO C3 verification before PROMPT-G (closure).

---

## §-1 — RETRACTION (CTO, PROMPT-F) — active-delete "gap" finding WITHDRAWN

The STEP-B expansion (PROMPT-E) claimed `apiServer.deleteProject` deleting the active project was a
"security gap" and directed adding a `CANNOT_DELETE_ACTIVE` guard (B1 endpoint + B2 tool). **The CTO has
formally retracted that finding.** It was an incorrect inference from the dead rule's misleading comment +
the endpoint behavior, made WITHOUT checking governance.

[DECISION-2026-06-07-ux-multiselect-delete.md](../DECISION-2026-06-07-ux-multiselect-delete.md) is CLOSED
and owner-confirmed via Gate #10: **D4** — *"If the active project is deleted, the backend auto-reverts to
default_project"* — a deliberate, ratified part of the multi-select-delete UX (with the required
confirmation dialog, D2). So active-delete is **intended behavior, not a gap**, and the
`delete_active_project` hard-deny rule is dead **on purpose** because D4 overrode it. **S259 encodes D4 and
is correct.** The STOP per CLAUDE.md §8 (two artifacts conflict → halt, ask) was the right call. **We honor
D4.**

**Reverted in PROMPT-F:** B1 (apiServer endpoint guard) — removed; B2 (project.delete tool guard) —
removed; S329 (active-delete-denied scenario) + its helper branch — deleted. **Corrected:** B3 comment now
states reality (active-delete intentionally ALLOWED per D4). **Kept (no governance conflict):** STEP A
(PROMPT fail-fast + S328) and STEP D (.gitignore). Working tree `apiServer.js` and `project_tools.js` are
byte-exact to their pre-B1/B2 originals (`git diff HEAD` shows only the guard removal).

> The STEP-B section below (struck through) is **RETAINED for the audit trail** — it records the error and
> its correction, per PROMPT-F §6. It is NO LONGER in effect.

---

## STEP A — PROMPT-mode boot fail-fast  ✅ KEPT (no conflict)

### The gap
If the resolved control mode is `PROMPT` there is NO respond surface wired (no `/api/permission/*`
endpoints). Every gated op would call `prompter.request()`, block for the full `DEFAULT_TIMEOUT_MS`
(~5 min), then settle DENY/"TIMEOUT" — a silent stall, not an honest failure.

### PROBE-1 finding (reported + CTO-approved before implementing)
PROBE-1 expected NO PROMPT scenarios but found **two**: `S08_permission_prompt_mode` and
`S64_container_exec_prompt_denied` (both `direct_tool`, `"permission":"PROMPT"`). They run through
`scenario_runner._runDirectTool`, which builds the policy with `active_mode:"PROMPT"` + the
`_autoDenyPrompter` (a real responder — answers DENY immediately, no stall). A naive fail-fast would throw
at `createPolicy` and break both. CTO-approved resolution: those scenarios legitimately HAVE a responder,
so the harness opts into the escape hatch.

### The fix
- [permissionPolicy.js](../../../code/src/runtime/permission/permissionPolicy.js) `createPolicy`,
  right after `active_mode` is resolved: compute `control_mode` via `resolveActiveContext(active_mode, {})`;
  if it is `"PROMPT"` AND `opts.prompt_respond_surface !== true` → **throw** a clear Error. Data modes and
  TEST control mode are unaffected. The runtime PROMPT branches in `authorize()` are untouched.
- [scenario_runner.js](../../../code/src/testing/scenario_runner.js) `_runDirectTool` createPolicy:
  added `prompt_respond_surface: prompter ? true : undefined` — ties the opt-in to the responder's presence
  (only PROMPT scenarios get `_autoDenyPrompter`, so it is a no-op for all others).
- **Production guard NOT weakened:** `getDefaultPolicy()` → `createPolicy()` passes no
  `prompt_respond_surface`, so a real `FORGE_PERMISSION_MODE=PROMPT` boot still fails fast.

**MID-CHECK A** (`-s S152 -s S146 -s S08 -s S64`): **4 pass / 0 fail**. S08/S64 green via the escape hatch;
S152/S146 (TEST-mode orchestration/owner-gate) green — guard never fires.

## ~~STEP B — active-delete enforcement~~  🚫 RETRACTED (PROMPT-F) — see §-1

> ~~**Findings:** (1) dead `delete_active_project` rule with a false "delegated to tool-level check"~~
> ~~comment; (2) "the REAL gap" — `apiServer.deleteProject` deletes the active project's directory with no~~
> ~~guard then resets active → default_project.~~
> ~~**Fix (B1 endpoint guard + B2 tool guard + B3 comment).** MID-CHECK B ran S260 + apiserver scenarios~~
> ~~(9/9) — but did NOT include S259, which the full suite then caught.~~
>
> **WHY RETRACTED:** finding (2) is not a gap — it is ratified behavior D4 (owner Gate-#10 confirmed),
> encoded by S259. B1 + B2 contradicted D4 and were reverted. Finding (1) is true *but* the rule is dead
> ON PURPOSE (D4 overrode it) — see the corrected B3 below.

### B3 (corrected) — honest dead-rule comment  ✅ KEPT
[permissionRules.js](../../../code/src/runtime/permission/permissionRules.js) `delete_active_project`:
comment now states reality — active-project deletion is intentionally ALLOWED (backend auto-reverts to
`default_project`) per DECISION-2026-06-07 (D4, owner Gate-#10); the marker is retained for the audit trail
only; `applies(){return false}` stays; `detail` no longer claims enforcement. NOT activated (activating it
would contradict D4).

## STEP C — S328 only (S329 REMOVED)

- **S328** (PROMPT fail-fast, pure factory, [c3_permission_test_helper.js](../../../code/src/testing/helpers/c3_permission_test_helper.js)):
  `createPolicy({active_mode:"PROMPT"})` THROWS; `createPolicy({active_mode:"PROMPT", prompt_respond_surface:true})`
  does NOT; `TEST` / `WORKSPACE_WRITE` do NOT. GREEN.
- ~~**S329** (active-delete denied, REAL endpoint)~~ — **DELETED in PROMPT-F** (scenario file removed; the
  S329 branch + the http/boot code removed from the helper, S328 branch kept). D4's behavior is already
  covered by S259 — no active-delete scenario is wanted.

## STEP D — .gitignore (deliberate)  ✅ KEPT

- **`decision_log.json` stays TRACKED** — honoring the existing §6 comment "KEEP committed:
  artifacts/llm/decision_log.json (until >1MB)". NOT added to .gitignore.
- **conversation_context.json byproducts:** added the TIGHTEST pattern
  `artifacts/projects/test_conv_*/ai_os/conversation_context.json` (in §17). `test_conv_*` projects are
  created by `scenario_runner._runConversation` (`test_conv_<id>`) — regenerable SU byproducts, not
  governance. Confirmed 4 tracked `conversation_context.json`: `test_conv_s06`, `test_conv_s11` (matched),
  and `crm_t`, `test_pr` (UNCERTAIN → left untouched; the broader `test_*` pattern was deliberately NOT
  used). Adding the pattern does NOT untrack already-tracked files — `git rm --cached` is a closure-stage
  action (PROMPT-G), not done here.

## Gates (PROMPT-F, post-revert)
1. `-s S259 -s S328 -s S08 -s S64` → **4 pass / 0 fail**. S259 GREEN (D4 honored); S328 GREEN (PROMPT
   fail-fast intact); S08/S64 GREEN (harness opt-in intact).
2. Full SU `--max-old-space-size=4096` → **321 pass / 0 fail / 5 skip (326 total** = prior 325 + S328, with
   S329 removed**)**. Orchestration cluster S139/S140/S145–S156 GREEN (14/14). S325–S328 GREEN.
3. `forge-doctor` → exit 0; **§ARC=8, L2(tools)=80, roles=13, doctor=35**; HEALTHY (0 critical, 6 pre-existing
   WARN incl. the Windows keychain here-string).

## Net source changes (after the PROMPT-F revert)
- `code/src/runtime/permission/permissionPolicy.js` — STEP A fail-fast guard.  **(net new)**
- `code/src/testing/scenario_runner.js` — STEP A test-harness opt-in.  **(net new)**
- `code/src/runtime/permission/permissionRules.js` — B3 honest dead-rule comment.  **(net new)**
- `code/src/testing/helpers/c3_permission_test_helper.js` — NEW (S328 only).
- `code/src/testing/scenarios/S328_*.json` — NEW.
- `.gitignore` — STEP D test_conv_* byproduct pattern.
- `code/src/workspace/apiServer.js` — **REVERTED to original** (B1 removed; `git diff HEAD` = only the guard removal).
- `code/src/runtime/tools/project_tools.js` — **REVERTED to original** (B2 removed).
- `code/src/testing/scenarios/S329_*.json` — **DELETED**.

**Git note (transparency):** the harness auto-commits intermediate snapshots labeled "U"; the PROMPT-E B1/B2
additions were auto-committed into HEAD, so `git diff HEAD` for apiServer.js/project_tools.js now shows the
PROMPT-F removals. The WORKING TREE (what tests run against and what closure will commit) is the correct
final state. I never ran `git commit`. Runtime byproducts also dirty the tree (decision_log.json, the two
test_conv conversation_context.json, status.json from doctor's auto-update) — telemetry, not source.

Track A clean (no new `fs.*Sync`/`child_process`/`fetch`/`new OpenAI` in production — the STEP A guard only
throws). §ARC stays 8 (one permission guard + scenarios; no new side-effect channel). Mock-only, $0.
NO commit, NO closure. Wait for CTO C3 verification before PROMPT-G.
