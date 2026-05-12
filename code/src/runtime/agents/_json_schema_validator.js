"use strict";

// Minimal in-house JSON Schema validator.
// Supports: type, required, properties, items, enum, minLength, minimum.
// No external dependencies — §2-D7.

function validate(value, schema) {
  const errors = [];
  _check(value, schema, "", errors);
  return { valid: errors.length === 0, errors };
}

function _check(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") return;

  // ── enum ──────────────────────────────────────────────────────────────────
  if (Array.isArray(schema.enum)) {
    const found = schema.enum.some(
      (e) => JSON.stringify(e) === JSON.stringify(value)
    );
    if (!found) {
      errors.push(_at(path) + "value " + JSON.stringify(value) +
        " not in enum [" + schema.enum.map((e) => JSON.stringify(e)).join(", ") + "]");
    }
    return; // enum is terminal; skip further type checks
  }

  // ── type ──────────────────────────────────────────────────────────────────
  if (typeof schema.type === "string") {
    const typeOk = _checkType(value, schema.type);
    if (!typeOk) {
      errors.push(_at(path) + "expected type " + schema.type +
        ", got " + _typeName(value));
      return; // no point descending into a wrong-typed value
    }
  }

  // ── string constraints ────────────────────────────────────────────────────
  if (schema.type === "string" && typeof schema.minLength === "number") {
    if (typeof value === "string" && value.length < schema.minLength) {
      errors.push(_at(path) + "string length " + value.length +
        " is less than minLength " + schema.minLength);
    }
  }

  // ── number constraints ────────────────────────────────────────────────────
  if (schema.type === "number" && typeof schema.minimum === "number") {
    if (typeof value === "number" && value < schema.minimum) {
      errors.push(_at(path) + "value " + value +
        " is less than minimum " + schema.minimum);
    }
  }

  // ── object: required + properties ────────────────────────────────────────
  if (schema.type === "object" && value !== null && typeof value === "object" &&
      !Array.isArray(value)) {

    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value) || value[key] === undefined || value[key] === null) {
          errors.push(_at(path) + "required field '" + key + "' is missing or null");
        }
      }
    }

    if (schema.properties && typeof schema.properties === "object") {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          _check(value[key], subSchema, _join(path, key), errors);
        }
      }
    }
  }

  // ── array: items ──────────────────────────────────────────────────────────
  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.items && typeof schema.items === "object") {
      for (let i = 0; i < value.length; i++) {
        _check(value[i], schema.items, _join(path, String(i)), errors);
      }
    }
  }
}

function _checkType(value, typeName) {
  if (typeName === "null")    return value === null;
  if (typeName === "boolean") return typeof value === "boolean";
  if (typeName === "integer") return typeof value === "number" && !isNaN(value) && Number.isInteger(value);
  if (typeName === "number")  return typeof value === "number" && !isNaN(value);
  if (typeName === "string")  return typeof value === "string";
  if (typeName === "array")   return Array.isArray(value);
  if (typeName === "object")  return (
    value !== null && typeof value === "object" && !Array.isArray(value)
  );
  return false;
}

function _typeName(value) {
  if (value === null)        return "null";
  if (Array.isArray(value))  return "array";
  return typeof value;
}

function _at(path)         { return path ? "'" + path + "': " : ""; }
function _join(base, key)  { return base ? base + "." + key : key; }

module.exports = { validate };
