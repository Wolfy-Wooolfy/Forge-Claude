# DECISION-20260509-phase-7-B-shell-hardening

**Date:** 2026-05-09  
**Owner:** KhElmasry  
**Status:** OWNER_APPROVED — 2026-05-09  
**Track:** TRACK-B (Shell Hardening — second phase)

---

## 1. Context

PHASE-7-A delivered the Vision Authority System (CLOSED, 35/35 PASS).  
PHASE-7-B hardens the existing shell execution layer (shell.run + shell.run_in_workspace,  
present since PHASE-2). This is HARDENING + INTEGRATION, not a build-from-scratch.

Pre-flight confirmed three gaps in current shell_tools.js (186 lines):
- **Gap 1:** No env allowlist — subprocess inherits full `process.env` including secrets
- **Gap 2:** HARD_DENY_ARGV0 covers only destructive fs commands; missing privilege-escalation and pipe-injection patterns
- **Gap 3:** No PROMPT-mode shell tool; callers must use DANGER_FULL_ACCESS or WORKSPACE_WRITE
- **Gap 4:** No L3 rule gating shell commands to project dirs by vision lock

---

## 2. What Will Be Built

### F1 — shell_vision_lock_rule.js (L3 Rule)

New file: `code/src/runtime/permission/rules/shell_vision_lock_rule.js`

Fires in `permissionPolicy.authorize()` at Step 1.6 (after vision_lock_rule at 1.5, before scope check) for `shell.run` and `shell.run_in_workspace`.

Logic:
```
if tool.name not in ["shell.run", "shell.run_in_workspace"] → pass
if tool.name == "shell.run_in_workspace" → use input.project_id directly
if tool.name == "shell.run" → scan input.argv for ".../artifacts/projects/<id>/..." path arg → extract <id>
  if no project_id found → pass (generic shell, not project-scoped)
readVisionSync(projectId):
  null         → DENY: VISION_NOT_FOUND
  locked=false → DENY: VISION_NOT_LOCKED
  locked=true  → pass
```

### F2 — shell.run_with_prompt (New L2 Tool)

New tool in `code/src/runtime/tools/shell_tools.js`:
- `name: "shell.run_with_prompt"`
- `required_mode: "PROMPT"` (requires interactive approval per invocation)
- Same input/output schema as `shell.run`
- Applies env allowlist (see F3) before spawn
- Applies full hard-deny list (see F4) before spawn
- `cwd` defaults to `process.cwd()` (no project scoping)

### F3 — Env Allowlist

Applied inside `shell.run_with_prompt` spawn, and added as a filter to `shell.run_in_workspace`.

```js
const ENV_SAFE_KEYS = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL",
  "LANG", "LC_ALL", "TMPDIR", "TMP", "TEMP",
  "PWD", "OLDPWD", "TERM", "COLORTERM"
]);

const ENV_DENY_PATTERNS = [
  /^OPENAI_/i,
  /^AWS_/i,
  /^ANTHROPIC_/i,
  /^AZURE_/i,
  /^GCP_/i,
  /^GOOGLE_/i,
  /_TOKEN$/i,
  /_SECRET$/i,
  /_KEY$/i,
  /_PASSWORD$/i,
  /_PASS$/i,
  /_CREDENTIAL/i,
  /^DATABASE_URL$/i,
  /^DB_/i
];

function _buildSafeEnv(overrides) {
  const base = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (ENV_SAFE_KEYS.has(k)) base[k] = v;
    if (ENV_DENY_PATTERNS.some(p => p.test(k))) continue;
    // keys already added via ENV_SAFE_KEYS check above
  }
  // merge caller-supplied overrides (also filtered)
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (ENV_DENY_PATTERNS.some(p => p.test(k))) continue;
      base[k] = v;
    }
  }
  return base;
}
```

`shell.run` (DANGER_FULL_ACCESS) keeps current behavior (unfiltered env) — its mode already signals danger. `shell.run_in_workspace` and `shell.run_with_prompt` use `_buildSafeEnv`.

### F4 — Hard-Deny Extensions

Extend `HARD_DENY_ARGV0` and add `HARD_DENY_PATTERNS` for command strings:

New additions to `HARD_DENY_ARGV0`:
```js
["rm", "rmdir", "del", "format", "mkfs", "dd",
 "sudo", "su", "doas", "pkexec"]
```

New `HARD_DENY_PATTERNS` (checked against full argv join, lower-cased):
```js
const HARD_DENY_PATTERNS = [
  /chmod\s+(777|-R\s)/,          // chmod 777 or chmod -R anything
  /chown\s+(-R\s)?[^ ]+\s+[^ ]+/, // chown with target
  /curl\s+.*\|\s*(ba)?sh/,        // curl | bash/sh
  /wget\s+.*\|\s*(ba)?sh/,        // wget | bash/sh
  /\$\(.*\)/,                     // command substitution in argv string
];
```

`_hardDeny(argv)` updated to check both lists.

### F5 — Doctor Check + Contract Doc

New doctor check `shell_hardening` in `code/src/runtime/doctor/checks/`:
- Verifies `shell.run_with_prompt` exists in registry
- Verifies `shell_vision_lock_rule` registered in permissionPolicy
- Verifies `HARD_DENY_ARGV0` includes `sudo` and `su`

New doc: `docs/10_runtime/13_SHELL_EXECUTION_CONTRACT.md` (authoritative spec)

### F6 — Scenarios S36–S41

Written before F1–F4 per §11.5 Test-First discipline.

| ID | Type | What it tests |
|---|---|---|
| S36 | direct_tool | shell.run_in_workspace → DENIED/VISION_NOT_LOCKED when vision not locked |
| S37 | direct_tool | shell.run_in_workspace → SUCCESS when vision locked |
| S38 | direct_tool | shell.run_with_prompt (TEST mode) → DENIED/HARD_DENY for `sudo` |
| S39 | direct_tool | shell.run_with_prompt (TEST mode) → env allowlist strips OPENAI_API_KEY |
| S40 | direct_tool | shell.run_with_prompt (TEST mode) → DENIED/HARD_DENY for chmod 777 pattern |
| S41 | direct_tool | shell.run (DANGER_FULL_ACCESS) → chmod 777 still HARD_DENY (patterns apply to all tools) |

Each scenario: ≥4 assertions.

---

## 3. Files to Create

| File | Description |
|---|---|
| `code/src/runtime/permission/rules/shell_vision_lock_rule.js` | L3 deny rule |
| `code/src/runtime/doctor/checks/shell_hardening.js` | Doctor check |
| `code/src/testing/scenarios/S36.json` | Vision-not-locked shell deny |
| `code/src/testing/scenarios/S37.json` | Vision-locked shell allow |
| `code/src/testing/scenarios/S38.json` | sudo hard-deny |
| `code/src/testing/scenarios/S39.json` | Env allowlist strips secret |
| `code/src/testing/scenarios/S40.json` | chmod 777 hard-deny |
| `code/src/testing/scenarios/S41.json` | chmod 777 hard-deny on shell.run |
| `docs/10_runtime/13_SHELL_EXECUTION_CONTRACT.md` | Authoritative spec |
| `artifacts/decisions/PHASE-7-B-exit-report.md` | Exit report (written at close) |

---

## 4. Files to Modify

| File | Change |
|---|---|
| `code/src/runtime/tools/shell_tools.js` | Add `shell.run_with_prompt` + `_buildSafeEnv` + extended HARD_DENY + apply safe env to `shell.run_in_workspace` |
| `code/src/runtime/permission/permissionPolicy.js` | Register shell_vision_lock_rule at Step 1.6 |
| `code/src/runtime/doctor/doctor.js` | Add shell_hardening check |
| `verify/smoke/test_tool_runtime.js` | Update tool count 24 → 25 |
| `verify/smoke/test_harness_meta.js` | Update scenario counts 35 → 41, IDs S01–S41 |
| `progress/status.json` | Update to PHASE-7-B-CLOSED at close |

---

## 5. Constraints

- Zero direct `fs.*` in shell_vision_lock_rule.js — uses `readVisionSync` (L3 hot-path exception, same as vision_lock_rule)
- `shell.run` (DANGER_FULL_ACCESS) keeps unfiltered env — caller accepted the risk by using DANGER_FULL_ACCESS
- `shell.run_in_workspace` switches from `Object.assign({}, process.env, input.env)` to `_buildSafeEnv(input.env)`
- No new npm dependencies
- S36–S41 written before F1–F4 code (Test-First)

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | 41/41 PASS (S01–S41) |
| 2 | S36–S41 each ≥4 assertions, all PASS |
| 3 | Zero direct `fs.*` in shell_vision_lock_rule.js |
| 4 | `shell.run_with_prompt` registered (total tools: 25) |
| 5 | shell_vision_lock_rule registered in permissionPolicy |
| 6 | `sudo`/`su`/`doas`/`pkexec` in HARD_DENY_ARGV0 |
| 7 | HARD_DENY_PATTERNS covers chmod 777, chown, curl\|bash, wget\|bash |
| 8 | Env allowlist applied in shell.run_in_workspace + shell.run_with_prompt |
| 9 | Doctor check `shell_hardening` registered and PASS |
| 10 | All 5 smoke suites PASS with explicit exit codes |
| 11 | S01–S35 all PASS (backwards compat) |
| 12 | Protected layers untouched (apiServer.js, providers/) |
| 13 | `docs/10_runtime/13_SHELL_EXECUTION_CONTRACT.md` created |

---

## Status: OWNER_APPROVED — PHASE-7-B CLOSED
