#!/usr/bin/env node

const { writeForgeState } = require("../code/src/forge/forge_state_writer");

try {
  const state = writeForgeState();
  console.log(JSON.stringify(state, null, 2));
  process.exit(0);
} catch (error) {
  console.error("FORGE BUILD STATE ERROR:");
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}