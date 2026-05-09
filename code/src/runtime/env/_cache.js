"use strict";

const path = require("path");
const fs   = require("fs");

const CACHE_REL_PATH      = path.join("artifacts", "env", "system_fingerprint.json");
const DEFAULT_TTL_SECONDS = 3600;

/**
 * Read cached fingerprint synchronously. Returns null if absent or expired.
 * Reading is not a side effect — direct fs read is permitted in L2 hot-path.
 */
function readCachedFingerprint(root, ttlSeconds) {
  const ttl      = (typeof ttlSeconds === "number" && ttlSeconds > 0) ? ttlSeconds : DEFAULT_TTL_SECONDS;
  const fullPath = path.join(root, CACHE_REL_PATH);
  let cached;
  try {
    cached = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch {
    return null;
  }
  if (!cached || !cached.detected_at || !cached.fingerprint) return null;

  const ageSeconds = (Date.now() - new Date(cached.detected_at).getTime()) / 1000;
  if (ageSeconds > ttl) return null;

  return cached;
}

/**
 * Build the cache payload object (no I/O). env.refresh_fingerprint.execute() writes it.
 */
function buildCachePayload(fingerprint) {
  return {
    detected_at: new Date().toISOString(),
    ttl:         DEFAULT_TTL_SECONDS,
    fingerprint
  };
}

module.exports = { readCachedFingerprint, buildCachePayload, CACHE_REL_PATH, DEFAULT_TTL_SECONDS };
