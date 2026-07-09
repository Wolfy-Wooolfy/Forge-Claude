"use strict";
// PHASE-53 D2 — $0 hermetic probe of the relevance-floor path (mid-checkpoint evidence).
// Drives runDocumentationCitationPass directly with a scripted fake reg + _discovery seam.
// NO network, NO fs writes, NO real tools, NO provider keys needed. Six legs:
//   L1 below-floor + better source  → KEEP-BEST upgrades, exactly ONE kb.cite (R-1)
//   L2 below-floor + worse source   → keep original (never-downgrade), flagged, NO HALT
//   L3 above-floor claim            → floor evaluated, NO search, untouched
//   L4 search FAILS (offline/no key)→ keep original, flagged, claim still CITED
//   L5 two claims, same URL         → SHARED dedup: one ingest; redundant re-retrieve skipped
//   L6 zero_chunks lift < floor     → below_floor flagged, NO second attempt (R-3)
// Run: node scripts/spikes/phase53_floor_probe.js  (exit 0 = all legs green)

const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const { runDocumentationCitationPass } = require(path.join(ROOT, "code/src/ai_os/conversationEngine.js"));

const DOC_ONE_CLAIM  = "title\nThe API provides a health check endpoint for monitoring purposes.\nplain line";
const DOC_TWO_CLAIMS = "title\nThe API provides a health check endpoint for monitoring purposes.\nThe service requires a valid configuration file at startup time.\nplain line";

function chunk(rel) {
  return { chunk_id: "ch_" + rel, source_id: "src_x", text: "chunk text " + rel, relevance_score: rel, credibility_tier: "REPUTABLE" };
}

function makeFakes(opts) {
  const calls = { retrieve: 0, cite: [], search: 0, ingest: [] };
  const reg = {
    invoke: async (name, input) => {
      if (name === "kb.retrieve") {
        calls.retrieve++;
        const spec = opts.retrieveSeq[Math.min(calls.retrieve - 1, opts.retrieveSeq.length - 1)];
        if (spec === "FAIL") return { status: "FAILED", output: null };
        return { status: "SUCCESS", output: { results: spec.map(chunk) } };
      }
      if (name === "kb.cite") {
        calls.cite.push(input.chunks.map(c => c.relevance_score));
        return { status: "SUCCESS", output: { status: "OK", cit_id: "cit_x", confidence: "LOW" } };
      }
      throw new Error("unexpected reg.invoke: " + name);
    }
  };
  const discovery = {
    search: async () => {
      calls.search++;
      if (opts.searchFails) return { status: "FAILED", output: null };
      return { status: "SUCCESS", output: { results: [{ url: opts.url || "https://example.com/a", content: "web content", title: "t" }] } };
    },
    ingest: async (input) => { calls.ingest.push(input.url); return { status: "SUCCESS", output: { status: "OK", chunks_created: 1 } }; }
  };
  return { reg, discovery, calls };
}

function assert(cond, label) {
  if (!cond) { console.error("FAIL: " + label); process.exitCode = 1; }
  else console.log("PASS: " + label);
}

(async () => {
  // ── Leg 1: below-floor claim, better source found → KEEP-BEST upgrades, ONE cite ──
  {
    const f = makeFakes({ retrieveSeq: [[0.30], [0.72]] });
    const s = await runDocumentationCitationPass(f.reg, "p53", "doc.json", DOC_ONE_CLAIM, ROOT, undefined, f.discovery);
    assert(f.calls.cite.length === 1 && f.calls.cite[0][0] === 0.72, "L1 exactly ONE kb.cite, with the BETTER (0.72) set");
    assert(s.floor_checked === 1 && s.floor_below === 1 && s.floor_lifted === 1 && s.below_floor_claims === 0, "L1 counters (checked/below/lifted/flagged = 1/1/1/0)");
    const r = s.floor_claims[0];
    assert(r && r.trigger === "floor" && r.best_relevance_before === 0.30 && r.best_relevance_after === 0.72 && r.attempted && r.lifted && !r.below_floor, "L1 claim record {0.30→0.72, attempted, lifted, !below_floor}");
    assert(s.cited === 1 && s.uncited === 0 && s.discovery_searches === 1 && s.discovery_ingests === 1, "L1 cited=1, searches=1, ingests=1");
  }
  // ── Leg 2: below-floor, discovered set WORSE → keep original, flag, NO HALT ──
  {
    const f = makeFakes({ retrieveSeq: [[0.30], [0.20]] });
    const s = await runDocumentationCitationPass(f.reg, "p53", "doc.json", DOC_ONE_CLAIM, ROOT, undefined, f.discovery);
    assert(f.calls.cite.length === 1 && f.calls.cite[0][0] === 0.30, "L2 ONE kb.cite with the ORIGINAL (0.30) set — never-downgrade");
    const r = s.floor_claims[0];
    assert(r && r.best_relevance_after === 0.30 && !r.lifted && r.below_floor, "L2 record {after=0.30, !lifted, below_floor}");
    assert(s.cited === 1 && s.below_floor_claims === 1 && s.floor_lifted === 0, "L2 claim STILL CITED (no HALT), flagged");
  }
  // ── Leg 3: claim above floor → floor evaluated, NO search, untouched ──
  {
    const f = makeFakes({ retrieveSeq: [[0.80]] });
    const s = await runDocumentationCitationPass(f.reg, "p53", "doc.json", DOC_ONE_CLAIM, ROOT, undefined, f.discovery);
    assert(f.calls.search === 0 && f.calls.cite.length === 1 && f.calls.cite[0][0] === 0.80, "L3 no search; ONE cite with original set");
    assert(s.floor_checked === 1 && s.floor_below === 0 && s.floor_claims.length === 0, "L3 checked=1, below=0, no claim record");
  }
  // ── Leg 4: below-floor, search FAILS (offline / no key) → keep original, flag, cited ──
  {
    const f = makeFakes({ retrieveSeq: [[0.30]], searchFails: true });
    const s = await runDocumentationCitationPass(f.reg, "p53", "doc.json", DOC_ONE_CLAIM, ROOT, undefined, f.discovery);
    assert(f.calls.cite.length === 1 && f.calls.cite[0][0] === 0.30 && f.calls.ingest.length === 0, "L4 offline-safe: ONE cite with original, no ingest");
    const r = s.floor_claims[0];
    assert(r && r.attempted && !r.lifted && r.below_floor && s.cited === 1, "L4 attempted=true, below_floor flagged, claim CITED");
  }
  // ── Leg 5: two below-floor claims, SAME discovered URL → shared dedup, ONE ingest ──
  {
    const f = makeFakes({ retrieveSeq: [[0.30], [0.72], [0.30], [0.30]] }); // c1: 0.30→0.72; c2: 0.30, re-retrieve never reached (dedup → ingested=0)
    const s = await runDocumentationCitationPass(f.reg, "p53", "doc.json", DOC_TWO_CLAIMS, ROOT, undefined, f.discovery);
    assert(f.calls.ingest.length === 1, "L5 shared URL dedup: exactly ONE ingest across two targeted attempts");
    assert(s.discovery_searches === 2 && f.calls.cite.length === 2, "L5 two searches (one per claim), two cites (one per claim)");
    assert(s.floor_claims.length === 2 && s.floor_claims[1].below_floor === true && s.floor_claims[1].lifted === false, "L5 second claim keeps original + flagged");
    assert(f.calls.retrieve === 3, "L5 dedup-skip short-circuits the redundant re-retrieve (3 retrieves, not 4)");
  }
  // ── Leg 6 (R-3): zero_chunks lift that stays below floor → flagged, NO second attempt ──
  {
    const f = makeFakes({ retrieveSeq: [[], [0.30]] }); // first retrieve: 0 chunks → discovery; re-retrieve: 0.30
    const s = await runDocumentationCitationPass(f.reg, "p53", "doc.json", DOC_ONE_CLAIM, ROOT, undefined, f.discovery);
    assert(s.zero_chunks === 1 && s.cited === 1 && s.discovery_cited === 1, "L6 zero_chunks lift cited");
    assert(s.discovery_searches === 1 && f.calls.search === 1, "L6 exactly ONE attempt (shared across triggers — R-3)");
    const r = s.floor_claims[0];
    assert(r && r.trigger === "zero_chunks" && r.best_relevance_before === 0 && r.best_relevance_after === 0.30 && r.below_floor, "L6 record {zero_chunks, 0→0.30, below_floor}");
    assert(s.below_floor_claims === 1 && s.floor_below === 0, "L6 flagged as below_floor without polluting the floor-trigger counter");
  }
  console.log(process.exitCode ? "\nPROBE: FAILURES PRESENT" : "\nPROBE: ALL LEGS GREEN ($0, hermetic)");
})().catch(e => { console.error("PROBE CRASH:", e); process.exit(1); });
