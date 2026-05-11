"use strict";

const fs   = require("fs");
const path = require("path");

const PROMPTS_FILE = path.join(__dirname, "../../../../docs/10_runtime/18b_ROLE_PROMPTS.md");

let _cache = null;

function _loadAll() {
  let raw;
  try {
    raw = fs.readFileSync(PROMPTS_FILE, "utf8");
  } catch (err) {
    throw new Error("prompt_loader: cannot read prompts file: " + err.message);
  }

  // Normalize CRLF → LF for consistent regex matching across platforms.
  const text = raw.replace(/\r\n/g, "\n");

  const result = {};
  // Match: ## <prompt_id> (<date>[optional suffix])\n...\n```\n<body>\n```
  // Body is captured between opening ``` and closing ``` at line start.
  const re = /^## ([a-z][a-z0-9_]*_v\d+) \([^)]*\)[^\n]*\n[\s\S]*?^```\n([\s\S]*?)\n^```/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const id   = m[1];
    const body = m[2].trim();
    result[id] = body;
  }
  return result;
}

function loadPrompt(promptId) {
  if (!_cache) _cache = _loadAll();
  if (!(promptId in _cache)) {
    throw new Error("prompt_loader: unknown prompt id '" + promptId + "'" +
      " (available: " + Object.keys(_cache).join(", ") + ")");
  }
  return _cache[promptId];
}

function resetPromptCache() {
  _cache = null;
}

module.exports = { loadPrompt, resetPromptCache };
