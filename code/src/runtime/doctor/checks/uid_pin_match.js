"use strict";

const path = require("path");

const id      = "uid_pin_match";
const PIN_REL = "progress/uid_pin.json";

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
  if (currentUsername !== pin.username) {
    return {
      status: "FAIL",
      detail: "Username mismatch: pinned=" + pin.username + " current=" + currentUsername
    };
  }

  return {
    status: "PASS",
    detail: "UID pin matches current user (username=" + currentUsername + ", pinned_at=" + pin.pinned_at + ")"
  };
}

module.exports = { id, fn };
