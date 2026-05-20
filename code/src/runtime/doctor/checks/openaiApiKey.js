"use strict";

const secret_provider = require("../../secrets/secret_provider");

const MIN_LENGTH = 20;

module.exports = {
  id:          "openai_api_key",
  description: "OPENAI_API_KEY available via keychain (preferred) or environment",
  async fn(/* ctx */) {
    // Try secret_provider first (Stage 12.2 abstraction — keychain on Windows/macOS/Linux)
    try {
      const result = await secret_provider.get("openai_api_key");
      if (result && result.ok && result.value) {
        const len = result.value.length;
        if (len < MIN_LENGTH) {
          return {
            status: "FAIL",
            detail: "openai_api_key in keychain but length=" + len + " < " + MIN_LENGTH
          };
        }
        return {
          status: "PASS",
          detail: "from keychain, length=" + len
        };
      }
    } catch (_err) {
      // Fall through to env var
    }

    // Fallback: env var
    const key = process.env.OPENAI_API_KEY || "";
    if (!key) {
      return {
        status: "FAIL",
        detail: "OPENAI_API_KEY not set in keychain or environment"
      };
    }
    if (key.length < MIN_LENGTH) {
      return {
        status: "FAIL",
        detail: "OPENAI_API_KEY set in env but length=" + key.length + " < " + MIN_LENGTH
      };
    }
    return {
      status: "PASS",
      detail: "from env, length=" + key.length
    };
  }
};
