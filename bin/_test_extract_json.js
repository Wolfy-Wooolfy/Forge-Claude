"use strict";
const { extractJsonFromResponse } = require("../code/src/runtime/agents/_adapter_contract");

const cases = [
  // gpt-4o style: markdown fences with json tag
  ["backtick-json-newline", "```json\n{\"a\":1}\n```", "{\"a\":1}"],
  // markdown fences no lang
  ["backtick-no-lang-newline", "```\n{\"a\":1}\n```", "{\"a\":1}"],
  // gpt-4o-mini style: plain JSON (no fences — passthrough)
  ["plain-json", "{\"a\":1}", "{\"a\":1}"],
  // Leading/trailing whitespace only
  ["whitespace-only", "  {\"a\":1}  ", "{\"a\":1}"],
  // Empty string
  ["empty-string", "", ""],
  // null passthrough
  ["null-passthrough", null, null],
  // JSON with uppercase JSON tag
  ["backtick-JSON-upper", "```JSON\n{\"x\":2}\n```", "{\"x\":2}"],
];

let pass = 0, fail = 0;
for (const [name, input, expected] of cases) {
  const result = extractJsonFromResponse(input);
  const ok = result === expected;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + name);
  if (!ok) {
    console.log("    expected: " + JSON.stringify(expected));
    console.log("    got:      " + JSON.stringify(result));
  }
  ok ? pass++ : fail++;
}
console.log("\n" + pass + "/" + (pass + fail) + " test cases passed");
process.exit(fail > 0 ? 1 : 0);
