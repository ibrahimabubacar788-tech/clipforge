import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTranscript, parseTimestampedTranscript, parsePipeTranscript } from "../server/transcript.js";

test("parses SRT timestamps and speaker labels", () => {
  const result = parseTimestampedTranscript("1\n00:00:01,000 --> 00:00:04,500\n[SPEAKER A]: Here is the thing.\n\n2\n00:00:05,000 --> 00:00:07,000\nThis is the next line.", "srt");
  assert.equal(result.length, 2);
  assert.equal(result[0].start, 1);
  assert.equal(result[0].end, 4.5);
  assert.equal(result[0].speaker, "SPEAKER A");
  assert.equal(result[1].text, "This is the next line.");
});

test("parses VTT timestamps", () => {
  const result = parseTimestampedTranscript("WEBVTT\n\n00:00:02.000 --> 00:00:05.000\nSPEAKER B: The biggest mistake is waiting.", "vtt");
  assert.equal(result.length, 1);
  assert.equal(result[0].start, 2);
  assert.equal(result[0].speaker, "SPEAKER B");
});

test("parses pipe transcript timestamps", () => {
  const result = parsePipeTranscript("12 | 18 | HOST | Here is the thing\n18 | 25 | GUEST | The result was surprising.");
  assert.equal(result.length, 2);
  assert.equal(result[1].start, 18);
  assert.equal(result[1].speaker, "GUEST");
});

test("normalizes malformed transcript entries safely", () => {
  const result = normalizeTranscript([null, { start: -1, end: 1, text: "negative" }, { start: 0, end: 1, text: "ok" }]);
  assert.deepEqual(result, [{ start: 0, end: 1, text: "ok" }]);
  const normalized = parseTimestampedTranscript("1\n00:00:00.000 --> 00:00:01.000\nValid", "srt");
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].start, 0);
  assert.equal(normalized[0].end, 1);
  assert.equal(normalized[0].text, "Valid");
});
