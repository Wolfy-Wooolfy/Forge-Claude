"use strict";

// ── _kill_switch.js ───────────────────────────────────────────────────────────
// Cost-based emergency abort for the live ratification runner.
// Polls cost_ledger every 5 seconds via agent.read_ledger (L2, no direct fs).
// Fires orchestration.abort when cumulative project cost >= THRESHOLD_USD.
//
// Track A: all reads via registry ("agent.read_ledger").
//          abort via registry ("orchestration.abort").
//          No direct fs.*, no child_process, no fetch().
//
// Usage:
//   const ks = createKillSwitch({ project_id, ctx });
//   ks.start();
//   runner.setKillSwitch(ks);   // runner calls ks.setLoopId(id) after createLoop
//   await runSomething();
//   ks.stop();

const { getDefaultRegistry } = require("../../runtime/tools/_registry");

const THRESHOLD_USD  = 4.00;  // 80% of $5 budget — leaves abort transaction headroom
const POLL_INTERVAL  = 5000;  // ms

// Sentinel error class for the CLI to detect kill-switch trigger
function KillSwitchTriggered(msg, partial_result) {
  this.name    = "KillSwitchTriggered";
  this.message = msg;
  this.partial_result = partial_result || null;
}
KillSwitchTriggered.prototype = Object.create(Error.prototype);
KillSwitchTriggered.prototype.constructor = KillSwitchTriggered;

// ── Factory ───────────────────────────────────────────────────────────────────

function createKillSwitch(opts) {
  const project_id = (opts && opts.project_id);
  const ctx        = Object.assign({}, (opts && opts.ctx) || {});

  if (!project_id) throw new Error("createKillSwitch: project_id is required");

  var _loop_id  = null;
  var _interval = null;
  var _fired    = false;
  var _reject   = null;  // promise reject from start() — used to surface the error

  // Called by the runner once loop_id is known (after orchestration.start_loop).
  function setLoopId(id) {
    _loop_id = id;
  }

  // Read total cost for this project from the ledger (project_id-filtered per CLARIFICATION 2).
  async function _readProjectCost() {
    const reg    = getDefaultRegistry();
    const result = await reg.invoke(
      "agent.read_ledger",
      { project_id },  // project_id filter ensures no cross-project contamination
      ctx
    );
    if (!result || result.status !== "SUCCESS") return 0;
    return result.output.total_cost || 0;
  }

  // Attempt abort via orchestration.abort tool.
  async function _abort(cost_usd) {
    if (!_loop_id) return;
    try {
      const reg = getDefaultRegistry();
      await reg.invoke(
        "orchestration.abort",
        {
          project_id,
          loop_id: _loop_id,
          reason:  "KILL_SWITCH_COST_THRESHOLD"
        },
        ctx
      );
    } catch (_e) { /* best-effort — abort logging is secondary to cost halt */ }
  }

  // Write a kill-switch artifact file recording the abort.
  async function _writeAbortArtifact(cost_usd) {
    if (!_loop_id) return;
    try {
      const reg  = getDefaultRegistry();
      const path = "artifacts/projects/" + project_id + "/orchestration/" +
                   _loop_id + "/live_ratification/kill_switch_abort.json";
      await reg.invoke("fs.write_file", {
        path,
        content: JSON.stringify({
          fired_at:      new Date().toISOString(),
          loop_id:       _loop_id,
          project_id,
          cost_at_abort: cost_usd,
          threshold_usd: THRESHOLD_USD,
          reason:        "KILL_SWITCH_COST_THRESHOLD"
        }, null, 2)
      }, ctx);
    } catch (_e) { /* best-effort */ }
  }

  // The poll function — runs every POLL_INTERVAL ms.
  async function _poll() {
    if (_fired) return;

    var cost;
    try {
      cost = await _readProjectCost();
    } catch (_e) {
      return; // read failure is non-fatal for polling
    }

    if (cost >= THRESHOLD_USD) {
      _fired = true;
      stop();
      await _abort(cost);
      await _writeAbortArtifact(cost);

      if (_reject) {
        _reject(new KillSwitchTriggered(
          "Kill switch triggered: project '" + project_id +
          "' cost $" + cost.toFixed(5) + " >= threshold $" + THRESHOLD_USD,
          { project_id, loop_id: _loop_id, cost_at_abort: cost }
        ));
      }
    }
  }

  // Start polling. Returns a promise that rejects if kill switch fires.
  function start() {
    return new Promise(function(resolve, reject) {
      _reject = reject;
      _interval = setInterval(function() {
        _poll().catch(function(err) {
          if (_reject) _reject(err);
        });
      }, POLL_INTERVAL);
      // Resolve is never called from here — the runner resolves the outer race()
    });
  }

  function stop() {
    if (_interval) {
      clearInterval(_interval);
      _interval = null;
    }
    _reject = null;
  }

  function hasFired() { return _fired; }

  return { setLoopId, start, stop, hasFired };
}

module.exports = { createKillSwitch, KillSwitchTriggered, THRESHOLD_USD };
