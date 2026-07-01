"use strict";

// Forge API service lifecycle Doctor check.
// Read-only — all shell calls go through shell.run_read_only (Path A).
// Supports: Windows (NSSM or Task Scheduler), Linux (systemd), macOS (launchd).
// "Not installed" is PASS (expected during initial setup), not FAIL/WARN.

module.exports = {
  id: "service_lifecycle",
  description: "Forge API service registration: NSSM/Task Scheduler (Windows), systemd (Linux), launchd (macOS)",

  async fn(ctx) {
    const root = (ctx && ctx.root) || process.cwd();

    // Path A: lazy require to avoid circular dependency at module load time.
    const { getDefaultRegistry } = require("../../tools/_registry");
    const reg = getDefaultRegistry();

    async function runReadOnly(argv) {
      const env = await reg.invoke(
        "shell.run_read_only",
        { argv, timeout_ms: 5000 },
        { root }
      );
      if (env.status !== "SUCCESS") return null;
      return env.output; // { stdout, stderr, exit_code, timed_out }
    }

    const platform = process.platform;

    // ── Windows ───────────────────────────────────────────────────────────────

    if (platform === "win32") {
      // W-D (PHASE-49): pm2 is the canonical Windows supervisor (Amendment A-1).
      // Detect the "forge" app FIRST — via the SAME L2 shell.run_read_only seam used
      // for nssm/schtasks below (no new syscall / §ARC). If it is online, that is the
      // running service. Any failure (pm2 not in PATH, non-JSON, no "forge" match)
      // falls through to the existing nssm / Task Scheduler logic, unchanged.
      try {
        const r = await runReadOnly(["pm2", "jlist"]);
        if (r && r.stdout) {
          const list = JSON.parse(r.stdout);
          const forgeApp = Array.isArray(list)
            ? list.find((p) => p && p.name === "forge")
            : null;
          if (forgeApp && forgeApp.pm2_env && forgeApp.pm2_env.status === "online") {
            return { status: "PASS", detail: "forge-api running via pm2" };
          }
        }
      } catch (_) { /* pm2 not installed / non-JSON / no forge app — fall through */ }

      let nssmRegistered = false;
      let nssmRunning    = false;

      try {
        const r = await runReadOnly(["nssm", "status", "forge-api"]);
        if (r && r.exit_code !== null) {
          const out = (r.stdout || "") + (r.stderr || "");
          nssmRegistered = /SERVICE_(RUNNING|STOPPED|PAUSED|START_PENDING|STOP_PENDING)/i.test(out);
          nssmRunning    = nssmRegistered && /SERVICE_RUNNING/i.test(r.stdout || "");
        }
      } catch (_) { /* nssm not in PATH */ }

      let taskRegistered = false;
      let taskRunning    = false;

      try {
        const r = await runReadOnly(["schtasks", "/query", "/tn", "ForgeAPI", "/fo", "LIST"]);
        if (r && r.exit_code === 0) {
          taskRegistered = true;
          taskRunning    = /Status:\s*Running/i.test(r.stdout || "");
        }
      } catch (_) { /* schtasks error */ }

      if (!nssmRegistered && !taskRegistered) {
        return {
          status: "PASS",
          detail: "forge-api not installed as a service — see INSTALL.md §Windows Service"
        };
      }

      const method  = nssmRegistered ? "nssm" : "task_scheduler";
      const running = nssmRegistered ? nssmRunning : taskRunning;

      if (running) {
        return { status: "PASS", detail: "forge-api running via " + method };
      }
      return {
        status: "WARN",
        detail: "forge-api registered via " + method + " but not running — start with: " +
                (method === "nssm"
                  ? "scripts\\service\\windows_nssm_install.bat start"
                  : "scripts\\service\\windows_task_scheduler_install.bat start")
      };
    }

    // ── Linux (systemd) ───────────────────────────────────────────────────────

    if (platform === "linux") {
      try {
        const r = await runReadOnly(["systemctl", "is-active", "forge-api"]);
        if (r === null) {
          return { status: "PASS", detail: "systemctl not available — see INSTALL.md §Linux Service" };
        }
        if (r.exit_code === 0) {
          return { status: "PASS", detail: "forge-api systemd service active" };
        }
        const out = (r.stdout || "").trim();
        if (out === "inactive" || out === "failed" || out === "activating" || out === "deactivating") {
          return {
            status: "WARN",
            detail: "forge-api systemd service installed but not active (" + out + ") — run: systemctl start forge-api"
          };
        }
        // "unknown" = unit not found (not installed)
        return { status: "PASS", detail: "forge-api not installed as systemd service — see INSTALL.md §Linux Service" };
      } catch (_) {
        return { status: "PASS", detail: "systemctl not available — see INSTALL.md §Linux Service" };
      }
    }

    // ── macOS (launchd) ───────────────────────────────────────────────────────

    if (platform === "darwin") {
      try {
        const r = await runReadOnly(["launchctl", "list", "com.forge.api"]);
        if (r === null) {
          return { status: "PASS", detail: "launchctl not available — see INSTALL.md §macOS Service" };
        }
        if (r.exit_code === 0) {
          const running = /"PID"\s*=\s*\d+/.test(r.stdout || "");
          if (running) {
            return { status: "PASS", detail: "com.forge.api launchd service running" };
          }
          return {
            status: "WARN",
            detail: "com.forge.api loaded but not running — run: launchctl start com.forge.api"
          };
        }
        return { status: "PASS", detail: "com.forge.api not installed as launchd service — see INSTALL.md §macOS Service" };
      } catch (_) {
        return { status: "PASS", detail: "launchctl not available — see INSTALL.md §macOS Service" };
      }
    }

    // ── Other OS ──────────────────────────────────────────────────────────────

    return {
      status: "PASS",
      detail: "service_lifecycle check not applicable on " + platform
    };
  }
};
