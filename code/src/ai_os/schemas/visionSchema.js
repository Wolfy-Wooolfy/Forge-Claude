"use strict";

// ── Minimal YAML frontmatter parser ───────────────────────────────────────────
// Handles the exact format visionEngine produces:
//   scalar: key: value (string / null / boolean / integer)
//   nested: key:\n  subkey: value  (2-space indent)
//   inline arrays: key: [] or key: [json]
//   inline JSON:   key: [{...},{...}]

function _parseScalar(raw) {
  const v = raw.trim();
  if (v === "null" || v === "~") return null;
  if (v === "true")  return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  // strip optional surrounding quotes
  if ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function _parseInlineArray(raw) {
  const v = raw.trim();
  if (v === "[]") return [];
  try { return JSON.parse(v); } catch { return []; }
}

function parseFrontmatter(content) {
  if (typeof content !== "string") return null;
  const fence = content.indexOf("---");
  if (fence === -1) return null;
  const start = content.indexOf("\n", fence);
  if (start === -1) return null;
  const end = content.indexOf("\n---", start);
  if (end === -1) return null;
  const yamlBlock = content.slice(start + 1, end);

  const lines  = yamlBlock.split("\n");
  const result = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) { i++; continue; }

    const indent = line.search(/\S/);
    if (indent > 0) { i++; continue; } // top-level only at this pass

    const colon = line.indexOf(":");
    if (colon === -1) { i++; continue; }

    const key   = line.slice(0, colon).trim();
    const after = line.slice(colon + 1);

    if (after.trim() === "" || after.trim() === "|" || after.trim() === ">") {
      // Value is on subsequent indented lines — gather children
      const children = {};
      const childArr = [];
      let isArr = false;
      i++;
      while (i < lines.length) {
        const child = lines[i];
        if (!child.trim()) { i++; continue; }
        const childIndent = child.search(/\S/);
        if (childIndent === 0) break; // back to top level
        if (child.trimStart().startsWith("- ")) {
          isArr = true;
          // array element — object or scalar
          const elemLine = child.trimStart().slice(2).trim();
          const elemColon = elemLine.indexOf(":");
          if (elemColon !== -1) {
            // start of an inline-object element — gather its key:value pairs
            const obj = {};
            obj[elemLine.slice(0, elemColon).trim()] = _parseScalar(elemLine.slice(elemColon + 1));
            i++;
            while (i < lines.length) {
              const sub = lines[i];
              if (!sub.trim()) { i++; continue; }
              const subIndent = sub.search(/\S/);
              if (subIndent <= childIndent) break;
              const sc = sub.indexOf(":");
              if (sc !== -1) {
                obj[sub.slice(0, sc).trim()] = _parseScalar(sub.slice(sc + 1));
              }
              i++;
            }
            childArr.push(obj);
          } else {
            childArr.push(_parseScalar(elemLine));
            i++;
          }
        } else {
          const cc = child.indexOf(":");
          if (cc !== -1) {
            children[child.slice(0, cc).trim()] = _parseScalar(child.slice(cc + 1));
          }
          i++;
        }
      }
      result[key] = isArr ? childArr : children;
    } else {
      const valRaw = after.trimStart();
      if (valRaw.startsWith("[")) {
        result[key] = _parseInlineArray(valRaw);
      } else {
        result[key] = _parseScalar(valRaw);
      }
      i++;
    }
  }

  return result;
}

function extractBody(content) {
  if (typeof content !== "string") return "";
  const fence = content.indexOf("---");
  if (fence === -1) return content;
  const start = content.indexOf("\n", fence);
  if (start === -1) return "";
  const end = content.indexOf("\n---", start);
  if (end === -1) return "";
  return content.slice(end + 4).trimStart();
}

// ── Schema validation ──────────────────────────────────────────────────────────

function validateFrontmatter(fm) {
  const errors = [];

  if (typeof fm !== "object" || fm === null) {
    return ["frontmatter must be an object"];
  }

  if (typeof fm.project_id !== "string" || !fm.project_id.trim()) {
    errors.push("project_id: must be a non-empty string");
  }
  if (typeof fm.project_name !== "string" || !fm.project_name.trim()) {
    errors.push("project_name: must be a non-empty string");
  }
  if (typeof fm.vision_version !== "number" || fm.vision_version < 1 || !Number.isInteger(fm.vision_version)) {
    errors.push("vision_version: must be a positive integer");
  }
  if (typeof fm.vision_locked !== "boolean") {
    errors.push("vision_locked: must be a boolean");
  }
  // Lock consistency
  if (fm.vision_locked === true && !fm.vision_locked_at) {
    errors.push("vision_locked_at: must be set when vision_locked=true");
  }
  if (fm.vision_locked === false && fm.vision_locked_at) {
    errors.push("vision_locked_at: must be null when vision_locked=false");
  }
  if (!Array.isArray(fm.amendments_history)) {
    errors.push("amendments_history: must be an array");
  }

  return errors;
}

// ── Serializer (produces the exact format the parser reads) ───────────────────

function serializeFrontmatter(fm) {
  const goals = fm.goals || {};
  const primary   = goals.primary   || "";
  const secondary = JSON.stringify(goals.secondary || []);
  const constraints     = JSON.stringify(fm.constraints  || []);
  const nonGoals        = JSON.stringify(fm.non_goals    || []);
  const amendmentsJson  = JSON.stringify(fm.amendments_history || []);

  return [
    "---",
    "project_id: " + (fm.project_id || ""),
    "project_name: " + (fm.project_name || ""),
    "domain: " + (fm.domain || ""),
    "vision_version: " + (fm.vision_version || 1),
    "vision_locked: " + (fm.vision_locked ? "true" : "false"),
    "vision_locked_at: " + (fm.vision_locked_at || "null"),
    "locked_by_role: " + (fm.locked_by_role || "null"),
    "amendments_history: " + amendmentsJson,
    "goals:",
    "  primary: " + primary,
    "  secondary: " + secondary,
    "constraints: " + constraints,
    "non_goals: " + nonGoals,
    "---"
  ].join("\n");
}

module.exports = { parseFrontmatter, extractBody, validateFrontmatter, serializeFrontmatter };
