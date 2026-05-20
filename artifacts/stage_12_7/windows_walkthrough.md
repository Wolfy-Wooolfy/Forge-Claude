# PHASE-12 Stage 12.7 — Windows Clean-Machine Walkthrough Script

**Authority:** `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md` §3 Stage 12.7, §1.2
**Executor:** Khaled (in Windows VM or clean Windows user account)
**Verifies:** `INSTALL.md` step-by-step on a clean Windows 10/11 installation
**Evidence:** Each step produces text output → paste verbatim into `artifacts/stage_12_7/evidence/step_NN_<description>.txt`

---

## VM Pre-Conditions (do before starting)

- Windows 11 Pro 22H2+ (or Windows 10 Pro 21H2+), 4 GB RAM, 40 GB disk
- Take a VM snapshot **before** running step 1 (allows clean re-run if needed)
- PowerShell 5.1+ (pre-installed on Windows 10/11)
- Network access for `git clone` and NSSM download
- Run steps in order — each step depends on the previous

---

## Step 1 — Verify Node.js 20 LTS is installed

**Action:**
```powershell
node -v
npm -v
```

**Expected output:** `v20.x.x` (or higher, 20+ required)
**Evidence file:** `step_01_node_version.txt`
**If Node is not installed:** Download from https://nodejs.org/en/download (LTS version) and install before continuing.

---

## Step 2 — Git clone Forge

**Action:** (replace `<repo-url>` with the actual Forge git repo URL Khaled provides)
```powershell
cd C:\Users\%USERNAME%\Desktop
git clone <repo-url> forge
cd forge
```

**Expected output:** Cloning messages ending with `done.`
**Evidence file:** `step_02_git_clone.txt`

---

## Step 3 — Install npm dependencies

**Action:**
```powershell
npm install
```

**Expected output:** Lines starting with `added NNN packages` — no `npm ERR!` lines
**Evidence file:** `step_03_npm_install.txt`

---

## Step 4 — Set API key (fake key for non-LLM verification)

**Action:**
```powershell
$env:OPENAI_API_KEY = "sk-fake-key-for-infrastructure-test-12345678901234567890"
echo "Key set: $($env:OPENAI_API_KEY.Substring(0,10))..."
```

**Expected output:** `Key set: sk-fake-ke...`
**Evidence file:** `step_04_api_key_set.txt`
**Note:** This fake key lets forge-doctor.js verify infrastructure without making real API calls.

---

## Step 5 — First forge-doctor run (pre-service)

**Action:**
```powershell
node bin/forge-doctor.js
```

**Expected output:**
- `node_version`: PASS (v20+)
- `api_server_port`: PASS
- `service_lifecycle`: PASS (shows "not installed as a service")
- `backup_status`: PASS (shows "no backups yet")
- `api_binding`: PASS (shows "binds to 127.0.0.1")
- `openai_api_key`: PASS (fake key is present and non-empty)
- No `FAIL` statuses (some WARN are acceptable: providers_registered, logging_status, metrics_available, api_auth_token, uid_pin_match, secrets_in_env_var, container_runtime)

**Evidence file:** `step_05_doctor_first_run.txt`

---

## Step 6 — Download and verify NSSM SHA-256

**Action:**
```powershell
Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "nssm-2.24.zip"
Get-FileHash "nssm-2.24.zip" -Algorithm SHA256 | Select-Object Hash
```

**Expected SHA-256 (verbatim from INSTALL.md §3):**
```
727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743
```

**Evidence file:** `step_06_nssm_sha256.txt`
**Note:** The hash must match exactly. If it does not match, STOP and report to CTO before continuing.

---

## Step 7 — Extract NSSM and verify binary

**Action:**
```powershell
Expand-Archive "nssm-2.24.zip" -DestinationPath "nssm-2.24" -Force
dir nssm-2.24\nssm-2.24\win64\nssm.exe
```

**Expected output:** File listing showing `nssm.exe`
**Evidence file:** `step_07_nssm_extract.txt`

---

## Step 8 — Install Forge as NSSM service (requires Administrator)

**Pre-condition:** Open a new PowerShell window **as Administrator** before this step.

**Action (run as Administrator):**
```powershell
$nssmPath = "$PWD\nssm-2.24\nssm-2.24\win64\nssm.exe"
$nodePath  = (Get-Command node).Source
$forgePath = "$PWD\start-api.js"
$workDir   = $PWD

& $nssmPath install forge-api $nodePath $forgePath
& $nssmPath set forge-api AppDirectory $workDir
& $nssmPath set forge-api AppEnvironmentExtra OPENAI_API_KEY=sk-fake-key-for-infrastructure-test-12345678901234567890
& $nssmPath set forge-api AppRestartDelay 5000
& $nssmPath set forge-api DisplayName "Forge AI OS API"
Write-Output "Service installed"
```

**Expected output:** `Service installed` (no error messages)
**Evidence file:** `step_08_nssm_install.txt`

---

## Step 9 — Start service and verify running

**Action (as Administrator):**
```powershell
& $nssmPath start forge-api
Start-Sleep 5
Get-Service forge-api | Select-Object Name, Status
```

**Expected output:**
```
Name      Status
----      ------
forge-api Running
```

**Evidence file:** `step_09_service_running.txt`

---

## Step 10 — Verify API server responds on 127.0.0.1

**Action:**
```powershell
Start-Sleep 3
curl.exe -s http://127.0.0.1:3100/api/system/doctor | ConvertFrom-Json | Select-Object ok, @{N="checks";E={$_.checks.Count}}
```

**Expected output:** `ok=True, checks=34` (or similar JSON structure showing ok:true and 34 checks)
**Note:** If curl.exe is not available, use: `Invoke-WebRequest http://127.0.0.1:3100/api/system/doctor`
**Evidence file:** `step_10_doctor_api.txt`

---

## Step 11 — Crash recovery test (plant a crash and verify restart)

**Action:**
```powershell
# Kill the node process backing the service
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Write-Output "Killed at: $(Get-Date)"
Start-Sleep 12
Get-Service forge-api | Select-Object Name, Status
```

**Expected output:** After 10-12 seconds, service status should return to `Running` (NSSM auto-restart).
**Evidence file:** `step_11_crash_recovery.txt`

---

## Step 12 — Capability token test (auth verification)

**Action:**
```powershell
# Step 12a: unauthenticated request should return 401
# Note: Invoke-WebRequest throws on non-2xx; catch the exception to read the status code.
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3100/api/projects/list" -UseBasicParsing
    Write-Output "Unauth status: $($r.StatusCode) (UNEXPECTED — expected 401)"
} catch {
    Write-Output "Unauth status: $($_.Exception.Response.StatusCode.value__)"
}

# Step 12b: find and read the session file
$forgePath = "$PWD"
$sessionFile = Join-Path $forgePath "web\.forge-session"
Get-Content $sessionFile

# Step 12c: extract token (second line is JSON)
$sessionLines = Get-Content $sessionFile
$sessionJson  = $sessionLines[1] | ConvertFrom-Json
$token        = $sessionJson.token
Write-Output "Token length: $($token.Length)"

# Step 12d: authenticated request should succeed
$headers = @{ Authorization = "Bearer $token" }
$r2 = Invoke-WebRequest -Uri "http://127.0.0.1:3100/api/projects/list" -Headers $headers -UseBasicParsing
Write-Output "Auth status: $($r2.StatusCode)"
```

**Expected output:**
- `Unauth status: 401`
- Session file shows first line `# FORGE-SESSION — DO NOT SERVE EXTERNALLY`
- `Token length: 64`
- `Auth status: 200`

**Evidence file:** `step_12_capability_token.txt`

---

## Step 13 — UID pin sanity check

**Action:**
```powershell
$pinPath = Join-Path $PWD "progress\uid_pin.json"
Get-Content $pinPath | ConvertFrom-Json | Format-List pinned_at, username, uid
Write-Output "Current user: $env:USERNAME"
```

**Expected output:** `username` field matches `$env:USERNAME` (the VM's current Windows user)
**Evidence file:** `step_13_uid_pin.txt`

---

## Step 14 — Second forge-doctor run (post-setup)

**Action:**
```powershell
node bin/forge-doctor.js
```

**Expected improvement vs Step 5:**
- `service_lifecycle`: now shows PASS or WARN (service installed)
- `uid_pin_match`: now PASS (pin was written on first start)
- `api_auth_token`: now PASS or WARN (token stored in secret provider)
- `logging_status`: PASS or WARN (depends on whether logs/ was created)

**Evidence file:** `step_14_doctor_post_setup.txt`

---

## Step 15 — Service stop and remove (cleanup)

**Action (as Administrator):**
```powershell
& $nssmPath stop forge-api
Start-Sleep 3
& $nssmPath remove forge-api confirm
Get-Service forge-api -ErrorAction SilentlyContinue
```

**Expected output:** No output from `Get-Service` (service removed) or error "Cannot find service"
**Evidence file:** `step_15_service_removed.txt`

---

## Evidence Collection Summary

After completing all 15 steps, you should have 15 text files in `artifacts/stage_12_7/evidence/`:

| File | Step |
|---|---|
| `step_01_node_version.txt` | Node.js version verification |
| `step_02_git_clone.txt` | Git clone output |
| `step_03_npm_install.txt` | npm install output |
| `step_04_api_key_set.txt` | API key environment variable |
| `step_05_doctor_first_run.txt` | First forge-doctor output |
| `step_06_nssm_sha256.txt` | NSSM SHA-256 hash verification |
| `step_07_nssm_extract.txt` | NSSM extract + binary listing |
| `step_08_nssm_install.txt` | NSSM service install |
| `step_09_service_running.txt` | Service status = Running |
| `step_10_doctor_api.txt` | API server doctor endpoint |
| `step_11_crash_recovery.txt` | Crash + auto-restart verification |
| `step_12_capability_token.txt` | Auth token flow (401 → 200) |
| `step_13_uid_pin.txt` | UID pin file content |
| `step_14_doctor_post_setup.txt` | Second forge-doctor output |
| `step_15_service_removed.txt` | Service removal |

**IMPORTANT — Evidence integrity rules:**
- Paste raw output **verbatim** — do NOT summarize or edit
- Include any error messages — they are part of the record
- If a step fails unexpectedly, paste the error and STOP — notify CTO before continuing
- ❌ DO NOT include real API keys or real passwords in evidence files
- The fake API key `sk-fake-key-for-infrastructure-test-12345678901234567890` is intentional and safe to commit

---

## After Upload

Once all 15 evidence files are ready, zip them and share with Claude Code (or paste contents directly in chat). Claude Code will collect them into `artifacts/stage_12_7/evidence/` and proceed to write the PHASE-12 closure decision artifact.

---

**END OF WINDOWS WALKTHROUGH SCRIPT**
