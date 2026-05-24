"use strict";

// Test helpers for S218–S219 (Stage 13.8-5 — .env parser regression guard).
// Tests the env_loader module in isolation: key loading and ambient-wins rule.

const fs   = require("fs");
const path = require("path");
const os   = require("os");

// Path to the env_loader module (created in Stage 13.8-6).
// During RED phase this module does not exist; require() throws MODULE_NOT_FOUND.
const ENV_LOADER_PATH = path.resolve(__dirname, "../../startup/env_loader");

// ── S218: key loads from .env when no ambient key is set ─────────────────────
//
// RED (before 13.8-6): code/src/startup/env_loader.js does not exist →
//   require() throws MODULE_NOT_FOUND → key_loaded stays false → fails.
// GREEN (after 13.8-6): loadDotEnv reads .env, sets process.env.OPENAI_API_KEY
//   → key_loaded is true.

async function runS218EnvKeyLoading() {
  const tempDir  = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s218-"));
  const savedKey = process.env.OPENAI_API_KEY;
  try {
    // Write a temp .env with a deterministic test key value.
    fs.writeFileSync(
      path.join(tempDir, ".env"),
      "OPENAI_API_KEY=fake-key-for-s218-test\n",
      "utf8"
    );

    // Remove the ambient key so the parser is the only possible source.
    delete process.env.OPENAI_API_KEY;

    let key_loaded = false;
    try {
      // Bust require cache so tests are independent of load order.
      delete require.cache[require.resolve(ENV_LOADER_PATH)];
      const { loadDotEnv } = require(ENV_LOADER_PATH);
      loadDotEnv(tempDir);
      key_loaded = process.env.OPENAI_API_KEY === "fake-key-for-s218-test";
    } catch (_) {
      // MODULE_NOT_FOUND (RED) or any load error — key_loaded stays false.
    }

    return { key_loaded };
  } finally {
    if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
    else delete process.env.OPENAI_API_KEY;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── S219: ambient FORGE_API_PORT is NOT overridden by .env value ──────────────
//
// Simulates pm2 injecting FORGE_API_PORT=3100 before node starts.
// The .env contains the stale FORGE_API_PORT=4100.
// "Ambient wins" rule: parser must NOT override an already-set env var.
//
// RED (before 13.8-6): env_loader.js does not exist → require() throws →
//   port_ambient_preserved stays false → fails.
// GREEN (after 13.8-6): parser runs, sees FORGE_API_PORT already set to "3100"
//   in process.env, skips the .env value → process.env.FORGE_API_PORT stays
//   "3100" → port_ambient_preserved is true.

async function runS219PortAmbientWins() {
  const tempDir   = fs.mkdtempSync(path.join(os.tmpdir(), "forge-s219-"));
  const savedPort = process.env.FORGE_API_PORT;
  try {
    // .env contains the stale conflicting value.
    fs.writeFileSync(
      path.join(tempDir, ".env"),
      "FORGE_API_PORT=4100\n",
      "utf8"
    );

    // Set the ambient value (simulating pm2's ecosystem.config.js env block).
    process.env.FORGE_API_PORT = "3100";

    let port_ambient_preserved = false;
    try {
      delete require.cache[require.resolve(ENV_LOADER_PATH)];
      const { loadDotEnv } = require(ENV_LOADER_PATH);
      loadDotEnv(tempDir);
      // Ambient wins: process.env.FORGE_API_PORT must still be "3100", not "4100".
      port_ambient_preserved = process.env.FORGE_API_PORT === "3100";
    } catch (_) {
      // MODULE_NOT_FOUND (RED) — port_ambient_preserved stays false.
    }

    return { port_ambient_preserved };
  } finally {
    if (savedPort !== undefined) process.env.FORGE_API_PORT = savedPort;
    else delete process.env.FORGE_API_PORT;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { runS218EnvKeyLoading, runS219PortAmbientWins };
