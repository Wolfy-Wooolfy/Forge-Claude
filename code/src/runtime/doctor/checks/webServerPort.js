"use strict";

const net = require("net");

module.exports = {
  id:          "web_server_port",
  description: "Web server port bindable or already in use (Forge running)",
  fn(ctx) {
    const port    = ctx.web_port || ctx.api_port || 3100;
    const apiPort = ctx.api_port || 3100;

    if (port === apiPort) {
      return { status: "PASS", detail: "web served on API port " + port };
    }

    return new Promise((resolve) => {
      const srv = net.createServer();
      let resolved = false;

      function done(result) {
        if (resolved) return;
        resolved = true;
        resolve(result);
      }

      const timer = setTimeout(() => {
        try { srv.close(); } catch (_) {}
        done({ status: "WARN", detail: "port " + port + " check timed out" });
      }, 1500);
      if (timer.unref) timer.unref();

      srv.on("error", (err) => {
        clearTimeout(timer);
        if (err.code === "EADDRINUSE") {
          done({ status: "PASS", detail: "port " + port + " in use (likely Forge running)" });
        } else {
          done({ status: "WARN", detail: "port " + port + " not bindable: " + err.code });
        }
      });

      srv.once("listening", () => {
        clearTimeout(timer);
        srv.close(() => done({ status: "PASS", detail: "port " + port + " available" }));
      });

      try {
        srv.listen(port, "127.0.0.1");
      } catch (err) {
        clearTimeout(timer);
        done({ status: "WARN", detail: "port " + port + " listen threw: " + err.code });
      }
    });
  }
};
