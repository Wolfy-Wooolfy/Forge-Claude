"use strict";

const fs   = require("fs");
const path = require("path");
const { validateContract, checkAuthorityDocExists } = require("./providerContract");
const { InvalidContractError }                      = require("./providerErrors");

const DEFAULT_PROVIDERS_DIR = path.resolve(__dirname, "..");

function _isLegacyClass(mod) {
  // Detects class-based providers: function/class with executeTask on prototype
  if (typeof mod !== "function") return false;
  return typeof mod.prototype.executeTask === "function";
}

function _isV2Provider(mod) {
  // Detects defineProvider() output: plain object with executeTask + getContract
  return (
    mod !== null &&
    typeof mod === "object" &&
    typeof mod.executeTask === "function" &&
    typeof mod.getContract === "function"
  );
}

function _wrapLegacy(Cls, filePath) {
  const id = path.basename(filePath, ".js");
  return {
    id,
    version: "0.0.0-legacy",
    _legacy: true,
    getContract: () => null,
    executeTask: (task) => new Cls().executeTask(task)
  };
}

function createRegistry({ root, providers_dir } = {}) {
  const resolvedRoot = root || process.cwd();
  const dir = providers_dir || DEFAULT_PROVIDERS_DIR;
  const map = new Map();
  const loadErrors = [];

  function load() {
    let files;
    try {
      files = fs.readdirSync(dir).filter(f => {
        if (!f.endsWith(".js")) return false;
        if (f === "providerRouter.js") return false;
        if (f.startsWith("_")) return false;
        return true;
      });
    } catch (err) {
      throw new Error("PROVIDER_REGISTRY_FAILED: cannot read providers directory: " + err.message);
    }

    for (const file of files) {
      const filePath = path.join(dir, file);
      let mod;
      try {
        mod = require(filePath);
      } catch (err) {
        loadErrors.push({ file: filePath, reason: "REQUIRE_FAILED", detail: err.message });
        continue;
      }

      if (_isV2Provider(mod)) {
        // v2-compliant: re-validate (defense in depth)
        let contract;
        try {
          contract = mod.getContract();
          validateContract(contract);
        } catch (err) {
          loadErrors.push({
            file: filePath,
            reason: "INVALID_CONTRACT",
            detail: err.message
          });
          continue;
        }

        // authority_doc on disk
        const docCheck = checkAuthorityDocExists(contract, { root: resolvedRoot });
        if (!docCheck.ok) {
          loadErrors.push({ file: filePath, reason: "AUTHORITY_DOC_MISSING", detail: docCheck.reason });
          continue;
        }

        if (map.has(contract.id)) {
          loadErrors.push({ file: filePath, reason: "DUPLICATE_ID", detail: "id '" + contract.id + "' already registered" });
          continue;
        }

        map.set(contract.id, mod);

      } else if (_isLegacyClass(mod)) {
        const wrapped = _wrapLegacy(mod, filePath);

        if (map.has(wrapped.id)) {
          loadErrors.push({ file: filePath, reason: "DUPLICATE_ID", detail: "id '" + wrapped.id + "' already registered" });
          continue;
        }

        map.set(wrapped.id, wrapped);

      } else {
        loadErrors.push({
          file: filePath,
          reason: "UNRECOGNISED_EXPORT",
          detail: "Not a defineProvider() result and not a class with executeTask()"
        });
      }
    }

    if (loadErrors.length > 0) {
      const summary = loadErrors.map(e => "  [" + e.reason + "] " + path.basename(e.file) + ": " + e.detail).join("\n");
      throw new Error("PROVIDER_REGISTRY_FAILED:\n" + summary);
    }

    return registry;
  }

  const registry = {
    load,
    list:   () => Array.from(map.keys()).sort(),
    get:    (id) => map.get(id) || null,
    has:    (id) => map.has(id),
    healthSummary() {
      const ids        = Array.from(map.keys()).sort();
      const legacyIds  = ids.filter(id => map.get(id)._legacy === true);
      const v2Ids      = ids.filter(id => !map.get(id)._legacy);
      return {
        total:        ids.length,
        v2_compliant: v2Ids.length,
        legacy:       legacyIds.length,
        ids,
        legacy_ids:   legacyIds,
        load_errors:  loadErrors.slice()
      };
    }
  };

  return registry;
}

let _defaultRegistry = null;

function getDefaultRegistry() {
  if (!_defaultRegistry) {
    _defaultRegistry = createRegistry({ root: process.cwd() }).load();
  }
  return _defaultRegistry;
}

function resetDefaultRegistry() {
  _defaultRegistry = null;
}

module.exports = { createRegistry, getDefaultRegistry, resetDefaultRegistry, DEFAULT_PROVIDERS_DIR };
