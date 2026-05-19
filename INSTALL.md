# Forge — Installation & Production Setup Guide

> **Authority:** This guide implements `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md`
> and reflects decisions D1-D5 ratified in
> `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md`.
>
> For development setup only, follow §Prerequisites + §Quick Start and stop there.
> The remaining sections (§Windows Service through §Troubleshooting) cover
> **production deployment** on a personal machine.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start](#2-quick-start)
3. [Windows Service Setup](#3-windows-service-setup)
4. [Linux systemd Setup](#4-linux-systemd-setup)
5. [macOS launchd Setup](#5-macos-launchd-setup)
6. [Secret Storage](#6-secret-storage)
7. [Backup](#7-backup)
8. [Monitoring](#8-monitoring)
9. [Security](#9-security)
10. [Upgrading](#10-upgrading)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

### Node.js

- **Node.js:** 20.0.0 or higher (LTS recommended — `node --version` must show `v20.x` or above)
- **npm:** Bundled with Node.js (no separate version requirement)
- Download: https://nodejs.org/en/download (use the LTS installer)

### Git

- Any recent version of Git (2.x or later)

### Platform Notes

| Platform | Notes |
|---|---|
| **Windows 10/11** | Tier-1 primary for production. PowerShell 5.1+ required for secret storage and service setup. Run service scripts as Administrator. |
| **Linux** | Tier-1 (ship + review). systemd-based distributions (Ubuntu 20.04+, Debian 11+, Fedora 36+, RHEL 8+). |
| **macOS** | Tier-1 (ship + review). macOS 12 (Monterey) or later recommended. Node.js via Homebrew or official installer. |

### Required Environment Variables

No `.env.example` is provided. Configure these variables before starting Forge:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | **Yes** | OpenAI API key — used by all LLM providers |
| `ANTHROPIC_API_KEY` | No | Anthropic Claude API key (for Anthropic adapter) |
| `TAVILY_API_KEY` | No | Tavily API key (for web research / KB ingestion) |
| `FORGE_API_PORT` | No | API server port (default: `3100`) |
| `FORGE_BIND_HOST` | No | Bind address (default: `127.0.0.1` — see §Security) |
| `FORGE_PERMISSION_MODE` | No | Permission mode (default: `WORKSPACE_WRITE`) |
| `FORGE_ALERT_WEBHOOK_URL` | No | Webhook URL for alerts (default: disabled — see §Monitoring) |
| `FORGE_BACKUP_EXCLUDE` | No | Additional backup exclusions, comma-separated glob patterns |

Set variables in your shell profile or in a `.env` file at the repo root:

```bash
# .env (create at repo root — chmod 600 on Linux/macOS, see §Security)
OPENAI_API_KEY=sk-...
```

> **Security note:** See §Secret Storage for moving API keys out of plaintext `.env`
> files into your OS keychain — the recommended production approach.

---

## 2. Quick Start

### Step 1 — Clone and install

```bash
git clone <your-forge-repo-url> forge
cd forge
npm install
```

### Step 2 — Set your OpenAI API key

**Windows (PowerShell):**

```powershell
$env:OPENAI_API_KEY = "sk-..."
```

**Linux / macOS (bash/zsh):**

```bash
export OPENAI_API_KEY="sk-..."
```

Or add to `.env` at the repo root (plaintext — see §Secret Storage to migrate to keychain).

### Step 3 — Verify the installation

```bash
node bin/forge-doctor.js
```

Expected output (all checks PASS or WARN, none FAIL):

```json
{
  "ok": true,
  "summary": "34 checks: 26 PASS, 8 WARN, 0 FAIL",
  "checks": [
    { "id": "node_version",      "status": "PASS", "detail": "v20.x.x" },
    { "id": "openai_api_key",    "status": "PASS", "detail": "set, length=51" },
    { "id": "status_json_valid", "status": "PASS", "detail": "ok" },
    ...
  ]
}
```

Exit code 0 = healthy. Exit code 1 = one or more FAIL checks — see §Troubleshooting.

### Step 4 — Start Forge

```bash
npm start
```

Or:

```bash
node start-api.js
```

Expected startup output:

```
[Forge] API server listening on http://127.0.0.1:3100
[Forge] Doctor: all checks PASS
```

### Step 5 — Run the scenario suite (optional but recommended)

```bash
node bin/forge-test.js
```

Expected: all scenarios PASS or SKIP (none FAIL). Current baseline: 202 PASS / 5 SKIP.

---

## 3. Windows Service Setup

Running Forge as a Windows service ensures it starts automatically on boot and restarts
on crash. Two options are provided — choose one.

### Option A — NSSM (Recommended for Production)

NSSM (Non-Sucking Service Manager) provides richer crash recovery, service dependency
management, and built-in log rotation. Preferred for production use.

#### Download and Verify NSSM

> **Forge scripts never auto-download NSSM.** You must download and verify it manually.

1. Download from the official release URL:

   ```
   https://nssm.cc/release/nssm-2.24.zip
   ```

2. Verify the SHA-256 hash before extracting:

   **Verified SHA-256 (as of 2026-05-19):** `727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743`

   **Source:** `https://nssm.cc/release/nssm-2.24.zip` (200 OK, 351,793 bytes)

   > Note: nssm.cc was temporarily returning 503 on its landing page at verification
   > time (2026-05-19); the direct download URL returned 200 OK with the above hash.
   > Verify locally with the commands below to confirm your copy matches.

   Verify locally:

   ```powershell
   # Windows PowerShell
   Get-FileHash nssm-2.24.zip -Algorithm SHA256
   # Expected: 727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743
   ```

   ```bash
   # Linux / macOS
   sha256sum nssm-2.24.zip
   # Expected: 727d1e42275c605e0f04aba98095c38a8e1e46def453cdffce42869428aa6743
   ```

   If the hash does not match, **do not proceed** — discard the file and download again.

3. Extract and add `nssm.exe` to your PATH:

   ```powershell
   Expand-Archive nssm-2.24.zip -DestinationPath C:\tools\nssm-2.24
   # Add C:\tools\nssm-2.24\win64\ (or win32\ for 32-bit) to your PATH
   ```

   Or copy `nssm.exe` directly to a directory already on PATH:

   ```powershell
   Copy-Item C:\tools\nssm-2.24\win64\nssm.exe C:\Windows\System32\nssm.exe
   ```

#### Install the Forge Service

Run from an **Administrator** PowerShell or Command Prompt:

```powershell
cd <forge-repo-root>
scripts\service\windows_nssm_install.bat install
```

Expected output:

```
[INFO] Installing "forge-api" via NSSM...
[INFO] Starting "forge-api"...
[OK] forge-api service installed and started.
     Service name : forge-api
     Forge dir    : C:\path\to\forge
     Logs         : C:\path\to\forge\logs\
```

#### Service Management

```powershell
# Status
nssm status forge-api

# Stop / Start / Restart
scripts\service\windows_nssm_install.bat stop
scripts\service\windows_nssm_install.bat start
nssm restart forge-api

# Uninstall
scripts\service\windows_nssm_install.bat uninstall
```

#### Log File Location

```
<forge-root>\logs\forge.log        — INFO/WARN/ERROR (rolling 10 MB × 5 files)
<forge-root>\logs\forge.error.log  — ERROR only
```

---

### Option B — Windows Task Scheduler (Lightweight Alternative)

Task Scheduler is built into Windows and requires no third-party software. Suitable
for personal workstations where the full NSSM feature set is not needed.

**Trade-offs vs NSSM:**

- No Administrator rights required (runs as current user via LOGON_S4U)
- Simpler setup, no external binary
- Fewer configuration options (no built-in log rotation, limited restart policy)
- Restart behavior: 3 attempts with 30-second delay (not unlimited like NSSM)

#### Install the Task

```powershell
cd <forge-repo-root>
scripts\service\windows_task_scheduler_install.bat install
```

#### Task Management

```powershell
# Status
scripts\service\windows_task_scheduler_install.bat status
# Or:
schtasks /query /tn ForgeAPI /v /fo LIST

# Stop / Start
scripts\service\windows_task_scheduler_install.bat stop
scripts\service\windows_task_scheduler_install.bat start

# Uninstall
scripts\service\windows_task_scheduler_install.bat uninstall
```

---

## 4. Linux systemd Setup (Tier 1)

The systemd unit file is provided at `scripts/service/forge.service`. It is a
Tier-1 ship-and-review artifact — reviewed for correctness but not verified via
automated boot test in PHASE-12 (Windows is the Tier-1 closure target).

### Unit File

Copy the template from `scripts/service/forge.service` and substitute placeholders:

```ini
[Unit]
Description=Forge AI OS — Personal Production API Server
Documentation=file:FORGE_DIR/INSTALL.md
After=network.target
Wants=network.target

[Service]
Type=simple
User=FORGE_USER
WorkingDirectory=FORGE_DIR

ExecStart=/usr/bin/env node FORGE_DIR/start-api.js

Restart=on-failure
RestartSec=10

StandardOutput=journal
StandardError=journal
SyslogIdentifier=forge-api

Environment=NODE_ENV=production
Environment=FORGE_API_PORT=3100
# EnvironmentFile=FORGE_DIR/.env

LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

### Installation

```bash
# 1. Copy and edit the unit file
sudo cp scripts/service/forge.service /etc/systemd/system/forge-api.service
sudo nano /etc/systemd/system/forge-api.service
# Replace FORGE_DIR with the absolute path (e.g. /home/user/forge)
# Replace FORGE_USER with the OS user that owns the Forge installation

# 2. Reload systemd and enable
sudo systemctl daemon-reload
sudo systemctl enable forge-api
sudo systemctl start forge-api

# 3. Verify
sudo systemctl status forge-api
```

### Service Management

```bash
# Start / Stop / Restart
sudo systemctl start forge-api
sudo systemctl stop forge-api
sudo systemctl restart forge-api

# Status
sudo systemctl status forge-api

# View logs
journalctl -u forge-api -f          # live tail
journalctl -u forge-api --since "1 hour ago"
```

### User/Group Recommendation

Run Forge as a dedicated non-root user:

```bash
# Create a dedicated user (no login shell, no home dir needed)
sudo useradd --system --no-create-home --shell /usr/sbin/nologin forge

# Set ownership of the Forge directory
sudo chown -R forge:forge /path/to/forge
```

Then set `User=forge` and `FORGE_USER=forge` in the unit file.

---

## 5. macOS launchd Setup (Tier 1)

The launchd plist is provided at `scripts/service/com.forge.api.plist`. Tier-1
ship-and-review artifact — same status as the Linux service file.

### Plist File

The template uses `FORGE_DIR` as a placeholder. Replace it before loading:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.forge.api</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>FORGE_DIR/start-api.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>FORGE_DIR</string>

  <key>KeepAlive</key>
  <true/>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>FORGE_DIR/logs/forge.log</string>
  <key>StandardErrorPath</key>
  <string>FORGE_DIR/logs/forge.error.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>FORGE_API_PORT</key>
    <string>3100</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
```

### Installation

```bash
# 1. Copy and edit the plist
cp scripts/service/com.forge.api.plist ~/Library/LaunchAgents/com.forge.api.plist
# Replace FORGE_DIR:
sed -i '' "s|FORGE_DIR|$(pwd)|g" ~/Library/LaunchAgents/com.forge.api.plist

# 2. Load the agent
launchctl load ~/Library/LaunchAgents/com.forge.api.plist

# 3. Verify
launchctl list | grep forge
```

### Service Management

```bash
# Load (starts immediately + on each login)
launchctl load ~/Library/LaunchAgents/com.forge.api.plist

# Unload (stops immediately + disables on login)
launchctl unload ~/Library/LaunchAgents/com.forge.api.plist

# List (check status)
launchctl list com.forge.api
```

### Log File Paths

```
~/forge/logs/forge.log          — INFO/WARN/ERROR (replace ~/forge with your FORGE_DIR)
~/forge/logs/forge.error.log    — ERROR only
```

For a system-wide installation, logs go to:

```
/Library/Logs/forge/forge.log
```

---

## 6. Secret Storage

> **Full contract:** `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` §Secret Storage
>
> **Decision authority:** D2 — `DECISION-2026-05-18T11-30-phase-12-plan.md` §2 D2

Forge uses OS-native keychains to store API keys securely, avoiding plaintext `.env`
files in production. The secret provider resolves in this order:

1. **Windows Credential Manager** (`code/src/runtime/secrets/windows_credential_manager.js`)
2. **macOS Keychain** (`code/src/runtime/secrets/mac_keychain.js`)
3. **Linux Secret Service / libsecret** (`code/src/runtime/secrets/linux_secret_service.js`)
4. **Encrypted File** fallback — `~/.forge/secrets.enc` (libsodium sealed box)

**Migration note:** Existing `process.env` values continue to work. The secret provider
checks the keychain first and falls back to `process.env` if the key is absent from the
keychain. The Doctor check `secrets_in_env_var` emits a WARN (not FAIL) when
`OPENAI_API_KEY` is present in `process.env` AND your OS keychain is available —
prompting you to migrate. Existing installs are not broken.

### Example: Store `OPENAI_API_KEY` per platform

**Windows — Credential Manager:**

```powershell
# Store the key
$cred = Get-Credential -UserName "forge" -Message "Enter your OpenAI API key as the password"
cmdkey /generic:forge/OPENAI_API_KEY /user:forge /pass:$cred.GetNetworkCredential().Password

# Verify
cmdkey /list | findstr forge
```

**macOS — Keychain:**

```bash
# Store the key
security add-generic-password -s "forge" -a "OPENAI_API_KEY" -w "sk-..."

# Verify
security find-generic-password -s "forge" -a "OPENAI_API_KEY" -w
```

**Linux — Secret Service (libsecret):**

```bash
# Install libsecret-tools if not present
# Ubuntu/Debian:  sudo apt install libsecret-tools
# Fedora:         sudo dnf install libsecret

# Store the key
secret-tool store --label="Forge OpenAI Key" service forge key OPENAI_API_KEY
# (Enter the API key value when prompted)

# Verify
secret-tool lookup service forge key OPENAI_API_KEY
```

---

## 7. Backup

> **Full contract:** `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` §Backup
>
> **Decision authority:** D3 — `DECISION-2026-05-18T11-30-phase-12-plan.md` §2 D3

### What Gets Backed Up

Forge uses the `backup.create` L2 tool to produce a compressed archive at
`artifacts/backups/<timestamp>.zip`. The following are **excluded by default**:

```js
// DEFAULT_EXCLUDE (binding — from DECISION-2026-05-18T11-30-phase-12-plan.md §2 D3)
const DEFAULT_EXCLUDE = [
  'artifacts/llm/requests/**',    // full LLM prompts — PII risk
  'artifacts/llm/responses/**',   // full LLM responses — PII risk
  'artifacts/backups/**',         // prevent backup-in-backup
  '.env',
  '*.env',
  'node_modules/**'
];
// artifacts/llm/metadata/** IS included — metadata = {provider_id, model, tokens,
// latency_ms, cost_estimate} only. No PII per Blueprint Part B §L1.
```

To add additional exclusions (cannot remove defaults):

```bash
# In your shell or .env:
FORGE_BACKUP_EXCLUDE="artifacts/projects/old_project/**,logs/**"
```

### Create a Backup

```bash
# Via Node.js API (programmatic)
node -e "
const { createWorkspaceApiServer } = require('./code/src/workspace/apiServer');
// Or trigger via /api/backup/create endpoint when server is running
"
```

Via the running API server:

```bash
curl -s -H "Authorization: Bearer <token>" \
  http://127.0.0.1:3100/api/backup/create | jq .
```

Expected response:

```json
{
  "status": "ok",
  "archive": "artifacts/backups/2026-05-19T14-30-00-000Z.zip",
  "files_included": 1234,
  "size_bytes": 45678901
}
```

### Export to External Storage

The `backup.export` tool generates a platform-aware copy command for external drives
or NAS (Forge does not execute the copy itself — you run the command):

```bash
# Doctor emits a WARN if no external export in 7+ days
node bin/forge-doctor.js | grep backup
```

### Automated Nightly Backup

**Linux/macOS (cron):**

```bash
# Add to crontab (crontab -e):
# Run backup.create every night at 02:00
0 2 * * * curl -s -H "Authorization: Bearer $(cat /path/to/forge/web/.forge-session | tail -1 | python3 -c 'import sys,json; print(json.load(sys.stdin)[\"token\"])')" http://127.0.0.1:3100/api/backup/create >> /var/log/forge-backup.log 2>&1
```

**Windows (Task Scheduler):**

```powershell
# Create a daily backup task
$action = New-ScheduledTaskAction -Execute 'curl.exe' `
    -Argument '-s http://127.0.0.1:3100/api/backup/create'
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"
Register-ScheduledTask -TaskName "ForgeBackup" -Action $action -Trigger $trigger
```

### Retention Policy

The default grandfather-father-son rotation keeps:
- **7** daily backups
- **4** weekly backups
- **12** monthly backups

Older archives are automatically pruned when `backup.create` runs. This caps storage
at approximately 23 archives at any point in time.

### Restore Procedure

```bash
# 1. Identify the backup to restore
node bin/forge-doctor.js | grep backup_status

# 2. Stop Forge before restoring
# Windows:  scripts\service\windows_nssm_install.bat stop
# Linux:    sudo systemctl stop forge-api
# macOS:    launchctl unload ~/Library/LaunchAgents/com.forge.api.plist

# 3. Restore (requires DANGER_FULL_ACCESS mode — Forge prompts if needed)
# Via API (when server is running in DANGER_FULL_ACCESS mode):
curl -s -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"archive": "artifacts/backups/2026-05-19T02-00-00-000Z.zip"}' \
  http://127.0.0.1:3100/api/backup/restore | jq .

# 4. Verify after restore
node bin/forge-doctor.js
# All checks must pass before declaring restore successful
```

---

## 8. Monitoring

> **Full contract:** `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` §Monitoring
>
> **Decision authority:** D4 — `DECISION-2026-05-18T11-30-phase-12-plan.md` §2 D4

### Log Files

```
logs/forge.log        — INFO/WARN/ERROR events (rolling: 10 MB × 5 files)
logs/forge.error.log  — ERROR-only subset (same rotation policy)
```

Log format: `<ISO-timestamp> | <LEVEL> | <message> | <JSON-context>`

```
2026-05-19T14:30:01.234Z | INFO  | API server started | {"port":3100,"host":"127.0.0.1"}
2026-05-19T14:30:02.567Z | WARN  | secrets_in_env_var | {"key":"OPENAI_API_KEY"}
2026-05-19T14:31:00.000Z | ERROR | provider timeout   | {"provider":"conversational","attempt":2}
```

### Doctor Endpoint

```bash
# CLI (exit 0 = healthy, exit 1 = one or more FAIL)
node bin/forge-doctor.js

# HTTP endpoint (auth-exempt — no token required)
curl -s http://127.0.0.1:3100/api/system/doctor | jq .
```

Abbreviated response shape:

```json
{
  "ok": true,
  "summary": "34 checks: 26 PASS, 8 WARN, 0 FAIL",
  "checks": [
    { "id": "node_version",       "status": "PASS", "detail": "v20.x.x" },
    { "id": "api_server_port",    "status": "PASS", "detail": "listening on 3100" },
    { "id": "openai_api_key",     "status": "PASS", "detail": "set, length=51" },
    { "id": "backup_status",      "status": "WARN", "detail": "last backup 8 days ago" },
    { "id": "secrets_in_env_var", "status": "WARN", "detail": "OPENAI_API_KEY in env — consider migrating to keychain" }
  ]
}
```

### 24-Hour Metrics

Forge tracks a rolling 24-hour metrics window in `progress/status.json` under
`runtime_health.metrics_window_24h`:

```json
{
  "window_start_ts": "2026-05-19T00:00:00.000Z",
  "api_requests_total": 142,
  "api_errors_total": 3,
  "provider_calls_total": 87,
  "provider_cost_usd": 0.124,
  "backup_last_created_ts": "2026-05-19T02:00:00.000Z",
  "backup_last_verified_ts": "2026-05-19T02:00:05.000Z"
}
```

Poll this field from any monitoring system via:

```bash
node -e "const s=require('./progress/status.json'); console.log(JSON.stringify(s.runtime_health.metrics_window_24h,null,2))"
```

### Alerting (Opt-in Webhooks)

Alerts are **disabled by default**. Enable by setting `FORGE_ALERT_WEBHOOK_URL`:

```bash
# In .env or shell:
FORGE_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
```

Supported targets:
- **Discord:** `https://discord.com/api/webhooks/<id>/<token>`
- **Slack:** `https://hooks.slack.com/services/...`
- **SMTP:** Configure via `FORGE_ALERT_SMTP_*` variables (see contract doc §Alerts)

Webhook payload pattern (fires when any Doctor check transitions to FAIL):

```json
{
  "text": "⚠ Forge alert: check `backup_status` → FAIL",
  "check_id": "backup_status",
  "detail": "no backup in 14 days",
  "ts": "2026-05-19T14:30:00.000Z"
}
```

Test the webhook endpoint (server must be running):

```bash
curl -s -X POST -H "Authorization: Bearer <token>" \
  http://127.0.0.1:3100/api/alerts/test | jq .
```

---

## 9. Security

> **Full contract:** `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` §Security
>
> **Decision authority:** D5 — `DECISION-2026-05-18T11-30-phase-12-plan.md` §2 D5

### Network Exposure — Bind to Localhost

Forge binds to `127.0.0.1` by default. **Do not expose it to external networks.**

```bash
# Default (recommended — access from localhost only)
npm start
# Server: http://127.0.0.1:3100

# Override only if you have a specific need (e.g., LAN access with VPN):
FORGE_BIND_HOST=0.0.0.0 npm start
# Warning: non-localhost binding is logged and flagged by Doctor
```

The `web/` directory **must not be served by any external HTTP server** (nginx, Apache,
etc.). It contains `web/.forge-session` which holds the capability token — serving this
directory externally would expose your token. Forge's own API server blocks all requests
to `**/.forge-session` paths with HTTP 404.

### Capability Token

Forge generates a 32-byte cryptographically random capability token at every server
start. All API endpoints (except `/api/system/health` and `/api/system/doctor`) require:

```
Authorization: Bearer <token>
```

The token is injected into `web/.forge-session` for the web UI. To retrieve it
programmatically:

```bash
# Extract token from session file (first line is a guard comment)
node -e "const l=require('fs').readFileSync('web/.forge-session','utf8').split('\n')[1]; console.log(JSON.parse(l).token)"
```

The Doctor check `api_auth_token` verifies the token is stored in the OS keychain and
valid. If it shows FAIL, restart Forge — a new token is generated on each start.

### UID Pinning

On first start, Forge records the OS user identity in `progress/uid_pin.json`. On
subsequent starts, if the identity does not match, Forge refuses to start:

```
[FATAL] UID mismatch: expected username=alice uid=1000; got username=root uid=0.
To re-claim: delete progress/uid_pin.json and write a decision artifact documenting
the re-claim, then restart.
```

This prevents accidental or malicious operation under a different user account.

**Re-claim procedure:**

```bash
rm progress/uid_pin.json
# Write a decision artifact in artifacts/decisions/ documenting why
# Then restart Forge — it will pin the new identity
```

### File Permission Recommendations

**Linux/macOS:**

```bash
# Protect API keys and session files
chmod 600 .env                          # if using .env
chmod 600 web/.forge-session            # session token (auto-managed by Forge)
chmod 700 progress/                     # status and uid_pin
chmod 600 progress/uid_pin.json        # identity pin

# Restrict the entire Forge directory to the owner
chmod -R go-rwx /path/to/forge
```

**Windows (PowerShell):**

```powershell
# Restrict .env to current user only
$acl = Get-Acl ".env"
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $env:USERNAME, "FullControl", "Allow")
$acl.SetAccessRule($rule)
Set-Acl ".env" $acl
```

---

## 10. Upgrading

### Upgrade Procedure

Always back up before upgrading:

```bash
# 1. Create a backup first
curl -s -H "Authorization: Bearer <token>" \
  http://127.0.0.1:3100/api/backup/create | jq .

# 2. Stop Forge
# Windows:  scripts\service\windows_nssm_install.bat stop
# Linux:    sudo systemctl stop forge-api
# macOS:    launchctl unload ~/Library/LaunchAgents/com.forge.api.plist

# 3. Pull latest changes
git pull

# 4. Install any new dependencies
npm install

# 5. Check for breaking changes
# Always read the PHASE roadmap for the new version:
cat architecture/FORGE_V2_PHASE_ROADMAP.md | head -60

# 6. Verify health
node bin/forge-doctor.js
# Must exit 0 before restarting the service

# 7. Run scenario suite
node bin/forge-test.js
# Must be all PASS or SKIP (none FAIL)

# 8. Restart Forge
# Windows:  scripts\service\windows_nssm_install.bat start
# Linux:    sudo systemctl start forge-api
# macOS:    launchctl load ~/Library/LaunchAgents/com.forge.api.plist
```

### Migration Discipline

Before upgrading across a major phase boundary (e.g., PHASE-11 → PHASE-12), check
`architecture/FORGE_V2_PHASE_ROADMAP.md` for any migration notes. Each phase may
introduce new required environment variables, changed default behavior, or schema
changes to `progress/status.json`.

The `node bin/forge-doctor.js` command will surface any configuration drift introduced
by an upgrade (missing env vars, changed ports, new required checks).

### Rollback

If an upgrade causes issues, restore from the backup created in step 1:

```bash
# Follow §Backup — Restore Procedure above
# Then run: node bin/forge-doctor.js to verify
```

---

## 11. Troubleshooting

> **First step for any issue:** `node bin/forge-doctor.js`
>
> The Doctor checks all 34 runtime health dimensions and surfaces the root cause
> with a `detail` string. Match the failing `check_id` to the table below.

### Common Failures

| Symptom | Doctor Check ID | Resolution |
|---|---|---|
| Server won't start — `EADDRINUSE` | `api_server_port` | Another process is using port 3100. Change port: `FORGE_API_PORT=3101 npm start`. Or find and stop the process: `netstat -ano | findstr 3100` (Windows) / `lsof -i :3100` (Linux/macOS). |
| All API calls return 401 Unauthorized | `api_auth_token` | Token is missing or stale. Stop Forge and restart — a new token is generated at every `npm start`. If Doctor shows FAIL on `api_auth_token`, the token was not saved to the keychain; check §Secret Storage. |
| LLM calls fail with "API key not set" | `openai_api_key` | `OPENAI_API_KEY` is not in your environment or keychain. Set it per §Prerequisites or §Secret Storage. Doctor detail will say `not set` or `set, length=0`. |
| `progress/status.json` parse error on start | `status_json_valid` | The status file is corrupt (truncated write, encoding issue). Restore from the last backup (§Backup — Restore Procedure) or manually fix the JSON. Do not edit `status.json` directly without writing a decision artifact. |
| `node bin/forge-test.js` hangs indefinitely | `recent_execution` | The scenario runner timed out waiting for the mock server. Kill the hung node process (`Ctrl+C` or `taskkill /F /IM node.exe`), then re-run. If it recurs, check `logs/forge.error.log` for the root cause. |
| KB research returns no results / LanceDB error | `kb_indexed_sources_count` | LanceDB index lock or corrupt index. Stop Forge, delete the lock file at `artifacts/kb/*.lock` if present, and restart. If the index is corrupt: `node -e "require('./code/src/runtime/kb/storage_lance').dropTable()"` — this clears the KB; re-ingest sources. |
| Agent role not loaded / role_id unknown | `roles_runtime` | A role file failed to load at boot. Check `logs/forge.error.log` for the role that threw. Usually a missing dependency or a syntax error introduced by a recent edit. Run `node -e "require('./code/src/runtime/agents/_role_registry')"` to isolate the error. |

### Health Check Quick Reference

```bash
# Full Doctor report
node bin/forge-doctor.js

# Single check via API (auth-exempt)
curl -s http://127.0.0.1:3100/api/system/doctor | jq '.checks[] | select(.status=="FAIL")'

# Tail error log
# Windows:
Get-Content logs\forge.error.log -Tail 50 -Wait
# Linux/macOS:
tail -f logs/forge.error.log
```

### When in Doubt

```bash
node bin/forge-doctor.js
```

If Doctor exits 0 and the problem persists, check `logs/forge.error.log` and
open an issue with the full Doctor report and the last 50 lines of the error log.

---

*Forge INSTALL.md — PHASE-12 Stage 12.6 — 2026-05-19*
