"use strict";

const { ok, notFound } = require("../_contract");

// Container detector: probes docker then podman. Tolerant — absent is not an error.
module.exports = {
  id:    "container",
  label: "Container Runtime",

  async detect(probeHelper) {
    for (const binary of ["docker", "podman"]) {
      const r = await probeHelper.probe(binary, ["info"]);
      if (!r || r.exit_code !== 0) continue;
      const raw  = (r.stdout || "").trim();
      const m    = raw.match(/Server Version:\s*([\S]+)/i);
      const version = m ? m[1] : null;
      return ok("container", { runtime: binary, version });
    }
    return notFound("container", "docker/podman not found in PATH");
  }
};
