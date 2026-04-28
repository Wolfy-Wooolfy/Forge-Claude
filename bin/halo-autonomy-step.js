#!/usr/bin/env node

const { run } = require("../code/src/orchestrator/runner");
const { resolveEntry } = require("../code/src/orchestrator/entry_resolver");

function fail(msg) {
  console.error(`[FORGE AUTONOMY STEP] ABORT: ${msg}`);
  process.exit(1);
}

function parseMaxSteps() {
  const v =
    process.env.FORGE_MAX_STEPS !== undefined
      ? process.env.FORGE_MAX_STEPS
      : process.env.HALO_MAX_STEPS;

  const raw = String(v || "").trim();

  if (raw === "") {
    return 1;
  }

  const n = Number(raw);

  if (!Number.isInteger(n) || n < 1) {
    fail("FORGE_MAX_STEPS (or HALO_MAX_STEPS) must be an integer >= 1");
  }

  return n;
}

function mustStopFromAuthority() {
  const entry = resolveEntry();

  if (!entry) {
    return "governed runtime entry could not be resolved";
  }

  if (entry.blocked) {
    return `governed runtime blocked: ${entry.reason || "blocked"}`;
  }

  if (entry.entry_type === "COMPLETE") {
    return "pipeline already complete";
  }

  if (!entry.next_task) {
    return "no deterministic next task";
  }

  return null;
}

function isIdempotencyViolation(err) {
  if (!err) {
    return false;
  }

  const msg = String(err.message || err);

  return msg.startsWith("Idempotency violation:");
}

async function main() {
  const autonomy =
    process.env.FORGE_AUTONOMY !== undefined
      ? process.env.FORGE_AUTONOMY
      : process.env.HALO_AUTONOMY;

  if (String(autonomy) !== "1") {
    fail("FORGE_AUTONOMY=1 (or HALO_AUTONOMY=1) is required");
  }

  const maxSteps = parseMaxSteps();

  console.log("[FORGE AUTONOMY STEP] START");
  console.log(`[FORGE AUTONOMY STEP] max_steps=${maxSteps}`);

  for (let i = 1; i <= maxSteps; i++) {
    const entry = resolveEntry();

    const stopReason = mustStopFromAuthority();
    if (stopReason) {
      console.log(`[FORGE AUTONOMY STEP] STOP at step ${i}: ${stopReason}`);
      console.log("[FORGE AUTONOMY STEP] DONE (bounded multi-step)");
      process.exit(0);
    }

    console.log(`[FORGE AUTONOMY STEP] step=${i}`);
    console.log(`[FORGE AUTONOMY STEP] next_task="${entry.next_task}"`);

    try {
      await run();
    } catch (err) {
      if (isIdempotencyViolation(err)) {
        console.log(`[FORGE AUTONOMY STEP] STOP at step ${i}: ${String(err.message || err)}`);
        console.log("[FORGE AUTONOMY STEP] DONE (bounded multi-step)");
        process.exit(0);
      }

      throw err;
    }
  }

  console.log("[FORGE AUTONOMY STEP] DONE (bounded multi-step)");
  process.exit(0);
}

main().catch((err) => {
  console.error("FORGE AUTONOMY STEP ERROR:");
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
