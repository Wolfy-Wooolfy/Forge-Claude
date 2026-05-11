"use strict";

/**
 * Asserts that the JSON response body matches a minimal JSON Schema subset.
 * Supports: type, required (array of keys), properties (type checks only).
 * @param {{ schema: { type?: string, required?: string[], properties?: object } }} params
 * @param {{ response: { body: * } }} context
 */
async function assert(params, context) {
  const body = context.response && context.response.body;
  const schema = params.schema || {};

  if (schema.type) {
    const actualType = Array.isArray(body) ? "array" : typeof body;
    if (actualType !== schema.type) {
      return { pass: false, reason: `Expected body type "${schema.type}", got "${actualType}"` };
    }
  }

  if (Array.isArray(schema.required) && (body === null || typeof body !== "object" || Array.isArray(body))) {
    return { pass: false, reason: "Body must be an object to check required keys" };
  }

  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) {
        return { pass: false, reason: `Required key "${key}" missing from response body` };
      }
    }
  }

  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      if (propSchema.type) {
        const actualType = Array.isArray(body[key]) ? "array" : typeof body[key];
        if (actualType !== propSchema.type) {
          return {
            pass: false,
            reason: `Expected body.${key} type "${propSchema.type}", got "${actualType}"`
          };
        }
      }
    }
  }

  return { pass: true };
}

module.exports = { assert };
