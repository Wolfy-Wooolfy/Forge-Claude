"use strict";

const MIN_LENGTH = 20;

module.exports = {
  id:          "openai_api_key",
  description: "OPENAI_API_KEY environment variable set and plausible",
  fn(/* ctx */) {
    const key = process.env.OPENAI_API_KEY || "";
    if (!key) {
      return { status: "FAIL", detail: "OPENAI_API_KEY not set" };
    }
    if (key.length < MIN_LENGTH) {
      return { status: "FAIL", detail: "OPENAI_API_KEY set but length=" + key.length + " < " + MIN_LENGTH };
    }
    return { status: "PASS", detail: "set, length=" + key.length };
  }
};
