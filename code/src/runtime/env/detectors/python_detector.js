"use strict";

const { ok, notFound, probeFailed } = require("../_contract");

module.exports = {
  id:    "python",
  label: "Python",

  async detect(probeHelper) {
    for (const binary of ["python3", "python"]) {
      const r = await probeHelper.probe(binary, ["--version"]);
      if (!r) continue;
      if (r.exit_code !== 0) continue;
      const raw     = (r.stdout || r.stderr || "").trim();
      const version = raw.replace(/^Python\s*/i, "");
      if (!version) continue;
      return ok("python", { binary, version });
    }
    return notFound("python", "python3/python not found in PATH");
  }
};
