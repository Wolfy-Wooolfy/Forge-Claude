"use strict";

const { ok, notFound } = require("../_contract");

module.exports = {
  id:    "go",
  label: "Go",

  async detect(probeHelper) {
    const r = await probeHelper.probe("go", ["version"]);
    if (!r || r.exit_code !== 0) return notFound("go", "go not found in PATH");
    const raw = (r.stdout || r.stderr || "").trim();
    const m   = raw.match(/go\s+version\s+go([\d.]+[^\s]*)/i);
    const version = m ? m[1] : raw;
    return ok("go", { version });
  }
};
