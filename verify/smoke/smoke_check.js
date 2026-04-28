const { spawnSync } = require("child_process");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.error) throw r.error;
  if (typeof r.status === "number" && r.status !== 0) {
    process.exitCode = r.status;
    throw new Error(`${cmd} ${args.join(" ")} failed with exit code ${r.status}`);
  }
}

function main() {
  run("node", ["verify/smoke/local_command_logger.js", "SMOKE_CHECK_START"]);

  run("node", ["verify/smoke/runner_smoke.js"]);
  run("node", ["verify/smoke/runner_dry_run_smoke.js"]);
  run("node", ["verify/smoke/stage_transitions_smoke.js"]);
  run("node", ["verify/smoke/status_writer_smoke.js"]);

  run("node", ["verify/smoke/local_command_logger.js", "SMOKE_CHECK_END"]);
  process.exitCode = 0;
}

main();