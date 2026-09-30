import test from "node:test";
import assert from "node:assert/strict";
import { clipDuration, formatTimestamp, normalizeClipRange } from "../src/clip-utils.js";

test("calculates a valid clip duration", () => assert.equal(clipDuration(124, 148), 24));
test("rejects a reversed or invalid clip range", () => { assert.equal(clipDuration(10, 10), 0); assert.equal(clipDuration("no", 20), 0); });
test("formats timestamps as minutes and seconds", () => assert.equal(formatTimestamp(148), "02:28"));
test("normalizes ranges within the timeline while preserving a minimum duration", () => {
  assert.deepEqual(normalizeClipRange(-12, 0, 519), { start: 0, end: 1 });
  assert.deepEqual(normalizeClipRange(518, 540, 519), { start: 518, end: 519 });
  assert.deepEqual(normalizeClipRange(100, 124, 519), { start: 100, end: 124 });
});
