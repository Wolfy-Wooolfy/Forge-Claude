"use strict";

/**
 * Smoke test — PHASE-5 Self-Test Harness (meta level)
 * Tests the harness infrastructure itself, not the application logic.
 * Run: node verify/smoke/test_harness_meta.js
 * Expected: all assertions PASS
 */

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");

// ── Harness ───────────────────────────────────────────────────────────────────

let total  = 0;
let passed = 0;

function check(label, condition, detail) {
  total++;
  if (condition) {
    console.log("  PASS  " + label);
    passed++;
  } else {
    console.error("  FAIL  " + label + (detail ? " — " + detail : ""));
  }
}

function printSummary() {
  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("Result: " + passed + "/" + total + " passed");
  if (passed < total) {
    console.error("FAILED: " + (total - passed) + " assertion(s)");
    process.exit(1);
  } else {
    console.log("All assertions PASS");
    process.exit(0);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log("\n── PHASE-5 Self-Test Harness Meta Smoke Test ────────────────────\n");

  // ── M1: scenario files exist and are valid JSON ───────────────────────────
  console.log("M1: 82 scenario JSON files present and parse");
  {
    const scenDir = path.join(ROOT, "code", "src", "testing", "scenarios");
    const files   = fs.existsSync(scenDir)
      ? fs.readdirSync(scenDir).filter((f) => f.endsWith(".json")).sort()
      : [];

    check("M1 exactly 82 scenario files",
      files.length === 82,
      "found " + files.length);

    let allParsed = true;
    for (const f of files) {
      try {
        JSON.parse(fs.readFileSync(path.join(scenDir, f), "utf8"));
      } catch (e) {
        allParsed = false;
        console.error("     parse error in " + f + ": " + e.message);
      }
    }
    check("M1 all scenario files parse as valid JSON", allParsed);

    const ids = files.map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(scenDir, f), "utf8")).id;
      } catch { return null; }
    });
    const expectedIds = ["S01","S02","S03","S04","S05","S06","S07","S08","S09","S10","S11","S12","S13","S14","S15","S16","S17","S18","S19","S20","S21","S22","S23","S24","S25","S26","S27","S28","S29","S30","S31","S32","S33","S34","S35","S36","S37","S38","S39","S40","S41","S42","S43","S44","S45","S46","S47","S48","S49","S50","S51","S52","S53","S54","S55","S56","S57","S58","S59","S60","S61","S62","S63","S64","S65","S66","S67","S68","S69","S70","S71","S72","S73","S74","S75","S76","S77","S78","S79","S80","S81","S82"];
    const allIds = expectedIds.every((id) => ids.includes(id));
    check("M1 all expected IDs present (S01–S82)", allIds,
      "missing: " + expectedIds.filter((id) => !ids.includes(id)).join(", "));
  }

  // ── M2: mock OpenAI service starts and returns a response ─────────────────
  console.log("\nM2: MockOpenAiService starts and returns canned response");
  {
    const { MockOpenAiService } = require(
      path.join(ROOT, "code", "src", "testing", "mock_openai_service")
    );
    const svc = await MockOpenAiService.start({
      "TEST": { tool_name: "test_tool", args: { key: "value" } }
    });

    check("M2 service starts and has url",
      typeof svc.url === "string" && svc.url.startsWith("http://127.0.0.1:"),
      "url=" + svc.url);

    let responseOk = false;
    try {
      const http = require("http");
      const u    = new URL(svc.url + "/v1/chat/completions");
      const body = JSON.stringify({ _forge_scenario_id: "TEST", messages: [] });
      const resp = await new Promise((resolve, reject) => {
        const req = http.request(
          { hostname: u.hostname, port: Number(u.port), path: u.pathname,
            method: "POST", headers: { "Content-Type": "application/json" } },
          (res) => {
            let d = "";
            res.on("data", (c) => { d += c; });
            res.on("end",  () => {
              try {
                const parsed = JSON.parse(d);
                resolve(parsed);
              } catch { resolve(null); }
            });
          }
        );
        req.on("error", reject);
        req.write(body);
        req.end();
      });

      if (resp && resp.choices && resp.choices[0] &&
          resp.choices[0].message &&
          Array.isArray(resp.choices[0].message.tool_calls) &&
          resp.choices[0].message.tool_calls[0].function.name === "test_tool") {
        responseOk = true;
      }
    } catch (e) {
      console.error("     fetch error: " + e.message);
    }

    check("M2 mock returns correct tool_calls response", responseOk);
    await svc.close();
  }

  // ── M3: assertion registry loads all types ─────────────────────────────────
  console.log("\nM3: assertion registry loads 9 assertion types");
  {
    const assertDir  = path.join(ROOT, "code", "src", "testing", "assertions");
    const jsFiles    = fs.existsSync(assertDir)
      ? fs.readdirSync(assertDir).filter((f) => f.endsWith(".js") && f !== "_registry.js")
      : [];

    check("M3 9 assertion files present",
      jsFiles.length === 9,
      "found " + jsFiles.length + ": " + jsFiles.join(", "));

    const { runAssertion } = require(path.join(assertDir, "_registry"));
    const knownTypes = [
      "status_equals", "response_contains", "state_field_equals", "tool_called",
      "tool_not_called", "active_state", "artifact_exists", "audit_count",
      "state_field_exists"
    ];
    const allLoaded = knownTypes.every((type) => {
      const r = runAssertion({ type, expected: "__noop__", field: "x" }, {}, { root: ROOT });
      return typeof r.detail === "string" &&
             !r.detail.startsWith("unknown assertion type:");
    });
    check("M3 all 9 assertion types run without 'unknown type' error", allLoaded);
  }

  // ── M4: runScenarios returns stable report schema ─────────────────────────
  console.log("\nM4: runScenarios returns stable report schema");
  {
    const { runScenarios } = require(
      path.join(ROOT, "code", "src", "testing", "scenario_runner")
    );
    const report = await runScenarios({ root: ROOT });

    check("M4 schema_version == '1.0'",
      report.schema_version === "1.0",
      "got " + report.schema_version);

    check("M4 report has ok (boolean)",
      typeof report.ok === "boolean",
      "got " + typeof report.ok);

    check("M4 report has counts object",
      report.counts && typeof report.counts.pass === "number",
      "got " + JSON.stringify(report.counts));

    check("M4 report has 82 scenarios",
      Array.isArray(report.scenarios) && report.scenarios.length === 82,
      "got " + (report.scenarios ? report.scenarios.length : "no array"));
  }

  // ── M5: non-container scenarios do not SKIP ───────────────────────────────
  // Container scenarios (S58–S70) may SKIP when docker/podman daemon is absent.
  console.log("\nM5: non-container scenarios do not SKIP (container SKIPs allowed)");
  {
    const { runScenarios } = require(
      path.join(ROOT, "code", "src", "testing", "scenario_runner")
    );
    const report = await runScenarios({ root: ROOT });

    // Container IDs that legitimately SKIP without a runtime
    const CONTAINER_IDS = new Set(["S58","S59","S60","S61","S62","S63","S64","S65","S66","S67","S68","S69","S70"]);
    const unexpectedSkips = report.scenarios
      .filter((s) => s.status === "SKIP" && !CONTAINER_IDS.has(s.id))
      .map((s) => s.id)
      .sort();

    check("M5 no non-container scenarios SKIP",
      unexpectedSkips.length === 0,
      "unexpected SKIPs: " + unexpectedSkips.join(", "));

    const containerSkips = report.scenarios
      .filter((s) => s.status === "SKIP" && CONTAINER_IDS.has(s.id))
      .map((s) => s.id);
    if (containerSkips.length > 0) {
      console.log("  INFO  " + containerSkips.length + " container scenario(s) SKIP (no docker/podman): " + containerSkips.join(", "));
    }
  }

  // ── M6: no FAIL scenarios ─────────────────────────────────────────────────
  console.log("\nM6: report.ok is true (no FAIL scenarios)");
  {
    const { runScenarios } = require(
      path.join(ROOT, "code", "src", "testing", "scenario_runner")
    );
    const report = await runScenarios({ root: ROOT });
    const failIds = report.scenarios
      .filter((s) => s.status === "FAIL")
      .map((s) => s.id);

    check("M6 report.ok === true",
      report.ok === true,
      "failed: " + failIds.join(", "));
  }

  printSummary();
})().catch((err) => {
  console.error("Smoke test runner threw:", err);
  process.exit(2);
});
