"use strict";

/**
 * Forge API Server Launcher
 * ----------------------------------------
 * هذا الملف يشغّل الـ API server بدون الحاجة لـ node -e
 * (اللي بيكسر الـ escaping في Windows batch files).
 *
 * يقرأ البورت من متغير البيئة FORGE_API_PORT أو FORGE_WORKSPACE_API_PORT
 * مع قيمة افتراضية 3100.
 */

// Guard: verify this directory is a valid Forge root before anything else.
// Hard-exits if canonical markers are missing; warns if a stale sibling copy exists.
const path = require("path");
const { assertForgeRoot } = require("./code/src/startup/forge_root_guard");
assertForgeRoot(path.resolve(__dirname));

// Load .env BEFORE any module that reads process.env at construction time.
// Ambient wins: keys already set by pm2/shell are never overridden.
const { loadDotEnv } = require("./code/src/startup/env_loader");
loadDotEnv(path.resolve(__dirname));

// W-B: hydrate OPENAI_API_KEY from the OS keychain when it is absent from env/.env.
// The plaintext key was migrated out of .env into the encrypted OS keychain via the
// §ARC-5 secret provider. env/.env still wins (ambient-wins); this only fills a gap.
// Must complete BEFORE apiServer is required/started, because openAiAdapter.getClient()
// and the legacy providers read process.env.OPENAI_API_KEY synchronously.
// No new syscall / §ARC — secret_provider is the §ARC-5 home.
const secret_provider = require("./code/src/runtime/secrets/secret_provider");

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    try {
      const r = await secret_provider.get("openai_api_key");
      if (r && r.ok && r.value) process.env.OPENAI_API_KEY = r.value;
    } catch (_) {
      // fail-open: leave unset; the adapter surfaces MISSING_API_KEY on first use.
    }
  }

  const { createWorkspaceApiServer } = require("./code/src/workspace/apiServer");

  const port = Number(
    process.env.FORGE_API_PORT ||
      process.env.FORGE_WORKSPACE_API_PORT ||
      3100
  );

  try {
    const { port: actualPort, host: actualHost } =
      await createWorkspaceApiServer({ port }).start();
    console.log(`Forge API server running at http://${actualHost}:${actualPort}`);
  } catch (err) {
    console.error("[FATAL] Failed to start Forge API server:");
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
