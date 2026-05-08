"use strict";

const fs   = require("fs");
const path = require("path");
const {
  InvalidContractError,
  InvalidInputError,
  InvalidOutputError,
  FailClosedError,
  ProviderError
} = require("./providerErrors");
const { callChatWithTool } = require("./openAiAdapter");
const { createTrace }      = require("./providerTrace");

const VALID_CAPABILITIES = ["function_calling", "streaming", "json_mode", "vision"];

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function freezeDeep(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.keys(obj).forEach(k => freezeDeep(obj[k]));
  return Object.freeze(obj);
}

// ── JSON Schema validator (subset per SCHEMA §2.2) ────────────────────────

function validateAgainstSchema(value, schema, path_) {
  const issues = [];
  _validate(value, schema, path_ || "$", issues);
  return issues;
}

function _validate(value, schema, at, issues) {
  if (!schema || typeof schema !== "object") return;

  // type check
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    if (!types.includes(actual)) {
      issues.push(at + ": expected type " + types.join("|") + " but got " + actual);
      return;
    }
  }

  // enum
  if (schema.enum !== undefined) {
    if (!schema.enum.includes(value)) {
      issues.push(at + ": value not in enum " + JSON.stringify(schema.enum));
    }
    return;
  }

  // string constraints
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push(at + ": length " + value.length + " < minLength " + schema.minLength);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push(at + ": length " + value.length + " > maxLength " + schema.maxLength);
    }
  }

  // number constraints
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push(at + ": " + value + " < minimum " + schema.minimum);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push(at + ": " + value + " > maximum " + schema.maximum);
    }
  }

  // object
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    if (schema.required) {
      schema.required.forEach(key => {
        if (!(key in value)) issues.push(at + ": missing required field '" + key + "'");
      });
    }
    if (schema.properties) {
      Object.keys(schema.properties).forEach(key => {
        if (key in value) {
          _validate(value[key], schema.properties[key], at + "." + key, issues);
        }
      });
    }
  }

  // array
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => _validate(item, schema.items, at + "[" + i + "]", issues));
  }
}

// ── Contract validation ───────────────────────────────────────────────────

function validateContract(contract) {
  const errs = [];

  if (typeof contract !== "object" || contract === null) {
    throw new InvalidContractError("Contract must be an object");
  }

  // id
  if (typeof contract.id !== "string" || !/^[a-z][a-z0-9_]*$/.test(contract.id)) {
    errs.push("id must match /^[a-z][a-z0-9_]*$/, got: " + JSON.stringify(contract.id));
  }

  // version
  if (typeof contract.version !== "string" || !/^\d+\.\d+\.\d+$/.test(contract.version)) {
    errs.push("version must be semver X.Y.Z, got: " + JSON.stringify(contract.version));
  }

  // authority_doc
  if (typeof contract.authority_doc !== "string" || !contract.authority_doc.trim()) {
    errs.push("authority_doc must be a non-empty string");
  }

  // required_capabilities
  if (contract.required_capabilities !== undefined) {
    if (!Array.isArray(contract.required_capabilities)) {
      errs.push("required_capabilities must be an array");
    } else {
      contract.required_capabilities.forEach(cap => {
        if (!VALID_CAPABILITIES.includes(cap)) {
          errs.push("unknown capability: " + JSON.stringify(cap));
        }
      });
    }
  }

  // input_schema
  if (typeof contract.input_schema !== "object" || contract.input_schema === null) {
    errs.push("input_schema must be an object");
  }

  // output_tool
  if (!contract.output_tool || typeof contract.output_tool !== "object") {
    errs.push("output_tool is required");
  } else {
    if (typeof contract.output_tool.name !== "string" || !/^[a-z][a-z0-9_]*$/.test(contract.output_tool.name)) {
      errs.push("output_tool.name must match /^[a-z][a-z0-9_]*$/");
    }
    if (typeof contract.output_tool.parameters !== "object" || contract.output_tool.parameters === null) {
      errs.push("output_tool.parameters must be an object");
    }
  }

  // fail_mode
  if (contract.fail_mode !== undefined && contract.fail_mode !== "FAIL_CLOSED") {
    errs.push("fail_mode must be 'FAIL_CLOSED' if present");
  }

  if (errs.length > 0) {
    throw new InvalidContractError(
      "Contract '" + (contract.id || "?") + "' failed validation:\n  " + errs.join("\n  "),
      { contract_id: contract.id, issues: errs }
    );
  }
}

function checkAuthorityDocExists(contract, opts) {
  const root     = (opts && opts.root) || process.cwd();
  const docPath  = path.resolve(root, contract.authority_doc);
  const exists   = fs.existsSync(docPath);
  return exists
    ? { ok: true }
    : { ok: false, reason: "authority_doc not found on disk: " + docPath };
}

// ── defineProvider ────────────────────────────────────────────────────────

function defineProvider(rawContract, handler) {
  validateContract(rawContract);
  if (typeof handler !== "function") {
    throw new InvalidContractError(
      "handler must be a function for provider '" + (rawContract.id || "?") + "'"
    );
  }

  const contract = freezeDeep(deepClone(rawContract));
  const trace    = createTrace({ root: process.cwd() });

  async function executeTask(task) {
    const context  = (task && task.context) || {};
    const task_id  = (task && task.task_id)  || ("task_" + Date.now());

    // 1. Validate input
    const inputIssues = validateAgainstSchema(context, contract.input_schema, "context");
    if (inputIssues.length > 0) {
      const err = new InvalidInputError(
        "Input failed input_schema: " + inputIssues.join("; "),
        { contract_id: contract.id, issues: inputIssues }
      );
      return err.toEnvelope({ provider_id: contract.id, provider_version: contract.version });
    }

    // 2. Build callChat helper bound to this contract
    function callChat(opts) {
      return callChatWithTool({
        provider_id:  contract.id,
        system:       opts.system,
        messages:     opts.messages,
        tool_definition: contract.output_tool,
        temperature:  contract.temperature !== undefined ? contract.temperature : 0,
        timeout_ms:   contract.timeout_ms,
        retry_policy: contract.retry_policy,
        model:        opts.model
      });
    }

    const t0 = Date.now();
    let rawResult, envelope, status, reason, model, attempt;

    try {
      rawResult = await handler({ context, contract, callChat, task });

      // 3. Normalise to envelope
      if (rawResult && typeof rawResult === "object" && "status" in rawResult) {
        envelope = rawResult;
      } else {
        envelope = { status: "SUCCESS", output: rawResult, metadata: {} };
      }

      status  = envelope.status  || "SUCCESS";
      reason  = (envelope.metadata && envelope.metadata.reason) || null;
      model   = (envelope.metadata && envelope.metadata.model)  || process.env.OPENAI_MODEL || "gpt-4o";
      attempt = (envelope.metadata && envelope.metadata.attempt) || 1;

      // 4. Validate output on SUCCESS
      if (status === "SUCCESS" && envelope.output !== null && envelope.output !== undefined) {
        const outputIssues = validateAgainstSchema(
          envelope.output,
          contract.output_tool.parameters,
          "output"
        );
        if (outputIssues.length > 0) {
          throw new InvalidOutputError(
            "Output failed output_tool.parameters: " + outputIssues.join("; "),
            { contract_id: contract.id, issues: outputIssues }
          );
        }
      }

    } catch (err) {
      const provErr = (err instanceof ProviderError)
        ? err
        : new FailClosedError((err && err.message) || String(err), { contract_id: contract.id });

      const latency = Date.now() - t0;
      try {
        trace.record(
          { task_id, project_id: (task && task.project_id) || null },
          null,
          { provider_id: contract.id, provider_version: contract.version,
            model: model || "unknown", status: "FAILED",
            reason: provErr.reason, latency_ms: latency, attempt: attempt || 1 }
        );
      } catch (traceErr) {
        // If it's a FailClosedError from trace itself, re-throw it
        if (traceErr.reason === "FAIL_CLOSED") throw traceErr;
        process.stderr.write("[providerContract] trace failed: " + traceErr.message + "\n");
      }

      return provErr.toEnvelope({
        provider_id: contract.id,
        provider_version: contract.version,
        latency_ms: latency
      });
    }

    // 5. Write trace for SUCCESS path
    const latency = Date.now() - t0;
    try {
      trace.record(
        { task_id, project_id: (task && task.project_id) || null },
        envelope._raw || null,
        { provider_id: contract.id, provider_version: contract.version,
          model, status, reason, latency_ms: latency, attempt: attempt || 1 }
      );
    } catch (traceErr) {
      if (traceErr.reason === "FAIL_CLOSED") throw traceErr;
      process.stderr.write("[providerContract] trace failed: " + traceErr.message + "\n");
    }

    // 6. Return clean envelope (strip internal _raw)
    const cleanMetadata = Object.assign({}, envelope.metadata || {});
    delete cleanMetadata._raw;

    return {
      status: envelope.status,
      output: envelope.output,
      metadata: Object.assign(cleanMetadata, {
        provider_id:      contract.id,
        provider_version: contract.version,
        latency_ms:       latency
      })
    };
  }

  return {
    id:          contract.id,
    version:     contract.version,
    getContract: () => contract,
    executeTask
  };
}

module.exports = {
  defineProvider,
  validateContract,
  validateAgainstSchema,
  checkAuthorityDocExists,
  VALID_CAPABILITIES
};
