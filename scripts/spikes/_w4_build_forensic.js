"use strict";
// scripts/spikes/_w4_build_forensic.js
// PHASE-46 W-4 — shared per-attempt forensic instrumentation for the domain build drivers
// (phase43_notes_api + phase45_url_shortener). SPIKE / scripts-only — OUTSIDE the Track A live
// surface. Mock/$0; no live-surface (code/src/**) change. §ARC unaffected (stays 10).
//
// What it captures, per build→test attempt, so a (gated) real run can PROVE the W-3 A-5
// monotonic guard works (keep-best kept across attempts; a non-parsing/worse rebuild cannot
// collapse a near-pass):
//   - iteration_count           ← orchestration.get_status
//   - files_written + parse_result (rejected? REBUILD_PARSE_FAILED + parse_errors) ← buildProject return
//   - verdict + score           ← runTests return (report_summary)
//   - best_attempt record       ← artifacts/projects/<pid>/orchestration/<loopId>/best_attempt/best_attempt.json
//                                  (the W-3 keep-best snapshot; the engine's authoritative score)
//   - codegen_prompt snapshot   ← a DRIVER-LOCAL capture wrapper around the materializer's
//                                  provider adapter (the L1 trace does NOT persist the prompt —
//                                  it stores only {task_id, project_id} — and codegen goes through
//                                  the adapter path, not provider.executeTask, so there is no L1
//                                  codegen trace; the phase44-proven adapter-wrapper is the capture).
//
// The capture wrapper is registered under a DISTINCT adapter id and the driver points the
// materializer's mat_provider at it, so ONLY the codegen call is captured (the planner + every
// other hop keep their own provider). Pass-through (no behavior change); driver-local; the
// process exits at the end of each spike run, so no global mutation leaks.

const { getAdapters }   = require("../../code/src/runtime/agents/_adapter_registry");
const { defineAdapter } = require("../../code/src/runtime/agents/_adapter_contract");

const REPAIR_MARKER = "PREVIOUS BUILD ATTEMPT FAILED THESE CHECKS"; // A-5 repair block marker
// Stable prefix of the materializer codegen prompt (materializerEngine._buildCodegenPrompt L83).
// Used to capture ONLY the codegen call when wrapping a shared provider adapter in-place.
const CODEGEN_MARKER = "You are a code generator. Return STRICT JSON only";

function createForensic({ root, projectId, evidenceDir }) {
  const records  = [];   // one finalized record per attempt (build-side + test-side merged)
  const captures = [];   // codegen prompts, one per materialize invoke (most-recent = current attempt)
  let loopId = null;
  let _wrappedId   = null;   // the provider id we wrapped in-place (e.g. "mock" | "openai")
  let _wrappedReal = null;   // the original adapter, restored on uninstall

  function setLoopId(id) { loopId = id; }

  // Install a DRIVER-LOCAL capture wrapper IN-PLACE around the materializer's provider adapter
  // (e.g. "mock" | "openai"), keeping the SAME id so the mock fixture lookup (which keys on
  // input.provider, mock_adapter.js:19) and the agent.invoke vision/budget gate (which keys on
  // the "mock" provider for its bypass) are unchanged. The wrapper delegates every call to the
  // original adapter (pass-through, no behavior change) and CAPTURES only the codegen prompt
  // (filtered by CODEGEN_MARKER) — so the planner + every other hop that shares this provider are
  // captured-as-noise-free. Restored on uninstallCapture(); the spike process exits each run anyway.
  function installCapture(providerId) {
    const real = getAdapters().get(providerId);
    if (!real) throw new Error("w4 forensic: provider adapter not loaded: " + providerId);
    _wrappedId   = providerId;
    _wrappedReal = real;
    getAdapters().set(providerId, defineAdapter({
      id:    providerId,
      label: "W-4 codegen capture (in-place pass-through wrapper for " + providerId + ")",
      available: function () { return real.available ? real.available() : Promise.resolve(true); },
      invoke: function (input) {
        const prompt = (input && input.prompt) || "";
        if (prompt.indexOf(CODEGEN_MARKER) !== -1) captures.push(prompt); // only the codegen call
        return real.invoke(input); // pass-through — provider id unchanged ⇒ lookup + gate unchanged
      }
    }));
    return providerId;
  }
  function uninstallCapture() {
    if (_wrappedId && _wrappedReal) { try { getAdapters().set(_wrappedId, _wrappedReal); } catch (_) {} }
    _wrappedId = null; _wrappedReal = null;
  }

  async function _readJson(reg, relPath) {
    try {
      const r = await reg.invoke("fs.read_file", { path: relPath }, { root });
      if (r && r.status === "SUCCESS") return JSON.parse(r.output.content);
    } catch (_) { /* absent / unparseable */ }
    return null;
  }

  async function _writeText(reg, relPath, content) {
    try { await reg.invoke("fs.write_file", { path: relPath, content: content }, { root }); } catch (_) {}
  }

  // Build-side capture (call right after buildProject + its guardCost).
  async function recordBuild(reg, opts) {
    const attempt = opts.attempt;
    const b       = opts.buildResult || {};

    let iterationCount = null;
    try {
      const st = await reg.invoke("orchestration.get_status", { project_id: projectId, loop_id: loopId }, { root });
      if (st && st.status === "SUCCESS" && st.output && typeof st.output.iteration_count === "number") {
        iterationCount = st.output.iteration_count;
      }
    } catch (_) { /* leave null */ }

    const files = Array.isArray(b.files_written) ? b.files_written.map(function (f) { return f.path; }) : [];
    const parseResult = {
      rejected:     b.build_error === "REBUILD_PARSE_FAILED",
      build_error:  b.build_error || null,
      parse_errors: Array.isArray(b.parse_errors) ? b.parse_errors : null
    };

    // Codegen prompt = the most-recent capture (one materialize invoke per buildProject).
    const prompt = captures.length ? captures[captures.length - 1] : null;
    let codegenInfo = { captured: false, chars: 0, path: null, has_repair_block: false };
    if (typeof prompt === "string") {
      const rel = evidenceDir + "/codegen_prompt_attempt" + attempt + ".txt";
      await _writeText(reg, rel, prompt);
      codegenInfo = {
        captured:         true,
        chars:            prompt.length,
        path:             rel,
        has_repair_block: prompt.indexOf(REPAIR_MARKER) !== -1
      };
    }

    records.push({
      attempt:        attempt,
      iteration_count: iterationCount,
      advanced:       b.advanced === true,
      advanced_to:    b.advanced_to || null,
      files_written:  files,
      parse_result:   parseResult,
      codegen_prompt: codegenInfo,
      // test-side (filled by recordTest):
      verdict:        null,
      score:          null,
      best_attempt:   null
    });
  }

  // Test-side capture (call right after runTests + its guardCost).
  async function recordTest(reg, opts) {
    const attempt = opts.attempt;
    const rt      = opts.runResult || {};
    const rec     = records.find(function (r) { return r.attempt === attempt; });
    if (!rec) return;

    rec.verdict = {
      advanced_to:    rt.advanced_to || null,
      report_summary: rt.report_summary || null,
      test_error:     rt.test_error || null
    };
    // Driver-visible scenario-level score [pass_scenarios, -error_scenarios] (from report_summary).
    const ro = rt.report_summary || {};
    rec.score = (typeof ro.pass === "number")
      ? [ro.pass, (typeof ro.error === "number") ? -ro.error : 0]
      : null;

    // The engine's authoritative keep-best snapshot (W-3) — present only after a FAIL-branch
    // snapshot (a first-attempt PASS never snapshots ⇒ null). Its score is the 3-tuple
    // [pass_scenarios, -error_scenarios, pass_assertions].
    const best = await _readJson(reg,
      "artifacts/projects/" + projectId + "/orchestration/" + loopId + "/best_attempt/best_attempt.json");
    rec.best_attempt = (best && Array.isArray(best.score))
      ? { score: best.score, files: Array.isArray(best.files) ? best.files : [], ts: best.ts || null }
      : null;

    await _writeLog(reg); // keep forensic_log.md current even if the driver stop()s on the cap path
  }

  async function _writeLog(reg) {
    const lines = [];
    lines.push("# W-4 forensic — " + projectId);
    lines.push("");
    lines.push("Per build→test attempt: iteration_count, verdict, the W-3 keep-best snapshot score, parse-reject, and the captured codegen prompt.");
    lines.push("");
    lines.push("| attempt | it | advanced_to | files | parse_rejected | verdict_score | best.score (engine) | codegen_chars | repair_block |");
    lines.push("|--------:|---:|-------------|------:|:--------------:|:-------------:|:-------------------:|--------------:|:------------:|");
    for (const r of records) {
      lines.push("| " + r.attempt +
        " | " + (r.iteration_count == null ? "—" : r.iteration_count) +
        " | " + ((r.verdict && r.verdict.advanced_to) || r.advanced_to || "—") +
        " | " + r.files_written.length +
        " | " + r.parse_result.rejected +
        " | " + (r.score ? JSON.stringify(r.score) : "—") +
        " | " + (r.best_attempt ? JSON.stringify(r.best_attempt.score) : "—") +
        " | " + r.codegen_prompt.chars +
        " | " + r.codegen_prompt.has_repair_block + " |");
    }
    lines.push("");
    lines.push("_Note: `verdict_score` is the driver-visible scenario-level [pass, -error]; `best.score` is the engine's authoritative keep-best snapshot [pass_scenarios, -error_scenarios, pass_assertions]. A constant `best.score` across attempts with worse/equal rebuilds is the W-3 keep-best guard holding (a worse rebuild did not replace the retained best)._");
    await _writeText(reg, evidenceDir + "/forensic_log.md", lines.join("\n") + "\n");
  }

  async function finalize(reg) {
    await _writeLog(reg);
    return records;
  }

  return {
    installCapture: installCapture,
    uninstallCapture: uninstallCapture,
    setLoopId: setLoopId,
    recordBuild: recordBuild,
    recordTest: recordTest,
    finalize: finalize,
    records: records
  };
}

module.exports = { createForensic };
