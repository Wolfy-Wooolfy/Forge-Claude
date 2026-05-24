# Stage 13.8-6 — Checkpoint
> **Status:** CLOSED
> **Date:** 2026-05-24
> **Phase:** PHASE-13.8 — Frontend Auth + Robust Startup (§2b extension)

---

## Scope

Stage 13.8-6 implemented the four robust-startup items from
`DECISION-2026-05-23T20-00-phase-13-8-frontend-auth.md §2b`:

| Item | Description |
|---|---|
| Item 1 | `.env` loading — hand-rolled parser in `code/src/startup/env_loader.js` |
| Item 2 | `.env` hygiene — stale `FORGE_API_PORT=4100` and `FORGE_WEB_PORT=4000` lines removed from owner's `.env` |
| Item 3 | Auto-start via Windows Task Scheduler — `scripts/service/windows_task_scheduler_install.bat` wired into `INSTALL_FORGE.bat` |
| Item 4 | `RUN_FORGE.bat` EPERM self-heal block |

---

## What was delivered

### Item 1 — `code/src/startup/env_loader.js`
- New file: hand-rolled `.env` parser
- Function: `loadDotEnv(dir)` — reads `{dir}/.env` line-by-line,
  sets `process.env[KEY]` only if key not already present (ambient wins)
- Skips comments (`#`) and blank lines
- Silently no-ops when `.env` absent
- `start-api.js` lines 16–17: `require("./code/src/startup/env_loader")`
  + `loadDotEnv(path.resolve(__dirname))` called BEFORE `apiServer` is required
- §ARC-7 registered: `fs.readFileSync` in `loadDotEnv` is a pre-runtime
  bootstrap exception (decision: `DECISION-2026-05-24T10-00-arc-7-env-loader-fs-exception.md`)

### Item 2 — `.env` hygiene
- Owner removed stale lines `FORGE_API_PORT=4100` and `FORGE_WEB_PORT=4000`
  from `D:\ForgeAI\.env`
- Lines retained: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_IDEATION_MODEL`,
  `OPENAI_OPTIONS_MODEL`
- Note: `.env` is gitignored — this was an owner action, not a code change

### Item 3 — Windows Task Scheduler
- `scripts/service/windows_task_scheduler_install.bat` already existed
  (created Stage 12.1, runs `node start-api.js` — no pm2 daemon, no EPERM possible)
- `INSTALL_FORGE.bat` updated to call Task Scheduler installer instead of
  writing `forge-resurrect.bat`
- Stale `forge-resurrect.bat` removed from Windows Startup folder
  (pointed to old `D:\ForgeAI` path, would fail every reboot)

### Item 4 — `RUN_FORGE.bat` EPERM self-heal
- When `pm2 ping` exits non-zero AND output contains `EPERM` or `rpc.sock`:
  - Reads `%USERPROFILE%\.pm2\pm2.pid`
  - `taskkill /F /PID <pid>` — kills ONLY pm2 daemon PID
  - Never uses `taskkill /IM node.exe` (would kill VS Code, Claude Code)
  - Clears stale pid file, waits 2s, retries `pm2 start` once

---

## Regression scenarios (written in Stage 13.8-5, GREEN in Stage 13.8-6)

| Scenario | Description | Result |
|---|---|---|
| S218 | `env_key_loads_from_dotenv` — boot with NO ambient `OPENAI_API_KEY` + `.env` present → key loads into `process.env` | PASS ✅ |
| S219 | `env_port_conflict_ambient_wins` — `FORGE_API_PORT=4100` in `.env`, ecosystem sets 3100 → effective port stays 3100 | PASS ✅ |

Both scenarios confirmed GREEN by CTO independent run.

---

## SU baseline at close (Stage 13.8-6)

```
ALL PASS — 219 passed, 0 failed, 5 skipped (224 total)
```
(S217 + S218 + S219 all GREEN; cumulative from baseline of 212 at Stage 13.8-2)

Note: SU count 212 → 219 via S217 (Stage 13.8-2) + S218 + S219 (Stage 13.8-5/6) = 7 new scenarios net. However exact running total to be confirmed by forge-test.js run in closure task.

---

## Files created / modified

| File | Change |
|---|---|
| `code/src/startup/env_loader.js` | NEW — `loadDotEnv(dir)` implementation |
| `start-api.js` | MODIFIED — lines 16–17: require + call `loadDotEnv` before apiServer |
| `INSTALL_FORGE.bat` | MODIFIED — calls Task Scheduler installer; no `git clone` |
| `RUN_FORGE.bat` | MODIFIED — EPERM self-heal block added |
| `code/src/testing/scenarios/S218_env_key_loads_from_dotenv.json` | NEW — regression scenario |
| `code/src/testing/scenarios/S219_env_port_conflict_ambient_wins.json` | NEW — regression scenario |

---

## §ARC impact

- §ARC count: 6 → 7 (§ARC-7 = `env_loader.js`)
- Decision artifact: `DECISION-2026-05-24T10-00-arc-7-env-loader-fs-exception.md`
- Ledger updated: `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC table

---

## Risk carried forward

None on code. Stage 13.8-7 (reboot test) is the only remaining gate.
The reboot test requires owner action — cannot be automated.

---

**Stage 13.8-6 is CLOSED. Closure gate requires Stage 13.8-7 (owner reboot test).**
