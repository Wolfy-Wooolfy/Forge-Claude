"use strict";

// SU04 — _id_minting.js unit test

const { srcId, chkId, citId, findId } = require("../../../runtime/kb/_id_minting");

let passed = 0, failed = 0;

function assert(label, condition, detail) {
  if (condition) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label, detail ? ("| " + detail) : ""); failed++; }
}

console.log("SU04 — _id_minting");

// srcId
const s1 = srcId("https://docs.python.org/3/");
const s2 = srcId("https://docs.python.org/3/");
const s3 = srcId("https://different.url/");
assert("srcId format: src_<12hex>", /^src_[a-f0-9]{12}$/.test(s1), s1);
assert("srcId deterministic (same input → same output)", s1 === s2);
assert("srcId different inputs → different IDs", s1 !== s3);

// chkId
const c = chkId("src_aabbccddeeff", 0);
const c5 = chkId("src_aabbccddeeff", 5);
assert("chkId format: chk_<8hex>_N", /^chk_[a-f0-9]{8}_[0-9]+$/.test(c), c);
assert("chkId ordinal 0 → chk_...._0", c.endsWith("_0"));
assert("chkId ordinal 5 → chk_...._5", c5.endsWith("_5"));
assert("chkId deterministic", chkId("src_aabbccddeeff", 3) === chkId("src_aabbccddeeff", 3));
assert("chkId different ordinal → different ID", c !== c5);

// citId
const cit1 = citId("JWT tokens must expire within 60 minutes.", ["chk_aabbccdd_0", "chk_aabbccdd_1"]);
const cit2 = citId("JWT tokens must expire within 60 minutes.", ["chk_aabbccdd_1", "chk_aabbccdd_0"]);
const cit3 = citId("Different claim.", ["chk_aabbccdd_0"]);
assert("citId format: cit_<12hex>", /^cit_[a-f0-9]{12}$/.test(cit1), cit1);
assert("citId chunk order doesn't matter (sorted)", cit1 === cit2);
assert("citId different claim → different ID", cit1 !== cit3);

// findId
const f1 = findId("Python supports dynamic typing.", "KNOWN");
const f2 = findId("Python supports dynamic typing.", "KNOWN");
const f3 = findId("Python supports dynamic typing.", "ESTIMATED");
assert("findId format: find_<12hex>", /^find_[a-f0-9]{12}$/.test(f1), f1);
assert("findId deterministic", f1 === f2);
assert("findId different certainty → different ID", f1 !== f3);

// Error handling
let threw = false;
try { srcId(""); } catch(_) { threw = true; }
assert("srcId throws on empty string", threw);

console.log("\nSU04:", passed, "passed,", failed, "failed");
process.exit(failed > 0 ? 1 : 0);
