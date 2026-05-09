"use strict";

const os = require("os");
const { ok } = require("../_contract");

module.exports = {
  id:    "os",
  label: "Operating System",

  async detect() {
    return ok("os", {
      platform: os.platform(),
      arch:     os.arch(),
      release:  os.release(),
      type:     os.type()
    });
  }
};
