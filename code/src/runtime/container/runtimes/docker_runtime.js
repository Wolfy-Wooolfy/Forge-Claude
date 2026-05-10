"use strict";

// ── Docker runtime adapter ────────────────────────────────────────────────────

const id    = "docker";
const label = "Docker";

// available() is async — checks binary present AND daemon functional.
// Lazy require inside function to avoid circular dependency at load time.
async function available() {
  const { getDefaultRegistry } = require("../../tools/_registry");
  const reg = getDefaultRegistry();
  const r = await reg.invoke("env.probe_binary", { binary: "docker", args: ["info"] }, {});
  return r.status === "SUCCESS" && r.output && r.output.exit_code === 0;
}

// ── Run ───────────────────────────────────────────────────────────────────────

function buildRunArgv(input, ctx) {
  const argv = ["docker", "run"];

  if (input.name)          argv.push("--name", input.name);
  if (input.wait !== true) argv.push("-d");

  if (Array.isArray(input.ports)) {
    for (const p of input.ports) argv.push("-p", p.host + ":" + p.container);
  }

  if (Array.isArray(input.volumes)) {
    for (const v of input.volumes) {
      argv.push("-v", v.host + ":" + v.container + (v.mode ? ":" + v.mode : ""));
    }
  }

  if (input.env && typeof input.env === "object") {
    for (const [k, val] of Object.entries(input.env)) argv.push("-e", k + "=" + val);
  }

  if (input.network)           argv.push("--network", input.network);
  if (input.user !== undefined) argv.push("--user", String(input.user));
  if (input.restart)           argv.push("--restart", input.restart);

  // Faithfully translate privilege fields — guard catches these in execute()
  if (input.privileged) argv.push("--privileged");
  if (Array.isArray(input.cap_add)) {
    for (const c of input.cap_add) argv.push("--cap-add", c);
  }
  if (Array.isArray(input.cap_drop)) {
    for (const c of input.cap_drop) argv.push("--cap-drop", c);
  }
  if (Array.isArray(input.security_opt)) {
    for (const o of input.security_opt) argv.push("--security-opt", o);
  }

  argv.push(input.image);
  if (Array.isArray(input.command)) argv.push(...input.command);

  return argv;
}

// ── Stop ──────────────────────────────────────────────────────────────────────

function buildStopArgv(input, ctx) {
  const argv = ["docker", "stop"];
  if (input.timeout !== undefined) argv.push("-t", String(input.timeout));
  argv.push(input.container);
  return argv;
}

// ── Exec ──────────────────────────────────────────────────────────────────────

function buildExecArgv(input, ctx) {
  const argv = ["docker", "exec"];
  if (input.interactive) argv.push("-i");
  if (input.tty)         argv.push("-t");
  argv.push(input.container);
  if (Array.isArray(input.command)) argv.push(...input.command);
  return argv;
}

// ── Logs ──────────────────────────────────────────────────────────────────────

function buildLogsArgv(input, ctx) {
  const argv = ["docker", "logs"];
  if (input.tail !== undefined) argv.push("--tail", String(input.tail));
  if (input.follow)             argv.push("-f");
  if (input.timestamps)         argv.push("-t");
  argv.push(input.container);
  return argv;
}

// ── Pull ──────────────────────────────────────────────────────────────────────

function buildPullArgv(input, ctx) {
  return ["docker", "pull", input.image];
}

// ── Build ─────────────────────────────────────────────────────────────────────

function buildBuildArgv(input, ctx) {
  const argv = ["docker", "build"];
  if (input.dockerfile_path) argv.push("-f", input.dockerfile_path);
  if (input.tag)             argv.push("-t", input.tag);
  if (input.build_args && typeof input.build_args === "object") {
    for (const [k, v] of Object.entries(input.build_args)) argv.push("--build-arg", k + "=" + v);
  }
  argv.push(input.context_path || ".");
  return argv;
}

// ── List ──────────────────────────────────────────────────────────────────────

function buildListArgv(input, ctx) {
  const argv = ["docker", "ps", "--format", "json"];
  if (input.all) argv.push("-a");
  return argv;
}

// ── Inspect ───────────────────────────────────────────────────────────────────

function buildInspectArgv(input, ctx) {
  return ["docker", "inspect", input.container];
}

// ── Compose Up ────────────────────────────────────────────────────────────────

function buildComposeUpArgv(input, ctx) {
  const argv = ["docker", "compose"];
  if (input.compose_file)  argv.push("-f", input.compose_file);
  if (input.project_name)  argv.push("-p", input.project_name);
  argv.push("up");
  if (input.detach !== false) argv.push("-d");
  return argv;
}

// ── Compose Down ──────────────────────────────────────────────────────────────

function buildComposeDownArgv(input, ctx) {
  const argv = ["docker", "compose"];
  if (input.compose_file)  argv.push("-f", input.compose_file);
  if (input.project_name)  argv.push("-p", input.project_name);
  argv.push("down");
  if (input.volumes) argv.push("-v");
  return argv;
}

// ── Compose Logs ──────────────────────────────────────────────────────────────

function buildComposeLogsArgv(input, ctx) {
  const argv = ["docker", "compose"];
  if (input.compose_file)  argv.push("-f", input.compose_file);
  if (input.project_name)  argv.push("-p", input.project_name);
  argv.push("logs");
  if (input.tail !== undefined) argv.push("--tail", String(input.tail));
  if (input.follow)             argv.push("-f");
  if (input.service)            argv.push(input.service);
  return argv;
}

// ── Compose Config ────────────────────────────────────────────────────────────

function buildComposeConfigArgv(input, ctx) {
  const argv = ["docker", "compose"];
  if (input.compose_file)  argv.push("-f", input.compose_file);
  if (input.project_name)  argv.push("-p", input.project_name);
  argv.push("config", "--format", "json");
  return argv;
}

module.exports = {
  id, label, available,
  buildRunArgv, buildStopArgv, buildExecArgv, buildLogsArgv,
  buildPullArgv, buildBuildArgv, buildListArgv, buildInspectArgv,
  buildComposeUpArgv, buildComposeDownArgv, buildComposeLogsArgv, buildComposeConfigArgv
};
