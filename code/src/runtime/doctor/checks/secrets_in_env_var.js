"use strict";

const KNOWN_SECRET_VARS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];

module.exports = {
  id: "secrets_in_env_var",
  description: "Flags API keys found in environment variables — recommend migrating to keychain",
  fn(/* ctx */) {
    const found = KNOWN_SECRET_VARS.filter(k => process.env[k]);
    if (found.length > 0) {
      return {
        status: "WARN",
        detail: found.join(", ") + " in environment — migrate to keychain: see INSTALL.md §Secrets"
      };
    }
    const pf = process.platform;
    const likely = pf === "win32" ? "windows_credential_manager"
                 : pf === "darwin" ? "mac_keychain"
                 : "encrypted_file (or linux_secret_service if available)";
    return { status: "PASS", detail: "no secrets in environment; active provider: " + likely };
  }
};
