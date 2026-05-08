"use strict";

const fs = require("fs");
const path = require("path");
const { FailClosedError } = require("./providerErrors");

const PRICING_TABLE = {
  "gpt-4o":         { in_per_1m: 2.50,  out_per_1m: 10.00 },
  "gpt-4o-mini":    { in_per_1m: 0.15,  out_per_1m: 0.60  },
  "gpt-4-turbo":    { in_per_1m: 10.00, out_per_1m: 30.00 },
  "gpt-3.5-turbo":  { in_per_1m: 0.50,  out_per_1m: 1.50  }
};

function estimateCostUsd(model, prompt_tokens, completion_tokens) {
  const pricing = PRICING_TABLE[model];
  if (!pricing) return null;
  return (
    (prompt_tokens     / 1_000_000) * pricing.in_per_1m +
    (completion_tokens / 1_000_000) * pricing.out_per_1m
  );
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function appendLedger(filePath, row) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(row) + "\n", "utf8");
}

function createTrace({ root }) {
  const resolvedRoot = root || process.cwd();

  function record(req, resp, meta) {
    const {
      provider_id = "unknown",
      provider_version = "0.0.0",
      model = "unknown",
      status = "UNKNOWN",
      reason = null,
      latency_ms = 0,
      attempt = 1
    } = meta || {};

    const task_id    = (req && req.task_id)    || "no_task_id";
    const project_id = (req && req.project_id) || "no_project_id";
    const usage      = (resp && resp.usage) || {};
    const prompt_tokens     = usage.prompt_tokens     || 0;
    const completion_tokens = usage.completion_tokens || 0;
    const total_tokens      = usage.total_tokens      || (prompt_tokens + completion_tokens);
    const ts = new Date().toISOString();

    // ── Forensic trace (Fail-Closed) ───────────────────────────────────────
    const metadataPath  = path.join(resolvedRoot, "artifacts", "llm", "metadata",  task_id + ".json");
    const requestsPath  = path.join(resolvedRoot, "artifacts", "llm", "requests",  task_id + ".json");
    const responsesPath = path.join(resolvedRoot, "artifacts", "llm", "responses", task_id + ".json");

    try {
      writeJson(metadataPath, {
        ts, provider_id, provider_version, model,
        project_id, status, reason, latency_ms, attempt,
        usage: { prompt_tokens, completion_tokens, total_tokens }
      });
      writeJson(requestsPath,  req  || null);
      writeJson(responsesPath, resp || null);
    } catch (err) {
      throw new FailClosedError(
        "Forensic trace write failed: " + err.message,
        { file: err.path || "unknown", original_error: err.message }
      );
    }

    // ── Cost ledger (best-effort) ──────────────────────────────────────────
    try {
      const ledgerPath = path.join(resolvedRoot, "artifacts", "ai", "cost_ledger.jsonl");
      const estimated_usd = estimateCostUsd(model, prompt_tokens, completion_tokens);
      appendLedger(ledgerPath, {
        ts, provider_id, provider_version, model,
        task_id, project_id, status, reason,
        prompt_tokens, completion_tokens, total_tokens,
        latency_ms, attempt, estimated_usd
      });
    } catch (err) {
      process.stderr.write("[providerTrace] cost_ledger write failed (best-effort): " + err.message + "\n");
    }
  }

  return { record };
}

module.exports = { createTrace, estimateCostUsd, PRICING_TABLE };
