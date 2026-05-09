"use strict";

const { ok, notFound } = require("../_contract");

module.exports = {
  id:    "php",
  label: "PHP",

  async detect(probeHelper) {
    const r = await probeHelper.probe("php", ["--version"]);
    if (!r || r.exit_code !== 0) return notFound("php", "php not found in PATH");
    const raw     = (r.stdout || r.stderr || "").trim();
    const m       = raw.match(/PHP\s+([\d.]+[^\s]*)/i);
    const version = m ? m[1] : raw.split("\n")[0];
    return ok("php", { version });
  }
};
