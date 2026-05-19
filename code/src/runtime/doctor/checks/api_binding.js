"use strict";

const id = "api_binding";

function fn() {
  const host = process.env.FORGE_BIND_HOST;
  if (!host) {
    return {
      status: "PASS",
      detail: "FORGE_BIND_HOST not set — server binds to 127.0.0.1 (secure default)"
    };
  }
  if (host === "127.0.0.1" || host === "localhost") {
    return {
      status: "PASS",
      detail: "FORGE_BIND_HOST=" + host + " (localhost binding)"
    };
  }
  return {
    status: "WARN",
    detail: "FORGE_BIND_HOST=" + host + " — server will bind to a non-localhost address"
  };
}

module.exports = { id, fn };
