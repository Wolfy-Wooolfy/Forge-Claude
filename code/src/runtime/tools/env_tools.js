"use strict";

const path    = require("path");
const fs      = require("fs");
const { spawn } = require("child_process");

const { defineTool, ok, failed, previewed } = require("./_contract");
const { getDetectors }            = require("../env/_detector_registry");
const { readCachedFingerprint, buildCachePayload, CACHE_REL_PATH } = require("../env/_cache");

// ── Probe arg allowlist ───────────────────────────────────────────────────────

const PROBE_ARG_ALLOWLIST = ["--version", "-v", "-V", "--help", "version", "info", "--info"];

const PROBE_TIMEOUT_MS = 5000;
const PROBE_MAX_BYTES  = 64 * 1024;

// ── Internal probe helper ─────────────────────────────────────────────────────

function _spawnProbe(binary, args) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(binary, args, {
        shell:  false,
        env:    process.env,   // full env for PATH discovery
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (err) {
      resolve({ stdout: "", stderr: "", exit_code: null, timed_out: false, spawn_error: err.message });
      return;
    }

    let stdout = "";
    let stderr = "";
    let killed  = false;

    const timer = setTimeout(() => {
      killed = true;
      try { proc.kill("SIGTERM"); } catch { /* ignore */ }
    }, PROBE_TIMEOUT_MS);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > PROBE_MAX_BYTES) {
        killed = true;
        try { proc.kill("SIGTERM"); } catch { /* ignore */ }
      }
    });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exit_code: killed ? null : code, timed_out: killed });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: "", exit_code: null, timed_out: false, spawn_error: err.message });
    });
  });
}

// ── Internal: build probe helper for detector use ────────────────────────────

function _makeProbeHelper() {
  return {
    async probe(binary, args) {
      const validArgs = (args || []).filter((a) => PROBE_ARG_ALLOWLIST.includes(String(a)));
      if (validArgs.length !== (args || []).length) return null; // skip if any arg blocked
      const r = await _spawnProbe(binary, validArgs);
      if (r.spawn_error || (r.exit_code === null && !r.timed_out)) return null;
      return r;
    }
  };
}

// ── Internal: run all detectors, return fingerprint map ──────────────────────

async function _runAllDetectors() {
  const detectors   = getDetectors();
  const probeHelper = _makeProbeHelper();
  const fingerprint = {};

  for (const [id, det] of detectors.entries()) {
    try {
      fingerprint[id] = await det.detect(probeHelper);
    } catch (err) {
      fingerprint[id] = { id, detected: false, data: null,
        error: { code: "PROBE_FAILED", message: err.message }, detected_at: new Date().toISOString() };
    }
  }
  return fingerprint;
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const PROBE_INPUT = {
  type: "object",
  properties: {
    binary: { type: "string" },
    args:   { type: "array", items: { type: "string" } }
  },
  required: ["binary"]
};

const PROBE_OUTPUT = {
  type: "object",
  properties: {
    stdout:    { type: "string" },
    stderr:    { type: "string" },
    exit_code: {},
    timed_out: { type: "boolean" }
  },
  required: ["stdout", "stderr", "timed_out"]
};

const DETECT_ALL_INPUT = {
  type: "object",
  properties: {
    use_cache: { type: "boolean" }
  }
};

const DETECT_ALL_OUTPUT = {
  type: "object",
  properties: {
    fingerprint: { type: "object" },
    cache_used:  { type: "boolean" },
    detected_at: { type: "string" }
  },
  required: ["fingerprint", "cache_used", "detected_at"]
};

const DETECT_ONE_INPUT = {
  type: "object",
  properties: {
    detector_id: { type: "string" }
  },
  required: ["detector_id"]
};

const DETECT_ONE_OUTPUT = {
  type: "object",
  properties: {
    id:          { type: "string" },
    detected:    { type: "boolean" },
    detected_at: { type: "string" }
  },
  required: ["id", "detected", "detected_at"]
};

const FINGERPRINT_CACHED_INPUT = { type: "object", properties: {} };

const FINGERPRINT_CACHED_OUTPUT = {
  type: "object",
  properties: {}
};

const REFRESH_INPUT = { type: "object", properties: {} };

const REFRESH_OUTPUT = {
  type: "object",
  properties: {
    fingerprint: { type: "object" },
    detected_at: { type: "string" }
  },
  required: ["fingerprint", "detected_at"]
};

// ── 1. env.probe_binary ───────────────────────────────────────────────────────

const probeBinary = defineTool({
  name:          "env.probe_binary",
  description:   "Run a binary probe (READ_ONLY). Args must be in PROBE_ARG_ALLOWLIST.",
  required_mode: "READ_ONLY",
  input_schema:  PROBE_INPUT,
  output_schema: PROBE_OUTPUT,

  async execute(input) {
    const args = Array.isArray(input.args) ? input.args : ["--version"];
    for (const a of args) {
      if (!PROBE_ARG_ALLOWLIST.includes(String(a))) {
        return failed("INVALID_PROBE_ARG", "arg '" + a + "' not in allowlist");
      }
    }
    const r = await _spawnProbe(String(input.binary), args);
    if (r.spawn_error) {
      return failed("BINARY_NOT_FOUND", r.spawn_error);
    }
    return ok({ stdout: r.stdout, stderr: r.stderr, exit_code: r.exit_code, timed_out: r.timed_out });
  }
});

// ── 2. env.detect_all ────────────────────────────────────────────────────────

const detectAll = defineTool({
  name:          "env.detect_all",
  description:   "Run all environment detectors. Returns full fingerprint. Reads cache if use_cache:true.",
  required_mode: "READ_ONLY",
  input_schema:  DETECT_ALL_INPUT,
  output_schema: DETECT_ALL_OUTPUT,

  async execute(input, ctx) {
    const root      = (ctx && ctx.root) || process.cwd();
    const useCache  = input.use_cache !== false && input.use_cache === true;

    if (useCache) {
      const cached = readCachedFingerprint(root);
      if (cached) {
        return ok({
          fingerprint: cached.fingerprint,
          cache_used:  true,
          detected_at: cached.detected_at
        });
      }
    }

    const fingerprint  = await _runAllDetectors();
    const detected_at  = new Date().toISOString();
    return ok({ fingerprint, cache_used: false, detected_at });
  }
});

// ── 3. env.detect_one ────────────────────────────────────────────────────────

const detectOne = defineTool({
  name:          "env.detect_one",
  description:   "Run a single environment detector by id.",
  required_mode: "READ_ONLY",
  input_schema:  DETECT_ONE_INPUT,
  output_schema: DETECT_ONE_OUTPUT,

  async execute(input) {
    const id       = String(input.detector_id);
    const detectors = getDetectors();
    const det       = detectors.get(id);
    if (!det) {
      return failed("DETECTOR_NOT_FOUND", "No detector registered with id '" + id + "'");
    }
    const probeHelper = _makeProbeHelper();
    let result;
    try {
      result = await det.detect(probeHelper);
    } catch (err) {
      return failed("DETECTOR_ERROR", err.message);
    }
    return ok(result);
  }
});

// ── 4. env.fingerprint_cached ─────────────────────────────────────────────────

const fingerprintCached = defineTool({
  name:          "env.fingerprint_cached",
  description:   "Return cached fingerprint if valid, null if missing or stale.",
  required_mode: "READ_ONLY",
  input_schema:  FINGERPRINT_CACHED_INPUT,
  output_schema: FINGERPRINT_CACHED_OUTPUT,

  async execute(input, ctx) {
    const root   = (ctx && ctx.root) || process.cwd();
    const cached = readCachedFingerprint(root);
    return ok(cached || { fingerprint: null, cache_used: false });
  }
});

// ── 5. env.refresh_fingerprint ───────────────────────────────────────────────

const refreshFingerprint = defineTool({
  name:          "env.refresh_fingerprint",
  description:   "Force re-run all detectors and persist fingerprint to artifacts/env/system_fingerprint.json.",
  required_mode: "WORKSPACE_WRITE",
  input_schema:  REFRESH_INPUT,
  output_schema: REFRESH_OUTPUT,

  preview() {
    return Promise.resolve(previewed({ operation: "env.refresh_fingerprint",
      note: "Would run all detectors and write artifacts/env/system_fingerprint.json" }));
  },

  async execute(input, ctx) {
    const root        = (ctx && ctx.root) || process.cwd();
    const fingerprint = await _runAllDetectors();
    const payload     = buildCachePayload(fingerprint);

    // Write the cache file directly — this tool IS the L2 write boundary.
    const cacheDir  = path.join(root, path.dirname(CACHE_REL_PATH));
    const cachePath = path.join(root, CACHE_REL_PATH);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), "utf8");

    return ok({ fingerprint, detected_at: payload.detected_at });
  }
});

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  tools: [probeBinary, detectAll, detectOne, fingerprintCached, refreshFingerprint],
  PROBE_ARG_ALLOWLIST
};
