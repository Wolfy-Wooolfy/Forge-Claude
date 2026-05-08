"use strict";

class ProviderError extends Error {
  constructor(reason, message, context) {
    super(message || reason);
    this.name = "ProviderError";
    this.reason = reason;
    this.context = context || null;
  }

  toEnvelope(metadata) {
    return {
      status: "FAILED",
      output: null,
      metadata: Object.assign(
        { reason: this.reason, message: this.message, context: this.context },
        metadata || {}
      )
    };
  }
}

class MissingApiKeyError extends ProviderError {
  constructor(context) {
    super("MISSING_API_KEY", "OPENAI_API_KEY is not set", context);
    this.name = "MissingApiKeyError";
  }
}

class InvalidContractError extends ProviderError {
  constructor(message, context) {
    super("INVALID_CONTRACT", message, context);
    this.name = "InvalidContractError";
  }
}

class InvalidInputError extends ProviderError {
  constructor(message, context) {
    super("INVALID_INPUT", message, context);
    this.name = "InvalidInputError";
  }
}

class InvalidOutputError extends ProviderError {
  constructor(message, context) {
    super("INVALID_OUTPUT", message, context);
    this.name = "InvalidOutputError";
  }
}

class ProviderTimeoutError extends ProviderError {
  constructor(message, context) {
    super("TIMEOUT", message || "Provider call timed out", context);
    this.name = "ProviderTimeoutError";
  }
}

class UpstreamApiError extends ProviderError {
  constructor(message, context) {
    super("UPSTREAM_API_ERROR", message, context);
    this.name = "UpstreamApiError";
  }
}

class NoToolCallError extends ProviderError {
  constructor(message, context) {
    super("NO_TOOL_CALL", message || "Model did not emit expected function call", context);
    this.name = "NoToolCallError";
  }
}

class FailClosedError extends ProviderError {
  constructor(message, context) {
    super("FAIL_CLOSED", message || "Unexpected error — fail closed", context);
    this.name = "FailClosedError";
  }
}

module.exports = {
  ProviderError,
  MissingApiKeyError,
  InvalidContractError,
  InvalidInputError,
  InvalidOutputError,
  ProviderTimeoutError,
  UpstreamApiError,
  NoToolCallError,
  FailClosedError
};
