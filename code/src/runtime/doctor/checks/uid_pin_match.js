"use strict";

const path = require("path");
const os   = require("os");

const id      = "uid_pin_match";
const PIN_REL = "progress/uid_pin.json";

/**
 * Determines whether two identity objects refer to the same owner.
 *
 * Handles the Windows pattern where a service running as Local System
 * appears as <COMPUTERNAME>$ while an interactive session appears as
 * the human username. Both are the same owner on the same machine.
 *
 * @param {{ username: string|null }} pinned   - identity stored in uid_pin.json
 * @param {{ username: string|null }} current  - identity of the running process
 * @param {{ _platform?: string, _hostname?: string }} [_opts] - injectable for tests
 */
function isIdentityMatch(pinned, current, _opts) {
  // Exact match — fastest path, works on all platforms
  if (pinned.username === current.username) {
    return { match: true, reason: "exact" };
  }

  // Windows-only: Local System service account equivalence
  const platform = (_opts && _opts._platform) || process.platform;
  if (platform === "win32") {
    const hostname = ((_opts && _opts._hostname) || os.hostname() || "").toUpperCase();

    // Case 1: pinned is the computer account (COMPUTERNAME$), current is interactive user
    if (pinned.username && pinned.username.endsWith("$")) {
      const computerName = pinned.username.slice(0, -1).toUpperCase();
      if (computerName === hostname) {
        return {
          match:  true,
          reason: "service_account_equivalence",
          detail: "Local System service account on same machine"
        };
      }
    }

    // Case 2: reverse — current is computer account, pinned is interactive user
    if (current.username && current.username.endsWith("$")) {
      const computerName = current.username.slice(0, -1).toUpperCase();
      if (computerName === hostname) {
        return {
          match:  true,
          reason: "service_account_equivalence_reverse",
          detail: "Interactive user pinned, now running as Local System on same machine"
        };
      }
    }
  }

  return { match: false, reason: "mismatch" };
}

async function fn({ root }) {
  const { getDefaultRegistry } = require("../../tools/_registry");
  const reg = getDefaultRegistry();
  const ctx = { root: path.resolve(root || process.cwd()) };

  const existsResult = await reg.invoke("fs.exists", { path: PIN_REL }, ctx);
  const pinExists = existsResult &&
    existsResult.status === "SUCCESS" &&
    existsResult.output &&
    existsResult.output.exists;

  if (!pinExists) {
    return {
      status: "WARN",
      detail: "progress/uid_pin.json not found — API server has not been started via start() yet"
    };
  }

  const readResult = await reg.invoke("fs.read_file", { path: PIN_REL }, ctx);
  if (!readResult || readResult.status !== "SUCCESS") {
    return { status: "FAIL", detail: "Cannot read progress/uid_pin.json" };
  }

  let pin;
  try {
    pin = JSON.parse(readResult.output.content);
  } catch {
    return { status: "FAIL", detail: "progress/uid_pin.json is not valid JSON (corrupted?)" };
  }

  const currentUsername = process.env.USERNAME || process.env.USER || null;
  const matchResult = isIdentityMatch({ username: pin.username }, { username: currentUsername });

  if (!matchResult.match) {
    return {
      status: "FAIL",
      detail: "Username mismatch: pinned=" + pin.username + " current=" + currentUsername
    };
  }

  const detail = matchResult.reason === "service_account_equivalence" ||
                 matchResult.reason === "service_account_equivalence_reverse"
    ? "Service-account equivalence: pinned=" + pin.username +
      " (Local System) current=" + currentUsername +
      " on same machine (pinned_at=" + pin.pinned_at + ")"
    : "UID pin matches current user (username=" + currentUsername +
      ", pinned_at=" + pin.pinned_at + ")";

  return { status: "PASS", detail };
}

module.exports = { id, fn, isIdentityMatch };
