"use strict";

const VALID_PROVIDER_TYPES = [
  "windows_credential_manager",
  "mac_keychain",
  "linux_secret_service",
  "encrypted_file"
];

async function runS193SecretProviderContract() {
  const sp = require("../../runtime/secrets/secret_provider");
  const type = await sp.provider_type();
  return {
    exports_get:           typeof sp.get           === "function",
    exports_set:           typeof sp.set           === "function",
    exports_delete:        typeof sp.delete        === "function",
    exports_provider_type: typeof sp.provider_type === "function",
    provider_type:         type,
    provider_type_valid:   VALID_PROVIDER_TYPES.includes(type)
  };
}

function runS194WindowsCMContract() {
  const wm = require("../../runtime/secrets/windows_credential_manager");
  // On Windows, isAvailable() must return true. On other platforms, skip the check.
  const win_availability_ok = process.platform === "win32"
    ? wm.isAvailable() === true
    : true;
  return {
    exports_get:          typeof wm.get          === "function",
    exports_set:          typeof wm.set          === "function",
    exports_delete:       typeof wm.delete       === "function",
    exports_is_available: typeof wm.isAvailable  === "function",
    type_correct:         wm.type === "windows_credential_manager",
    win_availability_ok
  };
}

async function runS195CryptoRoundTrip() {
  const crypto = require("crypto");
  const password = "test-master-password";
  const salt     = crypto.randomBytes(32);

  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });

  const plaintext = "sk-test-api-key-12345";
  const iv        = crypto.randomBytes(12);
  const cipher    = crypto.createCipheriv("aes-256-gcm", derivedKey, iv);
  const ct        = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag       = cipher.getAuthTag();

  const decipher  = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");

  return {
    round_trip_ok: decrypted === plaintext,
    algorithm:     "aes-256-gcm",
    kdf:           "scrypt"
  };
}

async function runS196SecretsInEnvVarCheck() {
  const { runDoctor } = require("../../runtime/doctor/runDoctor");
  const result = await runDoctor();
  const check  = result.checks.find(c => c.id === "secrets_in_env_var");
  return {
    doctor_ran:           !!result,
    secrets_check_present: !!check,
    status_valid:         check ? ["PASS", "WARN", "FAIL"].includes(check.status) : false,
    status:               check ? check.status : null
  };
}

module.exports = {
  runS193SecretProviderContract,
  runS194WindowsCMContract,
  runS195CryptoRoundTrip,
  runS196SecretsInEnvVarCheck
};
