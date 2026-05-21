"use strict";

const path = require("path");

module.exports = {
  apps: [
    {
      name:          "forge",
      script:        "start-api.js",
      cwd:           __dirname,
      autorestart:   true,
      max_restarts:  10,
      restart_delay: 3000,
      min_uptime:    5000,
      env: {
        FORGE_API_PORT: "3100"
      },
      out_file:   path.join(__dirname, "logs", "forge-pm2-out.log"),
      error_file: path.join(__dirname, "logs", "forge-pm2-err.log"),
      time:       true
    }
  ]
};
