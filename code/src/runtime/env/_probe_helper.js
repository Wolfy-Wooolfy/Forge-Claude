"use strict";

const { getDefaultRegistry } = require("../tools/_registry");

/**
 * Runs env.probe_binary via the L2 tool registry.
 *
 * Returns the tool output object:
 *   { exit_code, stdout, stderr, timed_out }  — on success
 *   null                                       — if probe tool unavailable or spawn failed
 *
 * Callers should treat null as "binary not found / probe failed".
 */
async function probe(binary, args) {
  const reg = getDefaultRegistry();
  const result = await reg.invoke("env.probe_binary", { binary, args: args || [] });
  if (!result || result.status !== "SUCCESS") return null;
  return result.output || null;
}

module.exports = { probe };
