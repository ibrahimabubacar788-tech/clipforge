import test from "node:test";
import assert from "node:assert/strict";
import { captionPpm, captionSegmentsForClip } from "../server/caption-renderer.js";

test("caption renderer creates timed beats inside the selected clip", () => {
  const result = captionSegmentsForClip({
    captions: true,
    start: 10,
    end: 20,
    captionSegments: [
      { start: 8, end: 12, text: "before the clip starts but continues into it", speaker: "A" },
      { start: 12, end: 18, text: "inside the clip with a longer explanation and a clear result", speaker: "B" },
      { start: 18, end: 25, text: "after the clip ends with another point" }
    ]
  });
  assert.ok(result.length >= 5);
  assert.equal(result[0].start, 0);
  assert.equal(result.at(-1).end, 10);
  assert.ok(result.every((item) => item.end > item.start));
  assert.equal(result[0].text.startsWith("A: "), true);
  assert.equal(result.some((item) => item.text.startsWith("B: ")), true);
});

test("caption renderer does not repeat the same speaker label on every beat", () => {
  const result = captionSegmentsForClip({
    captions: true,
    start: 0,
    end: 8,
    captionSegments: [
      { start: 0, end: 4, speaker: "Alex", text: "Here is the first point and it matters a lot." },
      { start: 4, end: 8, speaker: "Alex", text: "Now here is the result and why it worked." },
    ]
  });
  assert.equal(result.filter((item) => item.text.startsWith("Alex: ")).length, 1);
});

test("caption PPM is valid and keeps punctuation and digits visible", () => {
  const ppm = captionPpm("Test 2026, it's great!", "#ffffff");
  const header = ppm.split("\n").slice(0, 3);
  assert.deepEqual(header, ["P3", "572 107", "255"]);
  assert.match(ppm, /255 255 255/);
  assert.ok(ppm.length > 10000);
});

test("invalid caption colors fall back safely", () => {
  const ppm = captionPpm("123", "not-a-color");
  assert.match(ppm, /^P3\n\d+ \d+\n255\n/);
  assert.match(ppm, /211 233 100/);
});
