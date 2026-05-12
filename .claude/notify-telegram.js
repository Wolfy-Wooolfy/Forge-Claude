// notify-telegram.js
// Sends Telegram notification when Claude Code needs approval or finishes a task
// Usage: node notify-telegram.js <event_type> [message]

const https = require("https");

// CONFIG — replace these with your values
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8712856006:AAG3q39mImVOTQv4sawwEtelhKa62ydYF3I";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "1529808546";

const eventType = process.argv[2] || "unknown";

let message = "";
let emoji = "";

// Read JSON from stdin if available (Claude Code passes event details)
let stdinData = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk) => { stdinData += chunk; });

process.stdin.on("end", () => {
  let event = {};
  try { event = stdinData ? JSON.parse(stdinData) : {}; } catch (_) {}

  const projectName = "Forge-Claude";
  const sessionId = (event.session_id || "").slice(0, 8);

  switch (eventType) {
    case "Notification":
      emoji = "🔔";
      message = `${emoji} <b>${projectName}</b> needs your attention\n\n` +
                `${event.message || "Approval required"}\n\n` +
                `Session: <code>${sessionId}</code>`;
      break;
    case "Stop":
      emoji = "✅";
      message = `${emoji} <b>${projectName}</b> finished a task\n\n` +
                `Session: <code>${sessionId}</code>\n\n` +
                `Ready for your review.`;
      break;
    case "SubagentStop":
      emoji = "🔄";
      message = `${emoji} <b>${projectName}</b> subagent finished\n\n` +
                `Session: <code>${sessionId}</code>`;
      break;
    default:
      emoji = "ℹ️";
      message = `${emoji} <b>${projectName}</b>: ${eventType}`;
  }

  sendTelegram(message);
});

// Handle case where there is no stdin
setTimeout(() => {
  if (!stdinData) {
    process.stdin.pause();
    process.stdin.emit("end");
  }
}, 500);

function sendTelegram(text) {
  const data = JSON.stringify({
    chat_id: CHAT_ID,
    text: text,
    parse_mode: "HTML"
  });

  const options = {
    hostname: "api.telegram.org",
    port: 443,
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length
    }
  };

  const req = https.request(options, (res) => {
    let body = "";
    res.on("data", (chunk) => { body += chunk; });
    res.on("end", () => {
      // Always exit 0 — never block Claude Code if notification fails
      process.exit(0);
    });
  });

  req.on("error", (err) => {
    // Silently fail — don't block Claude Code
    console.error("Telegram notification failed:", err.message);
    process.exit(0);
  });

  req.write(data);
  req.end();
}
