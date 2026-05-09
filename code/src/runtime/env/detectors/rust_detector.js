"use strict";

const { ok, notFound } = require("../_contract");

module.exports = {
  id:    "rust",
  label: "Rust (rustc)",

  async detect(probeHelper) {
    const r = await probeHelper.probe("rustc", ["--version"]);
    if (!r || r.exit_code !== 0) return notFound("rust", "rustc not found in PATH");
    const raw     = (r.stdout || r.stderr || "").trim();
    const m       = raw.match(/rustc\s+([\d.]+[^\s]*)/i);
    const version = m ? m[1] : raw;
    return ok("rust", { version });
  }
};
