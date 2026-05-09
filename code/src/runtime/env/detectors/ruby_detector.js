"use strict";

const { ok, notFound } = require("../_contract");

module.exports = {
  id:    "ruby",
  label: "Ruby",

  async detect(probeHelper) {
    const r = await probeHelper.probe("ruby", ["--version"]);
    if (!r || r.exit_code !== 0) return notFound("ruby", "ruby not found in PATH");
    const raw     = (r.stdout || r.stderr || "").trim();
    const m       = raw.match(/ruby\s+([\d.]+[^\s]*)/i);
    const version = m ? m[1] : raw;
    return ok("ruby", { version });
  }
};
