const fs = require("fs");
const path = require("path");

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeString(x) {
  if (x === null || x === undefined) return "";
  return String(x);
}

function appendJsonlLine(filePath, obj) {
  const line = JSON.stringify(obj) + "\n";
  fs.appendFileSync(filePath, line, "utf8");
}

function main() {
  const repoRoot = path.resolve(__dirname, "../..");
  const outDir = path.resolve(repoRoot, "verify/smoke");
  const outPath = path.resolve(outDir, "local_command_log.jsonl");

  ensureDir(outDir);

  const argv = process.argv.slice(2);

  const entry = {
    ts: nowIso(),
    cwd: process.cwd(),
    node: process.version,
    script: "verify/smoke/local_command_logger.js",
    argv,
    env: {
      HALO_AUTONOMY: safeString(process.env.HALO_AUTONOMY),
      HALO_MAX_STEPS: safeString(process.env.HALO_MAX_STEPS),
    },
  };

  appendJsonlLine(outPath, entry);

  process.exitCode = 0;
}

main();