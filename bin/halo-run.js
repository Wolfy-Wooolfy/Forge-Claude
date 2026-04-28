#!/usr/bin/env node

const { run } = require("../code/src/orchestrator/runner");
const { resolveEntry } = require("../code/src/orchestrator/entry_resolver");

function parseMaxSteps() {
  const arg = process.argv.find(a => a.startsWith("--max-steps="));
  if (!arg) return 1;

  const value = parseInt(arg.split("=")[1], 10);
  if (isNaN(value) || value <= 0) return 1;

  return value;
}

function shouldStopFromAuthority() {
  const entry = resolveEntry();

  if (!entry) return true;
  if (entry.blocked) return true;
  if (entry.entry_type === "COMPLETE") return true;
  if (!entry.next_task) return true;

  return false;
}

async function main() {
  const maxSteps = parseMaxSteps();

  for (let i = 0; i < maxSteps; i++) {
    await run();

    if (shouldStopFromAuthority()) {
      break;
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("FORGE RUN ERROR:");
    console.error(err.message);
    process.exit(1);
  });