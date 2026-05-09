"use strict";

const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

const { parseFrontmatter, extractBody, validateFrontmatter, serializeFrontmatter } =
  require("./schemas/visionSchema");

function createVisionEngine(options) {
  const root = path.resolve((options && options.root) || process.cwd());

  function _visionPath(projectId) {
    return path.join(root, "artifacts", "projects", projectId, "vision.md");
  }

  function _relPath(projectId) {
    return "artifacts/projects/" + projectId + "/vision.md";
  }

  // Synchronous read for L3 permission hot path — allowed exception per F2 spec
  function readVisionSync(projectId) {
    const abs = _visionPath(projectId);
    if (!fs.existsSync(abs)) return null;
    try {
      const content = fs.readFileSync(abs, "utf8");
      const fm = parseFrontmatter(content);
      if (!fm) return null;
      return fm;
    } catch { return null; }
  }

  async function getCurrentVision(projectId) {
    const abs = _visionPath(projectId);
    if (!fs.existsSync(abs)) return null;
    try {
      const content = fs.readFileSync(abs, "utf8");
      const frontmatter = parseFrontmatter(content);
      if (!frontmatter) return null;
      const errors = validateFrontmatter(frontmatter);
      if (errors.length > 0) {
        throw new Error("VISION_PARSE_FAILED: " + errors.join("; "));
      }
      const body = extractBody(content);
      return { frontmatter, body };
    } catch (e) {
      if (e.message && e.message.startsWith("VISION_PARSE_FAILED")) throw e;
      return null;
    }
  }

  async function _writeVision(projectId, frontmatter, body) {
    const { getDefaultRegistry } = require("../runtime/tools/_registry");
    const reg = getDefaultRegistry();
    const serialized = serializeFrontmatter(frontmatter);
    const content = serialized + "\n\n" + (body || "# Project Vision: " + frontmatter.project_name + "\n");
    const r = await reg.invoke("fs.write_file", { path: _relPath(projectId), content }, { root });
    if (r.status !== "SUCCESS") {
      throw new Error("visionEngine._writeVision failed [" + _relPath(projectId) + "]: " +
        (r.metadata && r.metadata.reason) + ": " + (r.metadata && r.metadata.detail));
    }
  }

  async function lockVision(projectId, lockedByRole) {
    const vision = await getCurrentVision(projectId);
    if (!vision) return { ok: false, reason: "VISION_NOT_FOUND" };
    if (vision.frontmatter.vision_locked) {
      return { ok: true, mode: "ALREADY_LOCKED", vision_version: vision.frontmatter.vision_version };
    }
    const updated = Object.assign({}, vision.frontmatter, {
      vision_locked:    true,
      vision_locked_at: new Date().toISOString(),
      locked_by_role:   lockedByRole || "owner"
    });
    await _writeVision(projectId, updated, vision.body);
    return { ok: true, mode: "LOCKED", vision_version: updated.vision_version };
  }

  async function proposeAmendment(projectId, proposal) {
    const vision = await getCurrentVision(projectId);
    if (!vision) return { ok: false, reason: "VISION_NOT_FOUND" };
    const amendmentId = "amend-" + crypto.randomBytes(4).toString("hex");
    const entry = {
      amendment_id:     amendmentId,
      status:           "PROPOSED",
      proposed_at:      new Date().toISOString(),
      proposed_by_role: (proposal && proposal.proposed_by_role) || "owner",
      summary:          (proposal && proposal.summary) || "",
      details:          (proposal && proposal.details) || "",
      approved_at:      null,
      approved_by_role: null
    };
    const history = Array.isArray(vision.frontmatter.amendments_history)
      ? vision.frontmatter.amendments_history.slice()
      : [];
    history.push(entry);
    const updated = Object.assign({}, vision.frontmatter, { amendments_history: history });
    await _writeVision(projectId, updated, vision.body);
    return { ok: true, amendment_id: amendmentId, status: "PROPOSED" };
  }

  async function approveAmendment(projectId, amendmentId, approvedByRole) {
    const vision = await getCurrentVision(projectId);
    if (!vision) return { ok: false, reason: "VISION_NOT_FOUND" };
    const history = Array.isArray(vision.frontmatter.amendments_history)
      ? vision.frontmatter.amendments_history.slice()
      : [];
    const idx = history.findIndex((a) => a.amendment_id === amendmentId);
    if (idx === -1) return { ok: false, reason: "AMENDMENT_NOT_FOUND" };
    if (history[idx].status !== "PROPOSED") {
      return {
        ok:           false,
        reason:       "AMENDMENT_NOT_PROPOSABLE",
        detail:       "amendment " + amendmentId + " is not in PROPOSED status"
      };
    }
    const approved = Object.assign({}, history[idx], {
      status:           "APPROVED",
      approved_at:      new Date().toISOString(),
      approved_by_role: approvedByRole || "owner"
    });
    history[idx] = approved;
    const newVersion = (vision.frontmatter.vision_version || 1) + 1;
    const updated = Object.assign({}, vision.frontmatter, {
      amendments_history: history,
      vision_version:     newVersion
    });
    await _writeVision(projectId, updated, vision.body);
    return { ok: true, amendment_id: amendmentId, vision_version: newVersion };
  }

  async function getAmendmentHistory(projectId) {
    const vision = await getCurrentVision(projectId);
    if (!vision) return [];
    return Array.isArray(vision.frontmatter.amendments_history)
      ? vision.frontmatter.amendments_history
      : [];
  }

  return {
    readVisionSync,
    getCurrentVision,
    lockVision,
    proposeAmendment,
    approveAmendment,
    getAmendmentHistory
  };
}

module.exports = { createVisionEngine };
