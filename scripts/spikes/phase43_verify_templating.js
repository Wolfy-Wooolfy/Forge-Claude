"use strict";
// scripts/spikes/phase43_verify_templating.js
// PHASE-43 A-4 (§T.3 / ROOT-2) — deterministic proof, $0, that the L5b harness resolves a
// {{created.id}} placeholder in the execution URL from the create-first setup response — so a
// scenario targets the id the build ACTUALLY assigned, not a hardcoded /1. The SU suite is
// mock-only and cannot exercise real HTTP, so this is the authoritative proof for the fix.
//
// Fixture server assigns NON-SEQUENTIAL ids (first id = "1001", mirroring the real build's
// id: Date.now()). Through the REAL harness_runner.runScenario, with a NEGATIVE CONTROL:
//   TPL  (placeholder)     : setup POST /notes -> execution GET /notes/{{created.id}} == 200
//   TPL-NEG (literal /1)   : setup POST /notes -> execution GET /notes/1            == 404
// WITH the fix: TPL=PASS (placeholder -> the real id 1001), TPL-NEG=FAIL (literal /1 ≠ 1001).
// The contrast proves templating targets the real created id and is decisive. NO LLM calls.
//
// Usage: node scripts/spikes/phase43_verify_templating.js

const path = require("path");
const fs   = require("fs");

const ROOT        = path.resolve(__dirname, "..", "..");
const FIXTURE_DIR = path.join(ROOT, "artifacts", "spikes", "phase43_templating_check", "proj");
const { runScenario } = require(path.join(ROOT, "code", "src", "runtime", "builtproject", "harness_runner"));

// Pure-Node fixture server with NON-SEQUENTIAL ids (first created id = "1001").
const SERVER_JS = `"use strict";
const http = require("http");
let notes = [];
let counter = 1000;
const server = http.createServer((req, res) => {
  const m = req.url.match(/^\\/notes(?:\\/([^/]+))?$/);
  if (req.method === "POST" && req.url === "/notes") {
    let b = ""; req.on("data", d => b += d); req.on("end", () => {
      let body = {}; try { body = JSON.parse(b || "{}"); } catch (_) {}
      const n = Object.assign({ id: String(++counter) }, body); notes.push(n);
      res.writeHead(201, { "Content-Type": "application/json" }); res.end(JSON.stringify(n));
    }); return;
  }
  if (req.method === "GET" && m && m[1]) {
    const n = notes.find(x => x.id === m[1]);
    if (!n) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "not found" })); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(n)); return;
  }
  res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "route" }));
});
server.listen(3000, () => console.log("Server is running on port 3000"));
`;

const START  = { type: "start_server", command: "node server.js", wait_for_port: 3000, timeout_ms: 5000 };
const CREATE = { type: "http_request", method: "POST", url: "http://localhost:3000/notes",
                 headers: { "Content-Type": "application/json" }, body: { title: "Seeded" } };
const ASSERT_200 = [{ type: "http_status_equals", expected: 200 }];

const TPL = { id: "TPL", name: "get_by_placeholder_id", category: "http",
  setup: { actions: [START, CREATE] },
  execution: { type: "http_request", method: "GET", url: "http://localhost:3000/notes/{{created.id}}",
               headers: { "Accept": "application/json" } },
  assertions: ASSERT_200, teardown: { actions: [{ type: "stop_server" }] } };
const TPL_NEG = { id: "TPL-NEG", name: "get_by_literal_1_control", category: "http",
  setup: { actions: [START, CREATE] },
  execution: { type: "http_request", method: "GET", url: "http://localhost:3000/notes/1",
               headers: { "Accept": "application/json" } },
  assertions: ASSERT_200, teardown: { actions: [{ type: "stop_server" }] } };

async function main() {
  console.log("=== PHASE-43 A-4 §T.3 — harness {{created.id}} templating proof ($0) ===");
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(path.join(FIXTURE_DIR, "server.js"), SERVER_JS, "utf8");

  console.log("TPL (execution GET /notes/{{created.id}}) running ...");
  const tpl = await runScenario(TPL, FIXTURE_DIR);
  console.log("  TPL:", tpl.status, JSON.stringify(tpl.assertions));

  console.log("TPL-NEG (execution GET /notes/1 literal, control) running ...");
  const neg = await runScenario(TPL_NEG, FIXTURE_DIR);
  console.log("  TPL-NEG:", neg.status, JSON.stringify(neg.assertions));

  const proof = tpl.status === "PASS" && neg.status === "FAIL";
  const out = {
    verdict: proof ? "PROVEN" : "NOT_PROVEN",
    interpretation: "Fixture assigns non-sequential ids (first = '1001'). TPL passes ONLY because {{created.id}} resolved to the real created id; TPL-NEG (literal /notes/1) fails 404 — proving the placeholder targets the actual created id and is decisive against a non-/1 id scheme.",
    tpl: { status: tpl.status, assertions: tpl.assertions },
    tpl_neg: { status: neg.status, assertions: neg.assertions }
  };
  fs.writeFileSync(path.join(path.dirname(FIXTURE_DIR), "templating_proof.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("\nverdict:", out.verdict, "(TPL=PASS, TPL-NEG=FAIL expected)");
  console.log("evidence: artifacts/spikes/phase43_templating_check/templating_proof.json");
  process.exit(proof ? 0 : 1);
}

main().catch(err => { console.error("TEMPLATING CHECK ERROR:", err.message); process.exit(1); });
