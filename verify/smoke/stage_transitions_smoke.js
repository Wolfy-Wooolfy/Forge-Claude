const path = require("path");

const { validateTransition } = require(path.resolve(__dirname, "../../code/src/orchestrator/stage_transitions"));

function run() {
  validateTransition("INIT", "READY");
  validateTransition("READY", "A");
  validateTransition("A", "B");
  validateTransition("B", "C");
  validateTransition("C", "D");

  validateTransition("B", "A");
  validateTransition("C", "B");
  validateTransition("D", "C");

  let failed = false;

  try {
    validateTransition("A", "C");
  } catch (_) {
    failed = true;
  }

  if (!failed) {
    throw new Error("Smoke FAIL: forbidden transition did not fail");
  }
}

run();
