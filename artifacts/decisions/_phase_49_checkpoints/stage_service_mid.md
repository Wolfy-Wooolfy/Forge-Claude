# PHASE-49 — Mid-Checkpoint: Service (W-D steps 1-2)

- Date: 2026-07-01
- Phase: PHASE-49 (Windows Production Polish)
- Decision: DECISION-2026-07-01-phase-49-windows-production-polish.md (Amendment A-1 — service_lifecycle pm2-aware)
- Scope of this checkpoint: W-D step 1 (start forge under pm2) + step 2 (service_lifecycle.js pm2-aware)
- Cost: $0
- §ARC: frozen at 10

---

## W-D recon (machine facts, read-only)

FINDING-B — two competing Windows boot mechanisms:
1. `\ForgeAPI` scheduled task — trigger `MSFT_TaskLogonTrigger` (at user logon); action `node.exe start-api.js`, WorkingDir `D:\S\Halo\Tech\Forge-Claude` (correct repo). It boots Forge via **raw node, bypassing pm2** (no daemon, no auto-restart; dies at logoff — LastResult 0xC000013A = terminated at shutdown).
2. pm2 — app `forge` via `RUN_FORGE.bat` L34 `pm2 start ecosystem.config.js --update-env`.

pm2 state at recon: 0 processes, `forge` absent; saved dump `~/.pm2/dump.pm2` = 2 bytes (empty → `pm2 resurrect` would restore nothing; must `pm2 start` + `pm2 save` first).

Implication (for steps 3-4): consolidate on pm2 — repurpose the `\ForgeAPI` logon task to run `pm2 resurrect` (single boot path, daemonized + auto-restart) instead of raw `node start-api.js`, and `pm2 save` to populate the dump.

---

## W-D step 1 — start forge under pm2

- `pm2 ping` → `{ msg: 'pong' }` (daemon healthy).
- `pm2 start ecosystem.config.js --update-env` → App [forge] launched, status **online**, pid 6792, cwd `D:\S\Halo\Tech\Forge-Claude`, restarts **0** (stable — the W-B start-api.js boot hydration does NOT crash-loop).
- `jlist`: forge present, status online, restarts 0, cwd correct.
- `:3100` health probe (Invoke-WebRequest `http://127.0.0.1:3100/`) → **HTTP 200** (server responding).

(Note: the initial `RUN_FORGE.bat` invocation via a PowerShell pipe was terminated early — the direct `pm2 start` is the sanctioned command the bat runs at L34; result is identical.)

## W-D step 2 — service_lifecycle.js pm2-aware (Amendment A-1)

### Diff (Windows branch — pm2 detection FIRST, then the existing nssm/schtasks logic unchanged)
```diff
     if (platform === "win32") {
+      // W-D (PHASE-49): pm2 is the canonical Windows supervisor (Amendment A-1).
+      // Detect the "forge" app FIRST — via the SAME L2 shell.run_read_only seam used
+      // for nssm/schtasks below (no new syscall / §ARC). If it is online, that is the
+      // running service. Any failure (pm2 not in PATH, non-JSON, no "forge" match)
+      // falls through to the existing nssm / Task Scheduler logic, unchanged.
+      try {
+        const r = await runReadOnly(["pm2", "jlist"]);
+        if (r && r.stdout) {
+          const list = JSON.parse(r.stdout);
+          const forgeApp = Array.isArray(list)
+            ? list.find((p) => p && p.name === "forge")
+            : null;
+          if (forgeApp && forgeApp.pm2_env && forgeApp.pm2_env.status === "online") {
+            return { status: "PASS", detail: "forge-api running via pm2" };
+          }
+        }
+      } catch (_) { /* pm2 not installed / non-JSON / no forge app — fall through */ }
+
       let nssmRegistered = false;
       let nssmRunning    = false;
```
- Precedence: pm2 first (PASS if `forge` online); otherwise the existing nssm/Task-Scheduler/PASS-if-none logic is byte-unchanged.
- Uses the EXISTING `runReadOnly` helper → `reg.invoke("shell.run_read_only", { argv, timeout_ms }, { root })` — the same L2 seam already used for nssm/schtasks. `shell.run_read_only` uses a hard-deny model (no positive allowlist), so `pm2 jlist` is permitted.

### Doctor result
```
✓  service_lifecycle            forge-api running via pm2
✓ HEALTHY — 0 critical, 4 warning
```
Delta: `service_lifecycle` WARN → **PASS**; overall 5 → **4 warnings** (install_path still WARN pending the owner's `D:\ForgeAI` removal (W-C); + the 3 benign providers_registered / disk_space / container_runtime).

### Track A grep on service_lifecycle.js
```
CLEAN — no fs.*Sync / child_process / fetch / new OpenAI.
```
Only new call = `runReadOnly(["pm2","jlist"])` → `reg.invoke("shell.run_read_only", …)`. §ARC = 10 (unchanged). L2=80, roles=13.

---

## Not done (steps 3-4 — await CTO verify of step 2)
- `pm2 save` (populate the dump), repurpose the `\ForgeAPI` logon task → `pm2 resurrect`.
- OS tests: boot-start (logoff/logon or reboot → forge responds on :3100) + crash-restart (kill the process → pm2 restarts within N s).

## Commit state
- W-D step-2 code (`service_lifecycle.js`): UNCOMMITTED (report-then-verify).
- `progress/status.json`: doctor `runtime_health` auto-patch (§ARC-9) — uncommitted; W-E corrects `current_task` at closure.
- forge is now RUNNING under pm2 (pid 6792) — this is a live process, not a committed artifact.

---

## W-D steps 3-4 (pm2 save + task repurpose + OS tests)

### Step 3 — make pm2 the SINGLE boot path
- **3a `pm2 save`:** dump `~/.pm2/dump.pm2` now **15,658 bytes** with 7 `forge` occurrences (was 2 bytes/empty) → `pm2 resurrect` will restore `forge`.
- **3b pm2 invocation (PATH-independent, verified):** node = `C:\Program Files\nodejs\node.exe`; pm2 CLI = `<npm root -g>\pm2\bin\pm2`. Verified: `node "<pm2 CLI>" jlist` → forge online (so `… resurrect` is reliable from a minimal task env).
- **3c edit `scripts/service/windows_task_scheduler_install.bat`** (ops script; scripts/service/** is OUTSIDE Track A):
  - Derive `PM2_CLI` from `npm root -g` (+ existence guard).
  - Action changed `New-ScheduledTaskAction -Argument 'start-api.js'` → `-Argument ([char]34 + '%PM2_CLI%' + [char]34 + ' resurrect')` (quoted path → `node "<pm2 CLI>" resurrect`). AtLogOn trigger + idempotent delete/recreate unchanged.
  - Header comments updated: boot is now the single `pm2 resurrect` path; direct-node path retired.
- **3d re-install + verify (`Get-ScheduledTask ForgeAPI`):**
  - Execute = `C:\Program Files\nodejs\node.exe`
  - Args = `"C:\Users\khaled.sayed\AppData\Roaming\npm\node_modules\pm2\bin\pm2" resurrect`
  - WorkingDir = `D:\S\Halo\Tech\Forge-Claude`; Trigger = `MSFT_TaskLogonTrigger`; State Ready.
  - ⇒ the direct-node competing :3100 binder is **retired**; one canonical boot path (pm2 resurrect at logon).

### Step 4 — deterministic OS tests (both self-recovering; brief :3100 downtime)

**TEST A — boot-start via resurrect → PASS**
- pre-kill: `:3100` = 200.
- `pm2 kill` → `:3100` = **0 (DOWN)**, pm2 empty (fresh-session simulation).
- `schtasks /run /tn ForgeAPI` (runs `pm2 resurrect`) → forge back **online** (new pid 12140) + `:3100` = **HTTP 200**.

**TEST B — crash-restart → PASS**
- BEFORE: pid **12140**, restart_time 0, online, `:3100` = 200.
- `Stop-Process -Id 12140 -Force` (direct process kill, NOT via pm2).
- After ~2s: forge **online**, **new pid 16216**, **restart_time 1** (incremented), `:3100` = **HTTP 200**. pm2 autorestart proven.

### Track A / §ARC
- Only ops file edited: `scripts/service/windows_task_scheduler_install.bat` (scripts/service/** — outside the runtime live surface). The step-2 live-surface file `service_lifecycle.js` is Track-A-clean (see above). **§ARC = 10.** Cost $0.

### Commit state
- `windows_task_scheduler_install.bat` (step 3): UNCOMMITTED (report-then-verify).
- `service_lifecycle.js` (step 2): committed by owner interim U-commit.
- forge currently RUNNING under pm2 (pid 16216, online).

## STOP
W-D steps 1-4 complete + OS-tested (service_lifecycle PASS via pm2; boot-start + crash-restart both PASS). Awaiting CTO verification before the closure sequence (W-C doctor confirm pending owner `rmdir`, then W-E + closure).
