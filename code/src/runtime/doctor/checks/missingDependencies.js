"use strict";

const fs   = require("fs");
const path = require("path");

module.exports = {
  id:          "missing_dependencies",
  description: "npm dependencies present in node_modules",
  fn(ctx) {
    const pkgPath = path.join(ctx.root, "package.json");

    if (!fs.existsSync(pkgPath)) {
      return { status: "WARN", detail: "package.json not found at root" };
    }

    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    } catch (err) {
      return { status: "FAIL", detail: "package.json parse error: " + err.message };
    }

    const required = Object.keys(pkg.dependencies         || {});
    const optional = Object.keys(pkg.optionalDependencies || {});
    const nmDir    = path.join(ctx.root, "node_modules");

    const missingRequired = required.filter(
      (name) => !fs.existsSync(path.join(nmDir, name, "package.json"))
    );
    const missingOptional = optional.filter(
      (name) => !fs.existsSync(path.join(nmDir, name, "package.json"))
    );

    if (missingRequired.length > 0) {
      return {
        status: "FAIL",
        detail: "missing required: " + missingRequired.join(", ")
      };
    }
    if (missingOptional.length > 0) {
      return {
        status: "WARN",
        detail: "missing optional: " + missingOptional.join(", ")
      };
    }

    const total = required.length + optional.length;
    return { status: "PASS", detail: total + " dependencies present" };
  }
};
