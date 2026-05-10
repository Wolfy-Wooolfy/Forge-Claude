"use strict";

const path = require("path");

const { defineTool, ok, failed, previewed } = require("./_contract");
const guard           = require("../container/_privilege_guard");
const { pickRuntime } = require("../container/_runtime_registry");

// Inner shell tool references — loaded at module init (shell_tools.js has no dep on container_tools).
const { tools: _shellList } = require("./shell_tools");
const _shellByName = {};
for (const t of _shellList) _shellByName[t.name] = t;
const _runInWorkspace = _shellByName["shell.run_in_workspace"];  // WORKSPACE_WRITE
const _runReadOnly    = _shellByName["shell.run_read_only"];     // READ_ONLY
const _runWithPrompt  = _shellByName["shell.run_with_prompt"];   // PROMPT

// ── §2-DG: Guard result → envelope mapping (uniform, no special cases) ────────

function _mapGuard(g, action) {
  if (g.severity === "HARD_DENY") {
    return failed("HARD_DENY", g.detail || g.reason, { rule: g.reason, action });
  }
  return failed("PROMPT_REQUIRED", g.detail || g.reason, { rule: g.reason, action });
}

// ── §2-DL: Resolve relative volume host paths to absolute before guard/argv ───

function _resolveVolumePaths(input, root) {
  if (!root || !Array.isArray(input.volumes)) return input;
  const volumes = input.volumes.map(vol => {
    if (typeof vol === "string") {
      const parts = vol.split(":");
      if (parts.length >= 2) {
        return [path.resolve(root, parts[0])].concat(parts.slice(1)).join(":");
      }
      return vol;
    }
    if (vol && typeof vol === "object" && vol.host) {
      return Object.assign({}, vol, { host: path.resolve(root, vol.host) });
    }
    return vol;
  });
  return Object.assign({}, input, { volumes });
}

// ── Common schemas ────────────────────────────────────────────────────────────

const _EXEC_OUTPUT = {
  type: "object",
  properties: {
    stdout:    { type: "string" },
    stderr:    { type: "string" },
    exit_code: {},
    action:    { type: "string" }
  },
  required: ["stdout", "action"]
};

const _ACTION_OUTPUT = {
  type: "object",
  properties: {
    action:    { type: "string" },
    exit_code: {}
  },
  required: ["action"]
};

// ── Phase A: READ_ONLY ────────────────────────────────────────────────────────

const tool_list = defineTool({
  name:          "container.list",
  description:   "List running (and optionally all) containers (READ_ONLY).",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    properties: {
      all:        { type: "boolean" },
      runtime_id: { type: "string" },
      project_id: { type: "string" }
    },
    required: ["project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      containers: { type: "array" },
      action:     { type: "string" }
    },
    required: ["containers", "action"]
  },

  async execute(input, ctx) {
    const inputGuard = guard.inspectInput(input, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "list");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "list" });

    const argv = adapter.buildListArgv(input, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "list");

    const r = await _runReadOnly.execute({ argv, project_id: input.project_id }, ctx);
    if (r.status !== "SUCCESS") return r;

    const { stdout, exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("EXECUTE_FAILED", "container list failed (exit " + exit_code + "): " + r.output.stderr.trim(), { action: "list" });
    }

    const containers = [];
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { containers.push(JSON.parse(trimmed)); } catch { containers.push({ raw: trimmed }); }
    }
    return ok({ containers, action: "list" });
  }
});

const tool_inspect = defineTool({
  name:          "container.inspect",
  description:   "Inspect a container by id or name (READ_ONLY).",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    properties: {
      container:  { type: "string" },
      runtime_id: { type: "string" },
      project_id: { type: "string" }
    },
    required: ["container", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      data:   { type: "array" },
      action: { type: "string" }
    },
    required: ["data", "action"]
  },

  async execute(input, ctx) {
    const inputGuard = guard.inspectInput(input, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "inspect");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "inspect" });

    const argv = adapter.buildInspectArgv(input, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "inspect");

    const r = await _runReadOnly.execute({ argv, project_id: input.project_id }, ctx);
    if (r.status !== "SUCCESS") return r;

    const { stdout, exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("CONTAINER_NOT_FOUND", "container inspect failed (exit " + exit_code + ")", { action: "inspect" });
    }

    let data;
    try { data = JSON.parse(stdout); } catch { data = [{ raw: stdout }]; }
    return ok({ data: Array.isArray(data) ? data : [data], action: "inspect" });
  }
});

const tool_logs = defineTool({
  name:          "container.logs",
  description:   "Read logs from a container (READ_ONLY).",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    properties: {
      container:  { type: "string" },
      tail:       { type: "number" },
      follow:     { type: "boolean" },
      timestamps: { type: "boolean" },
      runtime_id: { type: "string" },
      project_id: { type: "string" }
    },
    required: ["container", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      stdout: { type: "string" },
      stderr: { type: "string" },
      action: { type: "string" }
    },
    required: ["stdout", "action"]
  },

  async execute(input, ctx) {
    const inputGuard = guard.inspectInput(input, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "logs");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "logs" });

    const argv = adapter.buildLogsArgv(input, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "logs");

    const r = await _runReadOnly.execute({ argv, project_id: input.project_id }, ctx);
    if (r.status !== "SUCCESS") return r;

    const { stdout, stderr, exit_code } = r.output;
    if (exit_code !== 0) {
      const errMsg = (stderr || "").trim() || (stdout || "").trim();
      const reason = errMsg.includes("No such container") ? "CONTAINER_NOT_FOUND" : "EXECUTE_FAILED";
      return failed(reason, "container logs failed (exit " + exit_code + "): " + errMsg, { action: "logs" });
    }
    return ok({ stdout, stderr: stderr || "", action: "logs" });
  }
});

// ── Phase B: WORKSPACE_WRITE simple ──────────────────────────────────────────

const tool_pull = defineTool({
  name:          "container.pull",
  description:   "Pull a container image (WORKSPACE_WRITE). Image string sanitized.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      image:      { type: "string" },
      runtime_id: { type: "string" },
      project_id: { type: "string" }
    },
    required: ["image", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      action:    { type: "string" },
      exit_code: {},
      image:     { type: "string" }
    },
    required: ["action", "image"]
  },

  preview(input) {
    return Promise.resolve(previewed({ operation: "container.pull", image: input.image }));
  },

  async execute(input, ctx) {
    if (/[;&|`$()><]/.test(input.image)) {
      return failed("INVALID_IMAGE", "image string contains shell-injection characters", { action: "pull" });
    }

    const inputGuard = guard.inspectInput(input, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "pull");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "pull" });

    const argv = adapter.buildPullArgv(input, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "pull");

    const r = await _runInWorkspace.execute({ project_id: input.project_id, argv }, ctx);
    if (r.status !== "SUCCESS") return r;

    const { exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("EXECUTE_FAILED", "docker pull failed (exit " + exit_code + "): " + r.output.stderr.trim(), { action: "pull" });
    }
    return ok({ action: "pull", exit_code, image: input.image });
  }
});

const tool_stop = defineTool({
  name:          "container.stop",
  description:   "Stop a running container by id or name (WORKSPACE_WRITE).",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      container:  { type: "string" },
      timeout:    { type: "number" },
      runtime_id: { type: "string" },
      project_id: { type: "string" }
    },
    required: ["container", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      action:    { type: "string" },
      exit_code: {},
      container: { type: "string" }
    },
    required: ["action", "container"]
  },

  preview(input) {
    return Promise.resolve(previewed({ operation: "container.stop", container: input.container }));
  },

  async execute(input, ctx) {
    const inputGuard = guard.inspectInput(input, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "stop");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "stop" });

    const argv = adapter.buildStopArgv(input, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "stop");

    const r = await _runInWorkspace.execute({ project_id: input.project_id, argv }, ctx);
    if (r.status !== "SUCCESS") return r;

    const { exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("EXECUTE_FAILED", "docker stop failed (exit " + exit_code + "): " + r.output.stderr.trim(), { action: "stop" });
    }
    return ok({ action: "stop", exit_code, container: input.container });
  }
});

// ── Phase C: WORKSPACE_WRITE complex ─────────────────────────────────────────

const tool_run = defineTool({
  name:          "container.run",
  description:   "Run a container (WORKSPACE_WRITE). Detached by default. Privilege guard enforced (§2-DL). Returns container_id.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      image:        { type: "string" },
      name:         { type: "string" },
      command:      { type: "array",  items: { type: "string" } },
      ports:        { type: "array" },
      volumes:      { type: "array" },
      env:          { type: "object" },
      network:      { type: "string" },
      user:         { type: "string" },
      restart:      { type: "string" },
      privileged:   { type: "boolean" },
      cap_add:      { type: "array" },
      cap_drop:     { type: "array" },
      security_opt: { type: "array" },
      devices:      { type: "array" },
      pid:          { type: "string" },
      ipc:          { type: "string" },
      uts:          { type: "string" },
      wait:         { type: "boolean" },
      timeout_ms:   { type: "number" },
      runtime_id:   { type: "string" },
      project_id:   { type: "string" }
    },
    required: ["image", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      container_id: { type: "string" },
      action:       { type: "string" },
      exit_code:    {}
    },
    required: ["container_id", "action"]
  },

  preview(input) {
    return Promise.resolve(previewed({ operation: "container.run", image: input.image, name: input.name || null }));
  },

  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();

    // §2-DL Phase 1: inspectInput on resolved volumes (absolute paths for boundary check)
    const resolvedInput = _resolveVolumePaths(input, root);
    const inputGuard = guard.inspectInput(resolvedInput, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "run");

    // Phase 2: pickRuntime
    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "run" });

    // Phase 3: buildArgv (using resolved volume paths so docker gets absolute paths)
    const argv = adapter.buildRunArgv(resolvedInput, ctx);

    // Phase 4: inspectArgv (defense-in-depth)
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "run");

    // Phase 5: spawn via inner L2 shell tool (Track A discipline — no direct spawn)
    const r = await _runInWorkspace.execute(
      { project_id: input.project_id, argv, timeout_ms: input.timeout_ms }, ctx
    );
    if (r.status !== "SUCCESS") return r;

    // Phase 6: map result
    const { stdout, exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("EXECUTE_FAILED", "docker run failed (exit " + exit_code + "): " + r.output.stderr.trim(), { action: "run" });
    }
    return ok({ container_id: stdout.trim() || "(no id)", action: "run", exit_code });
  }
});

const tool_build = defineTool({
  name:          "container.build",
  description:   "Build a container image from a Dockerfile (WORKSPACE_WRITE). Workspace-bounded. Vision lock required.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      dockerfile_path: { type: "string" },
      context_path:    { type: "string" },
      tag:             { type: "string" },
      build_args:      { type: "object" },
      timeout_ms:      { type: "number" },
      runtime_id:      { type: "string" },
      project_id:      { type: "string" }
    },
    required: ["dockerfile_path", "context_path", "tag", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      action:    { type: "string" },
      tag:       { type: "string" },
      exit_code: {}
    },
    required: ["action", "tag"]
  },

  preview(input) {
    return Promise.resolve(previewed({ operation: "container.build", tag: input.tag, dockerfile: input.dockerfile_path }));
  },

  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();

    // Resolve file paths to absolute before guard and argv
    const dockerfile_path = path.resolve(root, input.dockerfile_path);
    const context_path    = path.resolve(root, input.context_path);
    const resolvedInput   = Object.assign({}, input, { dockerfile_path, context_path });

    const inputGuard = guard.inspectInput(resolvedInput, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "build");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "build" });

    const argv = adapter.buildBuildArgv(resolvedInput, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "build");

    const r = await _runInWorkspace.execute(
      { project_id: input.project_id, argv, timeout_ms: input.timeout_ms }, ctx
    );
    if (r.status !== "SUCCESS") return r;

    const { exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("EXECUTE_FAILED", "docker build failed (exit " + exit_code + "): " + r.output.stderr.trim(), { action: "build" });
    }
    return ok({ action: "build", tag: input.tag, exit_code });
  }
});

// ── Phase D: PROMPT ───────────────────────────────────────────────────────────

const tool_exec = defineTool({
  name:          "container.exec",
  description:   "Execute a command inside a running container (PROMPT). Per-call owner approval required.",
  required_mode: "PROMPT",
  input_schema: {
    type: "object",
    properties: {
      container:   { type: "string" },
      command:     { type: "array",  items: { type: "string" } },
      interactive: { type: "boolean" },
      tty:         { type: "boolean" },
      timeout_ms:  { type: "number" },
      runtime_id:  { type: "string" },
      project_id:  { type: "string" }
    },
    required: ["container", "command", "project_id"]
  },
  output_schema: _EXEC_OUTPUT,

  preview(input) {
    return Promise.resolve(previewed({
      operation: "container.exec",
      container: input.container,
      command:   input.command
    }));
  },

  async execute(input, ctx) {
    const inputGuard = guard.inspectInput(input, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "exec");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "exec" });

    const argv = adapter.buildExecArgv(input, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "exec");

    const r = await _runWithPrompt.execute({ argv, timeout_ms: input.timeout_ms }, ctx);
    if (r.status !== "SUCCESS") return r;

    const { stdout, stderr, exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("EXECUTE_FAILED", "docker exec failed (exit " + exit_code + ")", { action: "exec" });
    }
    return ok({ stdout, stderr: stderr || "", action: "exec", exit_code });
  }
});

// ── Phase E: Compose ──────────────────────────────────────────────────────────

const tool_compose_config = defineTool({
  name:          "container.compose_config",
  description:   "Expand a compose YAML to JSON (READ_ONLY). Canonical parser for privilege guard (§2-DH).",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    properties: {
      compose_file: { type: "string" },
      project_name: { type: "string" },
      runtime_id:   { type: "string" },
      project_id:   { type: "string" }
    },
    required: ["compose_file", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      services: { type: "object" },
      action:   { type: "string" }
    },
    required: ["services", "action"]
  },

  async execute(input, ctx) {
    const inputGuard = guard.inspectInput(input, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "compose_config");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "compose_config" });

    const argv = adapter.buildComposeConfigArgv(input, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "compose_config");

    const r = await _runReadOnly.execute({ argv, project_id: input.project_id }, ctx);
    if (r.status !== "SUCCESS") return r;

    const { stdout, exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("EXECUTE_FAILED", "compose config failed (exit " + exit_code + "): " + r.output.stderr.trim(), { action: "compose_config" });
    }

    // §2-DH probe-and-fallback: try JSON.parse; failure → UNSUPPORTED_COMPOSE_OUTPUT
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch (e) {
      return failed("UNSUPPORTED_COMPOSE_OUTPUT",
        "compose provider returned non-JSON output: " + e.message,
        { runtime_id: adapter.id, action: "compose_config" });
    }

    return ok({ services: parsed.services || {}, action: "compose_config" });
  }
});

const tool_compose_up = defineTool({
  name:          "container.compose_up",
  description:   "Start compose services (WORKSPACE_WRITE). Pre-flights compose_config + privilege guard before up.",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      compose_file: { type: "string" },
      project_name: { type: "string" },
      detach:       { type: "boolean" },
      timeout_ms:   { type: "number" },
      runtime_id:   { type: "string" },
      project_id:   { type: "string" }
    },
    required: ["compose_file", "project_id"]
  },
  output_schema: _ACTION_OUTPUT,

  preview(input) {
    return Promise.resolve(previewed({ operation: "container.compose_up", compose_file: input.compose_file }));
  },

  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const compose_file  = path.resolve(root, input.compose_file);
    const resolvedInput = Object.assign({}, input, { compose_file });

    const inputGuard = guard.inspectInput(resolvedInput, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "compose_up");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "compose_up" });

    // §2-DH pre-flight: compose_config → privilege guard on expanded JSON
    const configArgv = adapter.buildComposeConfigArgv(resolvedInput, ctx);
    const configR    = await _runReadOnly.execute({ argv: configArgv, project_id: input.project_id }, ctx);
    if (configR.status === "SUCCESS" && configR.output.exit_code === 0) {
      let configParsed;
      try {
        configParsed = JSON.parse(configR.output.stdout);
      } catch {
        return failed("UNSUPPORTED_COMPOSE_OUTPUT", "compose provider returned non-JSON output", { action: "compose_up" });
      }
      const composeGuard = guard.inspectComposeJson(configParsed, ctx);
      if (!composeGuard.ok) return _mapGuard(composeGuard, "compose_up");
    }

    const argv = adapter.buildComposeUpArgv(resolvedInput, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "compose_up");

    const r = await _runInWorkspace.execute(
      { project_id: input.project_id, argv, timeout_ms: input.timeout_ms }, ctx
    );
    if (r.status !== "SUCCESS") return r;

    const { exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("EXECUTE_FAILED", "compose up failed (exit " + exit_code + "): " + r.output.stderr.trim(), { action: "compose_up" });
    }
    return ok({ action: "compose_up", exit_code });
  }
});

const tool_compose_down = defineTool({
  name:          "container.compose_down",
  description:   "Stop and remove compose services (WORKSPACE_WRITE).",
  required_mode: "WORKSPACE_WRITE",
  input_schema: {
    type: "object",
    properties: {
      compose_file: { type: "string" },
      project_name: { type: "string" },
      volumes:      { type: "boolean" },
      timeout_ms:   { type: "number" },
      runtime_id:   { type: "string" },
      project_id:   { type: "string" }
    },
    required: ["compose_file", "project_id"]
  },
  output_schema: _ACTION_OUTPUT,

  preview(input) {
    return Promise.resolve(previewed({ operation: "container.compose_down", compose_file: input.compose_file }));
  },

  async execute(input, ctx) {
    const root = (ctx && ctx.root) || process.cwd();
    const compose_file  = path.resolve(root, input.compose_file);
    const resolvedInput = Object.assign({}, input, { compose_file });

    const inputGuard = guard.inspectInput(resolvedInput, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "compose_down");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "compose_down" });

    const argv = adapter.buildComposeDownArgv(resolvedInput, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "compose_down");

    const r = await _runInWorkspace.execute(
      { project_id: input.project_id, argv, timeout_ms: input.timeout_ms }, ctx
    );
    if (r.status !== "SUCCESS") return r;

    const { exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("EXECUTE_FAILED", "compose down failed (exit " + exit_code + "): " + r.output.stderr.trim(), { action: "compose_down" });
    }
    return ok({ action: "compose_down", exit_code });
  }
});

const tool_compose_logs = defineTool({
  name:          "container.compose_logs",
  description:   "Read logs from compose services (READ_ONLY).",
  required_mode: "READ_ONLY",
  input_schema: {
    type: "object",
    properties: {
      compose_file: { type: "string" },
      project_name: { type: "string" },
      service:      { type: "string" },
      tail:         { type: "number" },
      follow:       { type: "boolean" },
      runtime_id:   { type: "string" },
      project_id:   { type: "string" }
    },
    required: ["compose_file", "project_id"]
  },
  output_schema: {
    type: "object",
    properties: {
      stdout: { type: "string" },
      stderr: { type: "string" },
      action: { type: "string" }
    },
    required: ["stdout", "action"]
  },

  async execute(input, ctx) {
    const inputGuard = guard.inspectInput(input, ctx);
    if (!inputGuard.ok) return _mapGuard(inputGuard, "compose_logs");

    const adapter = await pickRuntime(input.runtime_id || null, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "no container runtime available", { action: "compose_logs" });

    const argv = adapter.buildComposeLogsArgv(input, ctx);
    const argvGuard = guard.inspectArgv(argv, ctx);
    if (!argvGuard.ok) return _mapGuard(argvGuard, "compose_logs");

    const r = await _runReadOnly.execute({ argv, project_id: input.project_id }, ctx);
    if (r.status !== "SUCCESS") return r;

    const { stdout, stderr, exit_code } = r.output;
    if (exit_code !== 0) {
      return failed("EXECUTE_FAILED", "compose logs failed (exit " + exit_code + ")", { action: "compose_logs" });
    }
    return ok({ stdout, stderr: stderr || "", action: "compose_logs" });
  }
});

// ── Export: 12 tools ──────────────────────────────────────────────────────────

module.exports = {
  tools: [
    tool_list,
    tool_inspect,
    tool_logs,
    tool_pull,
    tool_stop,
    tool_run,
    tool_build,
    tool_exec,
    tool_compose_config,
    tool_compose_up,
    tool_compose_down,
    tool_compose_logs
  ]
};
