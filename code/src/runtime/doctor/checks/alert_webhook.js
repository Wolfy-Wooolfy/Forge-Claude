"use strict";

// Alert webhook Doctor check.
// Validates FORGE_ALERT_WEBHOOK_URL if set.
// Not configured is PASS — webhook alerts are optional.
// Malformed URL (set but not a valid http/https URL) is WARN.
// Sync fn: env-var read only, no I/O.

module.exports = {
  id: "alert_webhook",
  description: "Validates FORGE_ALERT_WEBHOOK_URL: PASS if absent or valid http(s), WARN if malformed",

  fn(/* ctx */) {
    const url = process.env.FORGE_ALERT_WEBHOOK_URL;

    if (!url) {
      return {
        status: "PASS",
        detail: "FORGE_ALERT_WEBHOOK_URL not set — webhook alerts disabled (optional; see INSTALL.md §Alerts)"
      };
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return {
        status: "WARN",
        detail: "FORGE_ALERT_WEBHOOK_URL is not a valid URL: " + url.slice(0, 80)
      };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        status: "WARN",
        detail: "FORGE_ALERT_WEBHOOK_URL protocol must be http or https (got: " + parsed.protocol + ")"
      };
    }

    return {
      status: "PASS",
      detail: "alert webhook configured: " + parsed.protocol + "//" + parsed.hostname
    };
  }
};
