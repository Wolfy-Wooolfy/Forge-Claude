"use strict";

const fs   = require("fs");
const path = require("path");

/**
 * Reads {dir}/.env and injects KEY=value pairs into process.env.
 * Ambient wins: skips any key already present in process.env
 * (so pm2 ecosystem env block or shell exports take precedence).
 * Silently no-ops when .env is absent.
 */
function loadDotEnv(dir) {
  const envPath = path.join(dir, ".env");
  let content;
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch (_) {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

module.exports = { loadDotEnv };
