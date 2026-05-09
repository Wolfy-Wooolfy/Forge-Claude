"use strict";

const { ok, notFound } = require("../_contract");

// Git detector: version only. Extended state (branch, config, dirty) deferred to PHASE-11.
module.exports = {
  id:    "git",
  label: "Git",

  async detect(probeHelper) {
    const r = await probeHelper.probe("git", ["--version"]);
    if (!r || r.exit_code !== 0) return notFound("git", "git not found in PATH");
    const raw     = (r.stdout || r.stderr || "").trim();
    const m       = raw.match(/git\s+version\s+([\d.]+[^\s]*)/i);
    const version = m ? m[1] : raw;
    return ok("git", { version });
  }
};
