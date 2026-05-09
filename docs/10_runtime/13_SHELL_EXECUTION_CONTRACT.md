# Shell Execution Contract — Forge PHASE-7-B

**Document Type:** Runtime Contract — AUTHORITATIVE  
**Status:** ACTIVE — PHASE-7-B  
**Decision:** DECISION-20260509-phase-7-B-shell-hardening.md  
**Layer:** L2 Tool Runtime (`code/src/runtime/tools/shell_tools.js`)

---

## 1. Purpose

This contract governs all shell command execution in Forge. It defines the three registered shell tools, the hard-deny safety list, the env allowlist, and the vision-lock integration for project-scoped execution.

---

## 2. Registered Tools

| Tool | Required Mode | Env Allowlist | Vision Lock Gate |
|---|---|---|---|
| `shell.run` | `DANGER_FULL_ACCESS` | **NOT applied** — caller accepts full `process.env` exposure | Applies only if argv references `artifacts/projects/<id>/` |
| `shell.run_in_workspace` | `WORKSPACE_WRITE` | Applied via `_buildSafeEnv` | Required — checked via `input.project_id` |
| `shell.run_with_prompt` | `PROMPT` | Applied via `_buildSafeEnv` | Applies only if argv references `artifacts/projects/<id>/` |

### Permission Layer Note

`shell.run` (DANGER_FULL_ACCESS): The env allowlist is intentionally **not** applied. The caller signals maximum risk acceptance by choosing this mode. Any secret leakage via `process.env` is the caller's responsibility.

---

## 3. Hard Deny Rules

Checked in `_hardDeny(argv)` before every `execute()` and `preview()` call. Returns `{ detail }` on deny, `null` on allow.

### 3.1 HARD_DENY_ARGV0

`argv[0]` (lowercased) must not be any of:

```
rm  rmdir  del  format  mkfs  dd
sudo  su  doas  pkexec
```

Reason: privilege escalation and destructive filesystem operations are unconditionally blocked regardless of permission mode.

### 3.2 HARD_DENY_PATTERNS

Applied to the lowercased argv join (`argv.join(" ")`):

| Pattern | Blocks |
|---|---|
| `/chmod\s+(777\|-R\s)/` | `chmod 777` and `chmod -R <anything>` |
| `/chown\s+(-R\s)?[^ ]+\s+[^ ]+/` | `chown` with owner and target arguments |
| `/curl\s+.*\|\s*(ba)?sh/` | `curl <url> \| bash` and `curl <url> \| sh` |
| `/wget\s+.*\|\s*(ba)?sh/` | `wget <url> \| bash` and `wget <url> \| sh` |

### 3.3 Remote-Fetch Substitution (argv0-gated)

The pattern `/\$\(\s*(curl\|wget)\s/` is only checked when `argv[0]` is `sh` or `bash`.  
This avoids false positives on `$(date)`, `$(pwd)`, and similar benign substitutions.

---

## 4. Env Allowlist (`_buildSafeEnv`)

Applied to `shell.run_in_workspace` and `shell.run_with_prompt` before every spawn.

**Safe key set (passed through):**
```
PATH, Path, HOME, USERPROFILE, USER, USERNAME, LOGNAME,
SHELL, LANG, LC_ALL, TMPDIR, TMP, TEMP, PWD, OLDPWD,
TERM, COLORTERM, PATHEXT, SystemRoot, COMPUTERNAME
```

**Deny patterns (filtered out regardless of safe key match):**
```
OPENAI_*  AWS_*  ANTHROPIC_*  AZURE_*  GCP_*  GOOGLE_*
*_TOKEN   *_SECRET  *_KEY  *_PASSWORD  *_PASS  *_CREDENTIAL*
DATABASE_URL  DB_*
```

Caller-supplied `input.env` overrides are also filtered through deny patterns before being merged into the subprocess env.

---

## 5. Vision Lock Gate (L3 — Step 1.6)

`shell_vision_lock_rule.js` fires in `permissionPolicy.authorize()` at Step 1.6 (after vision_lock_rule at 1.5, before scope check) for all three shell tools.

```
shell.run_in_workspace → use input.project_id directly
shell.run / shell.run_with_prompt → scan argv for artifacts/projects/<id>/ path
  if no project path found → pass (not project-scoped)

readVisionSync(projectId):
  null         → DENY: VISION_NOT_FOUND
  locked=false → DENY: VISION_NOT_LOCKED
  locked=true  → pass
```

---

## 6. Permission Layers Summary

| Step | Rule | Applies To |
|---|---|---|
| 1.0 | Hard deny (system paths) | All tools |
| 1.5 | Vision lock (docs write gate) | `fs.write_file` |
| 1.6 | Shell vision lock (project shell gate) | `shell.run`, `shell.run_in_workspace`, `shell.run_with_prompt` |
| 2–4 | Mode + scope check | All tools |

---

## 7. Doctor Check

`shell_hardening` (registered in `code/src/runtime/doctor/_registry.js`):
- Verifies `shell.run_with_prompt` exists in the tool registry
- Verifies `sudo` and `su` are in `HARD_DENY_ARGV0`
- Verifies `shell_vision_lock_rule` is loadable

---

**END OF CONTRACT**
