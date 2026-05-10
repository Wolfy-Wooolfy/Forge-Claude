"use strict";

const path = require("path");

// ── R1-R9: Forbidden argv tokens → HARD_DENY (first-match wins) ───────────────

const ARGV_HARD_DENY_RULES = [
  { token: "--privileged",    reason: "PRIVILEGED_FLAG" },
  { token: "--cap-add",       reason: "CAP_ADD" },
  { token: "--cap-drop",      reason: "CAP_DROP" },
  { token: "--security-opt",  reason: "SECURITY_OPT" },
  { token: "--device",        reason: "DEVICE_MOUNT" },
  { token: "--pid=host",      reason: "HOST_PID" },
  { token: "--ipc=host",      reason: "HOST_IPC" },
  { token: "--uts=host",      reason: "HOST_UTS" },
  { token: "--network=host",  reason: "HOST_NETWORK" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function _deny(severity, reason, detail) {
  return { ok: false, severity, reason, detail: detail || null };
}

// Parse host port from docker -p spec: "hostPort:containerPort", "ip:hostPort:containerPort"
function _parseHostPort(spec) {
  const parts = spec.split(":");
  if (parts.length === 1) return null; // bare container port, no host binding
  const hostPort = parts.length === 2 ? parts[0] : parts[1];
  const num = parseInt(hostPort, 10);
  return isNaN(num) ? null : num;
}

// Determine if a volume source string is a host path (not a named volume)
function _isHostPath(src) {
  return src.startsWith("/") || src.startsWith("./") || src.startsWith("../") ||
         (src.length >= 3 && src[1] === ":" && (src[2] === "/" || src[2] === "\\"));
}

function _outsideRoot(hostPath, root) {
  const resolved = path.resolve(hostPath);
  const rootResolved = path.resolve(root);
  return !resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved;
}

// ── inspectPath ───────────────────────────────────────────────────────────────
// R10 variant: checks a single resolved path against workspace root.

function inspectPath(absPath, projectId, root) {
  if (!root) return { ok: true };
  const resolved = path.resolve(absPath);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    return _deny("HARD_DENY", "WORKSPACE_BOUNDARY_VIOLATION",
      "path '" + resolved + "' is outside workspace root '" + rootResolved + "'");
  }
  return { ok: true };
}

// ── inspectArgv ───────────────────────────────────────────────────────────────
// Full 11-rule scan. ctx = { root } where root is workspace root (may be falsy).

function inspectArgv(argv, ctx) {
  if (!Array.isArray(argv)) return { ok: true };
  const root = ctx && ctx.root;

  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);

    // R1-R9: forbidden tokens (exact or token=value form)
    for (const rule of ARGV_HARD_DENY_RULES) {
      if (arg === rule.token || arg.startsWith(rule.token + "=")) {
        return _deny("HARD_DENY", rule.reason, "forbidden flag '" + arg + "'");
      }
    }

    // R10: bind mount outside workspace
    if (root) {
      let volumeSrc = null;
      if ((arg === "-v" || arg === "--volume") && i + 1 < argv.length) {
        const parts = String(argv[i + 1]).split(":");
        if (parts.length >= 2) volumeSrc = parts[0];
      } else if (arg.startsWith("--volume=")) {
        const parts = arg.slice("--volume=".length).split(":");
        if (parts.length >= 2) volumeSrc = parts[0];
      }
      if (volumeSrc && _isHostPath(volumeSrc) && _outsideRoot(volumeSrc, root)) {
        return _deny("HARD_DENY", "WORKSPACE_BOUNDARY_VIOLATION",
          "bind mount '" + volumeSrc + "' is outside workspace root");
      }
    }

    // R11: privileged host port (< 1024)
    let portSpec = null;
    if ((arg === "-p" || arg === "--publish") && i + 1 < argv.length) {
      portSpec = String(argv[i + 1]);
    } else if (arg.startsWith("--publish=")) {
      portSpec = arg.slice("--publish=".length);
    }
    if (portSpec !== null) {
      const hp = _parseHostPort(portSpec);
      if (hp !== null && hp > 0 && hp < 1024) {
        return _deny("DENY", "PRIVILEGED_PORT", "host port " + hp + " is privileged (< 1024)");
      }
    }
  }

  return { ok: true };
}

// ── inspectInput ─────────────────────────────────────────────────────────────
// Phase-1 guard: structured input fields checked BEFORE pickRuntime + buildArgv.
// ctx = { root } where root is workspace root (may be falsy).

function inspectInput(input, ctx) {
  if (!input || typeof input !== "object") return { ok: true };
  const root = ctx && ctx.root;

  // 1. privileged
  if (input.privileged === true)
    return _deny("HARD_DENY", "PRIVILEGED_FLAG", "input.privileged is true");

  // 2. cap_add
  if (Array.isArray(input.cap_add) && input.cap_add.length > 0)
    return _deny("HARD_DENY", "CAP_ADD", "input.cap_add: [" + input.cap_add.join(", ") + "]");

  // 3. cap_drop
  if (Array.isArray(input.cap_drop) && input.cap_drop.length > 0)
    return _deny("HARD_DENY", "CAP_DROP", "input.cap_drop: [" + input.cap_drop.join(", ") + "]");

  // 4. security_opt
  if (Array.isArray(input.security_opt) && input.security_opt.length > 0)
    return _deny("HARD_DENY", "SECURITY_OPT", "input.security_opt set");

  // 5. devices
  if (Array.isArray(input.devices) && input.devices.length > 0)
    return _deny("HARD_DENY", "DEVICE_MOUNT", "input.devices set");

  // 6-8. pid / ipc / uts host
  if (input.pid === "host")
    return _deny("HARD_DENY", "HOST_PID", "input.pid is 'host'");
  if (input.ipc === "host")
    return _deny("HARD_DENY", "HOST_IPC", "input.ipc is 'host'");
  if (input.uts === "host")
    return _deny("HARD_DENY", "HOST_UTS", "input.uts is 'host'");

  // 9. network host
  if (input.network === "host")
    return _deny("DENY", "HOST_NETWORK", "input.network is 'host'");

  // 10. user root
  if (input.user === "0" || input.user === "root")
    return _deny("DENY", "USER_ROOT", "input.user is root");

  // 11. restart policy (persistent process)
  if (input.restart === "always" || input.restart === "unless-stopped")
    return _deny("DENY", "RESTART_POLICY", "input.restart '" + input.restart + "' requires PROMPT");

  // Volumes boundary check
  if (root && Array.isArray(input.volumes)) {
    for (const vol of input.volumes) {
      let hostPath = null;
      if (typeof vol === "string") {
        const parts = vol.split(":");
        if (parts.length >= 2) hostPath = parts[0];
      } else if (vol && typeof vol === "object") {
        hostPath = vol.host || vol.source || null;
      }
      if (hostPath && _isHostPath(hostPath) && _outsideRoot(hostPath, root)) {
        return _deny("HARD_DENY", "WORKSPACE_BOUNDARY_VIOLATION",
          "volume host path '" + hostPath + "' is outside workspace root");
      }
    }
  }

  // Ports privileged check
  if (Array.isArray(input.ports)) {
    for (const portDef of input.ports) {
      let hp = null;
      if (typeof portDef === "string") {
        hp = _parseHostPort(portDef);
      } else if (portDef && typeof portDef === "object") {
        const raw = portDef.host !== undefined ? portDef.host : portDef.published;
        if (raw !== undefined) { hp = parseInt(String(raw), 10); if (isNaN(hp)) hp = null; }
      }
      if (hp !== null && hp > 0 && hp < 1024) {
        return _deny("DENY", "PRIVILEGED_PORT", "host port " + hp + " is privileged (< 1024)");
      }
    }
  }

  return { ok: true };
}

// ── inspectComposeJson ────────────────────────────────────────────────────────
// Walks services object from parsed compose YAML/JSON. ctx = { root }.

function inspectComposeJson(composeJson, ctx) {
  if (!composeJson || typeof composeJson.services !== "object") return { ok: true };
  const root = ctx && ctx.root;

  for (const [svcName, svc] of Object.entries(composeJson.services)) {
    if (!svc || typeof svc !== "object") continue;
    const s = "service '" + svcName + "'";

    // R1: privileged
    if (svc.privileged === true)
      return _deny("HARD_DENY", "PRIVILEGED_FLAG", s + " has privileged: true");

    // R2: cap_add
    if (Array.isArray(svc.cap_add) && svc.cap_add.length > 0)
      return _deny("HARD_DENY", "CAP_ADD", s + " has cap_add: [" + svc.cap_add.join(", ") + "]");

    // R3: cap_drop
    if (Array.isArray(svc.cap_drop) && svc.cap_drop.length > 0)
      return _deny("HARD_DENY", "CAP_DROP", s + " has cap_drop: [" + svc.cap_drop.join(", ") + "]");

    // R4: security_opt
    if (Array.isArray(svc.security_opt) && svc.security_opt.length > 0)
      return _deny("HARD_DENY", "SECURITY_OPT", s + " has security_opt");

    // R5: devices
    if (Array.isArray(svc.devices) && svc.devices.length > 0)
      return _deny("HARD_DENY", "DEVICE_MOUNT", s + " has devices");

    // R6: pid: host
    if (svc.pid === "host")
      return _deny("HARD_DENY", "HOST_PID", s + " has pid: host");

    // R7: ipc: host
    if (svc.ipc === "host")
      return _deny("HARD_DENY", "HOST_IPC", s + " has ipc: host");

    // R8: uts: host
    if (svc.uts === "host")
      return _deny("HARD_DENY", "HOST_UTS", s + " has uts: host");

    // R9: network_mode: host
    if (svc.network_mode === "host")
      return _deny("HARD_DENY", "HOST_NETWORK", s + " has network_mode: host");

    // R10: bind mounts outside workspace
    if (root && Array.isArray(svc.volumes)) {
      for (const vol of svc.volumes) {
        let hostPath = null;
        if (typeof vol === "string") {
          const parts = vol.split(":");
          if (parts.length >= 2) hostPath = parts[0];
        } else if (vol && typeof vol === "object" && vol.type === "bind" && vol.source) {
          hostPath = vol.source;
        }
        if (hostPath && _isHostPath(hostPath) && _outsideRoot(hostPath, root)) {
          return _deny("HARD_DENY", "WORKSPACE_BOUNDARY_VIOLATION",
            s + " bind mount '" + hostPath + "' is outside workspace root");
        }
      }
    }

    // R11: privileged ports
    if (Array.isArray(svc.ports)) {
      for (const portDef of svc.ports) {
        let hp = null;
        if (typeof portDef === "string") {
          hp = _parseHostPort(portDef);
        } else if (portDef && typeof portDef === "object" && portDef.published !== undefined) {
          hp = parseInt(portDef.published, 10);
          if (isNaN(hp)) hp = null;
        }
        if (hp !== null && hp > 0 && hp < 1024) {
          return _deny("DENY", "PRIVILEGED_PORT", s + " publishes privileged port " + hp + " (< 1024)");
        }
      }
    }
  }

  return { ok: true };
}

module.exports = { inspectInput, inspectArgv, inspectComposeJson, inspectPath };
