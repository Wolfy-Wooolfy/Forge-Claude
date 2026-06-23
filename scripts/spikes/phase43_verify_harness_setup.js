"use strict";
// scripts/spikes/phase43_verify_harness_setup.js
// PHASE-43 A-2 (§RA.3) — deterministic proof, $0, that the L5b harness now executes an
// http_request SETUP action before the execution request (the F1 fix in harness_runner.js).
//
// Method: a self-contained pure-Node stateful fixture server (POST /notes -> id=1; PUT/GET
// /notes/:id). Two scenarios run through the REAL harness_runner.runScenario:
//   POS (create-first): setup = [start_server, http_request POST /notes] -> PUT /notes/1 == 200
//   NEG (control)     : setup = [start_server only]                      -> PUT /notes/1 == 404
// WITH the fix: POS=PASS (the setup POST ran), NEG=FAIL. The contrast proves the new setup
// branch executes and is decisive. NO LLM calls. NO external deps (pure http).
//
// Usage: node scripts/spikes/phase43_verify_harness_setup.js

const path = require("path");
const fs   = require("fs");

const ROOT        = path.resolve(__dirname, "..", "..");
const FIXTURE_DIR = path.join(ROOT, "artifacts", "spikes", "phase43_harness_check", "proj");
const { runScenario } = require(path.join(ROOT, "code", "src", "runtime", "builtproject", "harness_runner"));

// ── Pure-Node stateful fixture server (no npm deps) ───────────────────────────
const SERVER_JS = `"use strict";
const http = require("http");
let notes = [];
let idc = 1;
const server = http.createServer((req, res) => {
  const m = req.url.match(/^\\/notes(?:\\/(\\d+))?$/);
  if (req.method === "POST" && req.url === "/notes") {
    let b = ""; req.on("data", d => b += d); req.on("end", () => {
      let body = {}; try { body = JSON.parse(b || "{}"); } catch (_) {}
      const n = Object.assign({ id: idc++ }, body); notes.push(n);
      res.writeHead(201, { "Content-Type": "application/json" }); res.end(JSON.stringify(n));
    }); return;
  }
  if (req.method === "PUT" && m && m[1]) {
    const id = parseInt(m[1], 10); const i = notes.findIndex(n => n.id === id);
    let b = ""; req.on("data", d => b += d); req.on("end", () => {
      if (i === -1) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "not found" })); return; }
      let body = {}; try { body = JSON.parse(b || "{}"); } catch (_) {}
      notes[i] = Object.assign({ id }, body);
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(notes[i]));
    }); return;
  }
  if (req.method === "GET" && m && m[1]) {
    const id = parseInt(m[1], 10); const n = notes.find(x => x.id === id);
    if (!n) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "not found" })); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(n)); return;
  }
  res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "route" }));
});
server.listen(3000, () => console.log("Server is running on port 3000"));
`;

const START = { type: "start_server", command: "node server.js", wait_for_port: 3000, timeout_ms: 5000 };
const CREATE = { type: "http_request", method: "POST", url: "http://localhost:3000/notes",
                 headers: { "Content-Type": "application/json" }, body: { title: "Seeded", content: "x" } };
const PUT_EXEC = { type: "http_request", method: "PUT", url: "http://localhost:3000/notes/1",
                   headers: { "Content-Type": "application/json" }, body: { title: "Updated" } };
const ASSERT_200 = [{ type: "http_status_equals", expected: 200 }];

const POS = { id: "H-POS", name: "update_after_create_first", category: "http",
  setup: { actions: [START, CREATE] }, execution: PUT_EXEC, assertions: ASSERT_200,
  teardown: { actions: [{ type: "stop_server" }] } };
const NEG = { id: "H-NEG", name: "update_without_create_control", category: "http",
  setup: { actions: [START] }, execution: PUT_EXEC, assertions: ASSERT_200,
  teardown: { actions: [{ type: "stop_server" }] } };

async function main() {
  console.log("=== PHASE-43 A-2 §RA.3 — harness http_request setup branch proof ($0) ===");
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(path.join(FIXTURE_DIR, "server.js"), SERVER_JS, "utf8");

  console.log("POS (setup create-first) running ...");
  const pos = await runScenario(POS, FIXTURE_DIR);
  console.log("  POS:", pos.status, JSON.stringify(pos.assertions));

  console.log("NEG (no create-first, control) running ...");
  const neg = await runScenario(NEG, FIXTURE_DIR);
  console.log("  NEG:", neg.status, JSON.stringify(neg.assertions));

  const proof = pos.status === "PASS" && neg.status === "FAIL";
  const out = {
    verdict: proof ? "PROVEN" : "NOT_PROVEN",
    interpretation: "POS passes ONLY because the http_request setup action created the resource; NEG (same scenario without that setup action) fails 404 — the new setup branch executes and is decisive.",
    pos: { status: pos.status, assertions: pos.assertions },
    neg: { status: neg.status, assertions: neg.assertions }
  };
  fs.writeFileSync(path.join(path.dirname(FIXTURE_DIR), "harness_setup_proof.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("\nverdict:", out.verdict, "(POS=PASS, NEG=FAIL expected)");
  console.log("evidence: artifacts/spikes/phase43_harness_check/harness_setup_proof.json");
  process.exit(proof ? 0 : 1);
}

main().catch(err => { console.error("HARNESS CHECK ERROR:", err.message); process.exit(1); });
