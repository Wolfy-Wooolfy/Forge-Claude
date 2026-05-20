"use strict";

// Per §ARC convention, test helpers may use require() directly.

async function runS212OpenaiApiKeyConsultsKeychain() {
  const Module = require("module");
  const originalLoad = Module._load;

  const fakeProvider = {
    _stored: null,
    async get() { return this._stored ? { ok: true, value: this._stored } : { ok: false, reason: "not_found" }; }
  };

  // Inject fake secret_provider so the check doesn't hit the real keychain
  Module._load = function (request, parent, ...rest) {
    if (request.endsWith("secrets/secret_provider") || request.endsWith("../../secrets/secret_provider")) {
      return fakeProvider;
    }
    return originalLoad.call(this, request, parent, ...rest);
  };

  const checkPath = require.resolve("../../runtime/doctor/checks/openaiApiKey");

  let case1_keychain_present_passes    = false;
  let case2_keychain_absent_env_present = false;
  let case3_neither_returns_fail        = false;

  try {
    // Case 1: keychain has a plausible key (32 chars)
    fakeProvider._stored = "sk-test-keychain-1234567890abcdef";
    delete require.cache[checkPath];
    const r1 = await require(checkPath).fn();
    case1_keychain_present_passes = r1.status === "PASS" && /keychain/i.test(r1.detail);

    // Case 2: keychain empty, env has plausible key
    fakeProvider._stored = null;
    const savedEnv = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-env-1234567890abcdef";
    delete require.cache[checkPath];
    const r2 = await require(checkPath).fn();
    case2_keychain_absent_env_present = r2.status === "PASS" && /env/i.test(r2.detail);
    if (savedEnv !== undefined) {
      process.env.OPENAI_API_KEY = savedEnv;
    } else {
      delete process.env.OPENAI_API_KEY;
    }

    // Case 3: neither keychain nor env
    fakeProvider._stored = null;
    const saved3 = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete require.cache[checkPath];
    const r3 = await require(checkPath).fn();
    case3_neither_returns_fail = r3.status === "FAIL";
    if (saved3 !== undefined) {
      process.env.OPENAI_API_KEY = saved3;
    }
  } finally {
    Module._load = originalLoad;
    delete require.cache[checkPath];
  }

  return {
    case1_keychain_present_passes,
    case2_keychain_absent_env_present,
    case3_neither_returns_fail
  };
}

module.exports = { runS212OpenaiApiKeyConsultsKeychain };
