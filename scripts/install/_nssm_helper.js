/**
 * DEPRECATED 2026-05-21 — superseded by INSTALL_FORGE.bat / RUN_FORGE.bat + pm2.
 * Reason: NSSM 2014 binary surfaced 7 Windows-compat bugs (B1-B7) +
 * orphan-process bug (B8). Replaced with two-file pm2 setup.
 * Authority: DECISION-2026-05-21-pm2-two-file-setup-supersedes-nssm.md
 * Retained for audit trail only. Do not run.
 */
"use strict";

/**
 * Shared NSSM version detection.
 *
 * NSSM 2.24 (2014 Windows binary) exits non-zero on `nssm version`
 * AND may emit UTF-16 LE on piped stderr. Capture raw Buffers and
 * try multiple decodings — never assume UTF-8.
 *
 * §ARC-3 extension: execSync (nssm version).
 * Authority: stage_12_7_amended_mid.md §18 (Bug B4).
 */

const { execSync } = require("child_process");

/**
 * Decode a raw Buffer from NSSM output, trying encodings in order.
 * Exported for unit testing without spawning a real NSSM process.
 *
 * @param {Buffer} combined  Raw bytes (stdout + stderr concatenated).
 * @returns {{ ok: true, encoding: string, versionLine: string }
 *          |{ ok: false, error: string, rawHex: string, utf8: string }}
 */
function _decodeNssmBuffer(combined) {
  const encodings = ["utf8", "utf16le", "latin1", "ascii"];
  for (const enc of encodings) {
    const decoded = combined.toString(enc);
    if (decoded.includes("2.24")) {
      const versionLine = decoded.split(/\r?\n/).find((l) => l.includes("Version "));
      return { ok: true, encoding: enc, versionLine: (versionLine || "NSSM 2.24").trim() };
    }
  }
  return {
    ok: false,
    error: "NSSM version check failed — '2.24' not found in any tested encoding",
    rawHex: Array.from(combined.slice(0, 100)).map((b) => b.toString(16).padStart(2, "0")).join(" "),
    utf8: combined.toString("utf8").slice(0, 200)
  };
}

/**
 * Run `nssm version` and return a decoded result.
 *
 * @param {string} nssmPath  Absolute path to nssm.exe.
 * @returns {{ ok: true, encoding: string, versionLine: string }
 *          |{ ok: false, error: string, rawHex: string, utf8: string }}
 */
function verifyNssmVersion(nssmPath) {
  let stdoutBuf = Buffer.alloc(0);
  let stderrBuf = Buffer.alloc(0);

  try {
    const result = execSync('"' + nssmPath + '" version', {
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (result) stdoutBuf = Buffer.isBuffer(result) ? result : Buffer.from(result);
  } catch (err) {
    if (err.stdout) stdoutBuf = Buffer.isBuffer(err.stdout) ? err.stdout : Buffer.from(err.stdout);
    if (err.stderr) stderrBuf = Buffer.isBuffer(err.stderr) ? err.stderr : Buffer.from(err.stderr);
  }

  const combined = Buffer.concat([stdoutBuf, stderrBuf]);
  return _decodeNssmBuffer(combined);
}

module.exports = { verifyNssmVersion, _decodeNssmBuffer };
