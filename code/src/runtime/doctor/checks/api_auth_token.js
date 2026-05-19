"use strict";

const id = "api_auth_token";

async function fn() {
  const sp = require("../../secrets/secret_provider");
  let result;
  try {
    result = await sp.get("forge.capability_token");
  } catch (err) {
    return { status: "WARN", detail: "secret_provider error: " + (err && err.message) };
  }
  if (result.ok && result.value && result.value.length === 64) {
    return { status: "PASS", detail: "Capability token present in secret store (64-char hex)" };
  }
  if (result.ok && result.value) {
    return {
      status: "WARN",
      detail: "Capability token found but unexpected length " + result.value.length + " (expected 64)"
    };
  }
  return {
    status: "WARN",
    detail: "Capability token not found — API server may not have been started: " +
            (result.reason || "unknown")
  };
}

module.exports = { id, fn };
