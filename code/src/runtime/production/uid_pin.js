"use strict";

const PIN_REL = "progress/uid_pin.json";

function _getCurrentIdentity() {
  return {
    username: process.env.USERNAME || process.env.USER || null,
    uid:      typeof process.getuid === "function" ? process.getuid() : null
  };
}

async function checkOrCreateUidPin({ root }) {
  const { getDefaultRegistry } = require("../tools/_registry");
  const reg = getDefaultRegistry();
  const ctx = { root };

  const existsResult = await reg.invoke("fs.exists", { path: PIN_REL }, ctx);
  const pinExists = existsResult &&
    existsResult.status === "SUCCESS" &&
    existsResult.output &&
    existsResult.output.exists;

  const identity = _getCurrentIdentity();

  if (!pinExists) {
    const pin = { pinned_at: new Date().toISOString(), username: identity.username, uid: identity.uid };
    await reg.invoke(
      "fs.write_file",
      { path: PIN_REL, content: JSON.stringify(pin, null, 2) + "\n" },
      ctx
    );
    return;
  }

  const readResult = await reg.invoke("fs.read_file", { path: PIN_REL }, ctx);
  if (!readResult || readResult.status !== "SUCCESS") {
    throw new Error("UID_PIN_READ_FAILED: cannot read " + PIN_REL);
  }

  let pin;
  try {
    pin = JSON.parse(readResult.output.content);
  } catch {
    throw new Error("UID_PIN_PARSE_FAILED: corrupted " + PIN_REL);
  }

  const userMismatch = identity.username !== null && pin.username !== null &&
                       identity.username !== pin.username;
  const uidMismatch  = identity.uid !== null && pin.uid !== null &&
                       identity.uid !== pin.uid;

  if (userMismatch || uidMismatch) {
    throw new Error(
      "UID_PIN_MISMATCH: server started by different user. " +
      "Expected username=" + pin.username + " uid=" + pin.uid + "; " +
      "got username=" + identity.username + " uid=" + identity.uid
    );
  }
}

module.exports = { checkOrCreateUidPin };
