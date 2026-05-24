# Stage 13.8-7 — Reboot Test Checklist
> **Status:** PENDING OWNER EXECUTION
> **Date:** 2026-05-24
> **Authority:** DECISION-2026-05-23T20-00-phase-13-8-frontend-auth.md §6.8
> **Purpose:** The mandatory real-world proof that PHASE-13.8 works end-to-end.
>   PHASE-13.8 does not close without a screenshot from this test.

---

## Context

This test proves three things simultaneously on a real boot:
1. The Task Scheduler starts `node start-api.js` at logon without a terminal.
2. `env_loader.js` loads `OPENAI_API_KEY` from `.env` before the API server starts.
3. The frontend auth injection works — the React app obtains a token and sends it.

All three must work together. An automated test cannot replicate this because
it cannot simulate a cold OS boot with no pre-existing environment.

---

## Pre-flight: confirm before rebooting

Run these checks in a terminal BEFORE the reboot. If any fail, resolve first.

```
:: 1. Confirm Task Scheduler entry exists
schtasks /query /tn "ForgeAI" /fo list

:: 2. Confirm .env is clean (no stale FORGE_API_PORT or FORGE_WEB_PORT)
findstr /i "FORGE_API_PORT\|FORGE_WEB_PORT" "D:\ForgeAI\.env"
:: → should return no matches

:: 3. Confirm OPENAI_API_KEY is present in .env
findstr /i "OPENAI_API_KEY" "D:\ForgeAI\.env"
:: → should return one line (key value redacted)

:: 4. Confirm forge-resurrect.bat is gone from Startup folder
dir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\forge-resurrect.bat"
:: → should return "File Not Found"
```

---

## Backup first (MANDATORY — do before any re-provision step)

> **If you have NOT already backed up `D:\ForgeAI` owner data in Stage 13.8-3,
> do it now BEFORE the reboot:**

```
xcopy "D:\ForgeAI\.env"               "D:\ForgeAI_backup\.env*" /Y
xcopy "D:\ForgeAI\artifacts\projects" "D:\ForgeAI_backup\artifacts\projects" /E /I /Y
xcopy "D:\ForgeAI\progress"           "D:\ForgeAI_backup\progress" /E /I /Y
```

**Confirm backup exists before continuing.**

---

## Reboot test steps

Execute in exact order. Do NOT open any terminal between reboot and step 3.

### Step 1 — Restart Windows
- Shut down all applications.
- Restart Windows (not shutdown → power on; use Restart).
- Wait for the desktop to fully load (taskbar visible, no spinning cursor).

### Step 2 — Touch NO terminal
- Do NOT open Command Prompt, PowerShell, or any terminal window.
- Do NOT start pm2 manually.
- Do NOT run any node command.
- The Task Scheduler should have started `node start-api.js` automatically at logon.
- Wait approximately 15 seconds after the desktop loads.

### Step 3 — Open the browser
- Open any browser (Edge, Chrome, Firefox).
- Navigate to: `http://127.0.0.1:3100`
- Expected: the Forge React workspace loads (Chat view visible).
- If the page does NOT load within 30 seconds → see "Failure diagnosis" below.

### Step 4 — Send a real chat message
- In the Chat view, type a short message:
  ```
  مرحبا، هل أنت جاهز؟
  ```
- Press Send.
- Expected: a real AI response appears in the chat (not an error, not "Unauthorized").
- Wait up to 30 seconds for the response.

### Step 5 — Take a screenshot
- Take a full-page screenshot showing:
  - The browser URL bar (must show `http://127.0.0.1:3100`)
  - The chat message you sent
  - The real AI response
- Save the screenshot.

### Step 6 — Report to CTO
- Share the screenshot in the chat.
- State: "Stage 13.8-7 PASS" or "Stage 13.8-7 FAIL — [what happened]".

---

## Success criteria

| Criterion | Required |
|---|---|
| Browser reaches `http://127.0.0.1:3100` without manual startup | ✅ |
| React workspace shell loads (no 404, no 401) | ✅ |
| Chat message sent without 401/403 error | ✅ |
| Real AI response received (not empty, not an error) | ✅ |
| Screenshot provided showing all of the above | ✅ |

**ALL five must be true.** Partial success is not closure.

---

## Failure diagnosis

### Browser shows "This site can't be reached"
The Task Scheduler entry did not fire or the server crashed on start.

```
:: Check Task Scheduler last run result
schtasks /query /tn "ForgeAI" /fo list /v | findstr /i "last run\|result"

:: Check if node is running
tasklist | findstr node.exe

:: Check the pm2 log (if using pm2 path)
pm2 logs --lines 50
```

If Task Scheduler result is not 0x0: re-run `scripts\service\windows_task_scheduler_install.bat`
as Administrator and retry.

### Browser shows "Unauthorized" on the chat page
The token injection did not work. Check:

```
:: Verify the server IS running and listening
curl -s http://127.0.0.1:3100/ | findstr "__FORGE_TOKEN__"
:: → should return a line with the token
```

If `__FORGE_TOKEN__` is absent: the server started but `_activeToken` is null,
meaning `start()` was not called. This would indicate a regression — STOP-AND-REPORT.

### Chat sends but gets "Error" or no AI response
`OPENAI_API_KEY` did not load. Verify:

```
:: Open a new terminal AFTER the reboot and check
node -e "console.log(process.env.OPENAI_API_KEY ? 'KEY_SET' : 'MISSING')"
```

Note: this checks the terminal's environment, not the server's. The server loaded its
own env from `.env` at startup. Check server logs:

```
pm2 logs forge --lines 20
```

Look for: `[env_loader] OPENAI_API_KEY loaded` or any OpenAI error.

---

## After successful test

1. Share the screenshot with the CTO in chat: "Stage 13.8-7 PASS — screenshot attached."
2. The CTO will:
   - Update `DECISION-2026-05-24T10-30-phase-13-8-closure.md` status from DRAFT → CLOSED
   - Update `progress/status.json` `phase_13_8.reboot_test` with result + date
   - Record PHASE-13.8 as fully closed

---

**This checklist is handed to the CTO for owner execution.**
**PHASE-13.8 does not close until the owner provides the screenshot.**
