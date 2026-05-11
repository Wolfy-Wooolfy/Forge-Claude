"use strict";

// SU03 — cost_ledger.js unit test
// Tests: appendEntry, sumCost, readAll, validation, ordering
// Dev-only (not in official S129–S136 set).

const os   = require("os");
const path = require("path");
const fs   = require("fs");

const { appendEntry, sumCost, readAll, _ledgerPath } = require("../../../runtime/kb/cost_ledger");

const TMP_ROOT = path.join(os.tmpdir(), "forge_su03_" + Date.now());
const TEST_PID = "test_proj_su03";
const opts     = { root: TMP_ROOT };

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log("  PASS:", label);
    passed++;
  } else {
    console.error("  FAIL:", label, detail ? ("| " + detail) : "");
    failed++;
  }
}

async function run() {
  console.log("SU03 — cost_ledger append + sum");

  // Test 1: append single entry
  const e1 = appendEntry({
    project_id: TEST_PID,
    operation:  "embedding",
    cost_usd:   0.0042,
    model:      "text-embedding-3-small",
    tool:       "kb.ingest_url",
    tokens_in:  1200,
    tokens_out: 0
  }, opts);
  assert("appendEntry returns enriched entry", e1 && typeof e1.ts === "string");
  assert("entry has ts timestamp", e1.ts && e1.ts.includes("T"));

  // Test 2: ledger file exists and is valid JSONL
  const ledgerPath = _ledgerPath(TEST_PID, TMP_ROOT);
  assert("cost_ledger.jsonl created", fs.existsSync(ledgerPath));
  const line1 = fs.readFileSync(ledgerPath, "utf8").trim();
  assert("first line is valid JSON", (() => { try { JSON.parse(line1); return true; } catch(_) { return false; } })());

  // Test 3: append 4 more entries
  const costs = [0.0100, 0.0250, 0.0075, 0.0001];
  const ops   = ["web_search", "credibility_scoring", "citation_synthesis", "research_synthesis"];
  costs.forEach((c, i) => {
    appendEntry({ project_id: TEST_PID, operation: ops[i], cost_usd: c, model: "gpt-4o-mini", tool: "research.search_web" }, opts);
  });

  // Test 4: sumCost returns correct total
  const totalExpected = 0.0042 + costs.reduce((a, b) => a + b, 0);
  const { total_usd, entries } = sumCost(TEST_PID, opts);
  assert("sumCost entries = 5", entries === 5, "got " + entries);
  assert("sumCost total_usd accurate", Math.abs(total_usd - totalExpected) < 0.00001, total_usd + " vs " + totalExpected);

  // Test 5: readAll returns 5 records in insertion order
  const all = readAll(TEST_PID, opts);
  assert("readAll returns 5 records", all.length === 5, "got " + all.length);
  assert("first record is embedding op", all[0].operation === "embedding");
  assert("last record is research_synthesis op", all[4].operation === "research_synthesis");

  // Test 6: validation rejects invalid entry
  let threw = false;
  try {
    appendEntry({ project_id: TEST_PID, operation: "invalid_op", cost_usd: 0.01, model: "x", tool: "y" }, opts);
  } catch (err) {
    threw = true;
    assert("invalid operation rejected with message", err.message.includes("operation invalid"), err.message);
  }
  assert("invalid entry throws", threw);

  // Test 7: sumCost on non-existent project returns 0
  const { total_usd: t0, entries: e0 } = sumCost("does_not_exist", opts);
  assert("sumCost on empty project returns 0", t0 === 0 && e0 === 0, JSON.stringify({t0, e0}));

  // Test 8: ordering — timestamps are monotonically increasing
  const timestamps = all.map(e => new Date(e.ts).getTime());
  const monotonic  = timestamps.every((t, i) => i === 0 || t >= timestamps[i - 1]);
  assert("timestamps are monotonically non-decreasing", monotonic);

  // Cleanup
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

run().then(() => {
  console.log("\nSU03:", passed, "passed,", failed, "failed");
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error("SU03 ERROR:", err.message);
  process.exit(1);
});
