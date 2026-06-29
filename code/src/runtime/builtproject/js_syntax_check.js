"use strict";

// PHASE-46 W-3 (Mechanism B) — in-process JS syntax (parse) check.
//
// Pure, COMPILE-ONLY check using the Node `vm` builtin. The source is compiled
// (parsed) but NEVER executed — there is no `.runInThisContext()` / `.runInContext()`
// call — so there are NO side effects. A SyntaxError (e.g. a duplicate declaration,
// an unbalanced brace) throws at compile time and is reported.
//
// §ARC note: `vm` is a Node builtin and is NOT `child_process`, so the §ARC-3
// "files under runtime/builtproject MUST NOT import child_process" rule is not
// implicated. This module imports ONLY `vm` — no fs, no network, no new dependency,
// no child_process. §ARC stays frozen at 10.
//
// The content is wrapped in the exact CommonJS module wrapper Node uses, so a
// module that legitimately uses top-level `require` / `module.exports` / `return`
// compiles cleanly (no false positives), while a genuine SyntaxError still throws.

const vm = require("vm");

const WRAP_HEAD = "(function (exports, require, module, __filename, __dirname) {\n";
const WRAP_TAIL = "\n});";

// Compile-only parse check of a single CommonJS source string.
// Returns { ok: true } on success, or { ok: false, error: <message> } on SyntaxError.
function checkParses(content, filename) {
  let src = (content == null) ? "" : String(content);
  // Node strips a leading shebang before wrapping; mirror that so a `#!` first line
  // (valid only at true file start) does not produce a false SyntaxError.
  if (src.charCodeAt(0) === 0x23 /* # */ && src.charCodeAt(1) === 0x21 /* ! */) {
    const nl = src.indexOf("\n");
    src = (nl === -1) ? "" : src.slice(nl + 1);
  }
  try {
    /* eslint-disable no-new */
    new vm.Script(WRAP_HEAD + src + WRAP_TAIL, { filename: filename || "<generated>" });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "parse error" };
  }
}

module.exports = { checkParses };
