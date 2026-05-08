"use strict";

const fs   = require("fs");
const path = require("path");

module.exports = {
  id:          "env_dotfile",
  description: ".env file present at workspace root",
  fn(ctx) {
    const envPath = path.join(ctx.root, ".env");
    const exists  = fs.existsSync(envPath);
    return exists
      ? { status: "PASS", detail: ".env present" }
      : { status: "WARN", detail: ".env not found; relying on shell env" };
  }
};
