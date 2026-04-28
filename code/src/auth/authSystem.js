"use strict";

function handleAuthRequest(req, res, body, sendJson) {
  const payload = body && typeof body === "object" ? body : {};

  if (req.method === "POST" && req.url === "/api/auth/register") {
    const { username, password } = payload;
    sendJson(res, 200, {
      ok: true,
      message: "User registered",
      username: typeof username === "string" ? username : "",
      has_password: Boolean(password)
    });
    return true;
  }

  if (req.method === "POST" && req.url === "/api/auth/login") {
    const { username } = payload;
    sendJson(res, 200, {
      ok: true,
      message: "Login successful",
      username: typeof username === "string" ? username : ""
    });
    return true;
  }

  return false;
}

module.exports = {
  handleAuthRequest
};