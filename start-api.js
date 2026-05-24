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

// Load .env BEFORE any module that reads process.env at construction time.
// Ambient wins: keys already set by pm2/shell are never overridden.
const path = require("path");
const { loadDotEnv } = require("./code/src/startup/env_loader");
loadDotEnv(path.resolve(__dirname));

const { createWorkspaceApiServer } = require("./code/src/workspace/apiServer");

const port = Number(
  process.env.FORGE_API_PORT ||
    process.env.FORGE_WORKSPACE_API_PORT ||
    3100
);

createWorkspaceApiServer({ port })
  .start()
  .then(({ port: actualPort, host: actualHost }) => {
    console.log(`Forge API server running at http://${actualHost}:${actualPort}`);
  })
  .catch((err) => {
    console.error("[FATAL] Failed to start Forge API server:");
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
