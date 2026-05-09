"use strict";

/**
 * Detector contract.
 *
 * Every detector module must export:
 *   id:      string   — unique machine identifier (e.g. "node", "os")
 *   label:   string   — human label (e.g. "Node.js")
 *   detect:  async (probeHelper) => DetectorResult
 *
 * DetectorResult shape:
 *   { id, detected: bool, data: object|null, error: object|null, detected_at: ISOString }
 *
 * - detected=true  → binary/runtime found; `data` contains version + metadata
 * - detected=false → not found or probe failed; `error` contains { code, message }
 */

function buildResult(id, detected, data, error) {
  return {
    id,
    detected: !!detected,
    data:     data  || null,
    error:    error || null,
    detected_at: new Date().toISOString()
  };
}

function ok(id, data) {
  return buildResult(id, true, data, null);
}

function notFound(id, message) {
  return buildResult(id, false, null, { code: "NOT_FOUND", message: message || id + " not found" });
}

function probeFailed(id, message) {
  return buildResult(id, false, null, { code: "PROBE_FAILED", message: String(message) });
}

module.exports = { ok, notFound, probeFailed, buildResult };
