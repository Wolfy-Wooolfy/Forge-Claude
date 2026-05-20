"use strict";

const { _decodeNssmBuffer } = require("../../../../scripts/install/_nssm_helper");

async function runS211NssmHelperMultiEncoding() {
  // case1: UTF-8 buffer containing "2.24" → detected as utf8
  const utf8Buf = Buffer.from("NSSM version 2.24\nSome other line\n", "utf8");
  const r1 = _decodeNssmBuffer(utf8Buf);
  const case1_utf8_detected = r1.ok === true && r1.encoding === "utf8";

  // case2: UTF-16 LE buffer (real NSSM 2.24 on Windows piped stderr) → detected as utf16le
  const utf16Buf = Buffer.from("NSSM Version 2.24 64-bit, 2014-08-31\r\n", "utf16le");
  const r2 = _decodeNssmBuffer(utf16Buf);
  const case2_utf16le_detected = r2.ok === true && r2.encoding === "utf16le";

  // case3: buffer with no "2.24" → returns error shape
  const badBuf = Buffer.from("NSSM version 3.00\nsome other output\n", "utf8");
  const r3 = _decodeNssmBuffer(badBuf);
  const case3_invalid_returns_error = r3.ok === false && typeof r3.error === "string";

  // case4: combined stdout (empty) + stderr (UTF-16 LE) → mirrors real NSSM execution
  const stdoutBuf  = Buffer.alloc(0);
  const stderrBuf  = Buffer.from("NSSM Version 2.24 64-bit, 2014-08-31\r\n", "utf16le");
  const combined   = Buffer.concat([stdoutBuf, stderrBuf]);
  const r4 = _decodeNssmBuffer(combined);
  const case4_stderr_utf16le_detected = r4.ok === true && r4.encoding === "utf16le";

  return {
    case1_utf8_detected,
    case2_utf16le_detected,
    case3_invalid_returns_error,
    case4_stderr_utf16le_detected
  };
}

module.exports = { runS211NssmHelperMultiEncoding };
