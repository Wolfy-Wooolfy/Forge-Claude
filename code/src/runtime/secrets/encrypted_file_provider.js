"use strict";

const crypto = require("crypto");
const os     = require("os");
const path   = require("path");

const TYPE       = "encrypted_file";
const STORE_REL  = path.join(".forge", "secrets.enc");
const SCRYPT_N   = 16384;

/**
 * Returns a fresh ctx with root = os.homedir(), used only by _loadStore() and
 * _saveStore() to scope L2 fs_tools.* calls to ~/.forge/. This is the only
 * place in Forge runtime that constructs a non-workspace ctx.root. The pattern
 * is bounded: (1) fresh object, no mutation of passed-in ctx; (2) used only for
 * private provider state at ~/.forge/secrets.enc; (3) called only from these
 * two internal methods. Future code MUST NOT extend this pattern without an
 * §ARC-style architectural decision artifact.
 */
function _homeCtx() {
  return { root: process.env.FORGE_SECRET_STORE_PATH || os.homedir() };
}

function _deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 32, { N: SCRYPT_N, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });
}

function _encrypt(plaintext, key) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct     = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return {
    iv:         iv.toString("hex"),
    ciphertext: ct.toString("hex"),
    tag:        tag.toString("hex")
  };
}

function _decrypt(entry, key) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(entry.iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(entry.tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(entry.ciphertext, "hex")),
    decipher.final()
  ]).toString("utf8");
}

async function _getMasterPassword() {
  if (process.env.FORGE_SECRET_KEY) return process.env.FORGE_SECRET_KEY;
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const readline = require("readline");
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input:  process.stdin,
        output: process.stdout
      });
      process.stdout.write("Forge master password: ");
      rl._writeToOutput = function (s) {
        if (!this._muted) process.stdout.write(s);
      };
      rl._muted = true;
      rl.question("", (answer) => {
        process.stdout.write("\n");
        rl.close();
        resolve(answer || null);
      });
    });
  }
  return null;
}

async function _loadStore() {
  const { getDefaultRegistry } = require("../tools/_registry");
  const reg    = getDefaultRegistry();
  const result = await reg.invoke("fs.read_file", { path: STORE_REL }, _homeCtx());
  if (!result || result.status !== "SUCCESS") return null;
  try { return JSON.parse(result.output.content); } catch { return null; }
}

async function _saveStore(data) {
  const { getDefaultRegistry } = require("../tools/_registry");
  const reg = getDefaultRegistry();
  await reg.invoke(
    "fs.write_file",
    { path: STORE_REL, content: JSON.stringify(data, null, 2) },
    _homeCtx()
  );
}

function isAvailable() {
  return true;
}

async function get(key) {
  const pw = await _getMasterPassword();
  if (!pw) return { ok: false, reason: "no_master_password" };

  const store = await _loadStore();
  if (!store || !store.entries) return { ok: false, reason: "not_found" };

  const entry = store.entries["forge." + key];
  if (!entry) return { ok: false, reason: "not_found" };

  try {
    const salt       = Buffer.from(store.salt, "hex");
    const derivedKey = await _deriveKey(pw, salt);
    const value      = _decrypt(entry, derivedKey);
    return { ok: true, value };
  } catch {
    return { ok: false, reason: "decrypt_failed" };
  }
}

async function set(key, value) {
  const pw = await _getMasterPassword();
  if (!pw) return { ok: false, reason: "no_master_password" };

  let store  = await _loadStore();
  const salt = store ? Buffer.from(store.salt, "hex") : crypto.randomBytes(32);
  if (!store) store = { v: 1, salt: salt.toString("hex"), entries: {} };

  try {
    const derivedKey          = await _deriveKey(pw, salt);
    store.entries["forge." + key] = _encrypt(value, derivedKey);
    await _saveStore(store);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "encrypt_failed: " + err.message };
  }
}

async function del(key) {
  const pw = await _getMasterPassword();
  if (!pw) return { ok: false, reason: "no_master_password" };

  const store = await _loadStore();
  if (!store || !store.entries || !store.entries["forge." + key]) {
    return { ok: false, reason: "not_found" };
  }

  delete store.entries["forge." + key];
  await _saveStore(store);
  return { ok: true };
}

module.exports = { get, set, delete: del, isAvailable, type: TYPE };
