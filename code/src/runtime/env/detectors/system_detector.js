"use strict";

const os = require("os");
const { ok } = require("../_contract");

// System detector: hardware + memory info, zero spawning.
module.exports = {
  id:    "system",
  label: "System Resources",

  async detect() {
    return ok("system", {
      cpus:         os.cpus().length,
      total_mem_mb: Math.round(os.totalmem() / (1024 * 1024)),
      free_mem_mb:  Math.round(os.freemem()  / (1024 * 1024)),
      hostname:     os.hostname()
    });
  }
};
