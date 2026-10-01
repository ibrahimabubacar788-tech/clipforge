import test from "node:test";
import assert from "node:assert/strict";
import { captionPpm, captionSegmentsForClip } from "../server/caption-renderer.js";

test("caption timing is clipped to the selected clip", () => {
  const result = captionSegmentsForClip({
    captions: true,
    start: 10,
    end: 20,
    captionSegments: [
      { start: 8, end: 12, text: "before", speaker: "A" },
      { start: 12, end: 18, text: "inside", speaker: "B" },
      { start: 18, end: 25, text: "after" },
      { start: 4, end: 4, text: "invalid" }
    ]
  });
  assert.deepEqual(result, [
    { start: 0, end: 2, text: "A: before" },
    { start: 2, end: 8, text: "B: inside" },
    { start: 8, end: 10, text: "after" }
  ]);
});

test("caption PPM is valid and keeps punctuation and digits visible", () => {
  const ppm = captionPpm("Test 2026, it's great!", "#ffffff");
  const header = ppm.split("\n").slice(0, 3);
  assert.deepEqual(header, ["P3", "680 90", "255"]);
  assert.match(ppm, /255 255 255/);
  assert.ok(ppm.length > 10000);
});

test("invalid caption colors fall back safely", () => {
  const ppm = captionPpm("123", "not-a-color");
  assert.match(ppm, /^P3\n\d+ \d+\n255\n/);
  assert.match(ppm, /211 233 100/);
});
