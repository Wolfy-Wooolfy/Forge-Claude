"use strict";

let _provider = null;

const PROVIDER_ORDER = [
  "./windows_credential_manager",
  "./mac_keychain",
  "./linux_secret_service",
  "./encrypted_file_provider",
];

async function _resolveProvider() {
  if (_provider) return _provider;
  const forced = process.env.FORGE_SECRET_PROVIDER;
  if (forced) {
    try {
      const p = require("./" + forced);
      if (await Promise.resolve(p.isAvailable())) {
        _provider = p;
        return p;
      }
    } catch (_) {}
  }
  for (const modPath of PROVIDER_ORDER) {
    const p = require(modPath);
    const available = await Promise.resolve(p.isAvailable());
    if (available) {
      _provider = p;
      return p;
    }
  }
  return null;
}

function _resetForTest() {
  _provider = null;
}

async function get(key) {
  const p = await _resolveProvider();
  if (!p) return { ok: false, reason: "no_provider_available" };
  return p.get(key);
}

async function set(key, value) {
  const p = await _resolveProvider();
  if (!p) return { ok: false, reason: "no_provider_available" };
  return p.set(key, value);
}

async function del(key) {
  const p = await _resolveProvider();
  if (!p) return { ok: false, reason: "no_provider_available" };
  return p.delete(key);
}

async function provider_type() {
  const p = await _resolveProvider();
  if (!p) return null;
  return p.type;
}

module.exports = { get, set, delete: del, provider_type, _resetForTest };
