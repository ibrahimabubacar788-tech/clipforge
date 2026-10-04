import test from "node:test";
import assert from "node:assert/strict";
import { rankHighlights } from "../server/highlights.js";

test("highlight engine assembles transcript windows without injected placeholder text", () => {
  const clips = rankHighlights([
    { start: 0, end: 5, text: "This is the opening idea." },
    { start: 5, end: 10, text: "And this is the important part." },
    { start: 10, end: 16, text: "Here is the payoff." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  assert.equal(clips.length, 1);
  assert.equal(clips[0].transcript, "This is the opening idea. And this is the important part. Here is the payoff.");
  assert.equal(clips[0].transcript.includes("[native code]"), false);
});


test("highlight scoring rewards concrete lessons and contrast", () => {
  const clips = rankHighlights([
    { start: 0, end: 16, text: "The result was 10x better because we changed one simple step. However, the old approach failed for one important reason." },
  ], { limit: 1, minDuration: 15, maxDuration: 30 });

  assert.equal(clips.length, 1);
  assert.match(clips[0].transcript, /10x better/i);
  assert.ok(clips[0].score >= 50);
});

test("highlight classification recognizes practical tips and payoff language", () => {
  const clips = rankHighlights([
    { start: 0, end: 16, text: "Here are three tips because this simple lesson gets better results." },
  ], { limit: 1, minDuration: 15, maxDuration: 30 });

  assert.equal(clips.length, 1);
  assert.equal(clips[0].highlightType, "how-to");
});

test("highlight scoring penalizes filler and promotional boilerplate", () => {
  const clips = rankHighlights([
    { start: 0, end: 8, text: "Um, you know, basically this is the thing." },
    { start: 8, end: 16, text: "The biggest mistake is ignoring your audience." },
    { start: 24, end: 32, text: "Subscribe for more and use my promo code below." },
    { start: 32, end: 40, text: "This result is useful for creators." },
    { start: 40, end: 56, text: "The practical lesson is to make every clip useful for the audience." },
  ], { limit: 3, minDuration: 15, maxDuration: 30 });

  assert.equal(clips.length, 2);
  assert.match(clips[0].transcript, /biggest mistake/i);
  assert.equal(clips.some((clip) => /promo code/i.test(clip.transcript)), false);
});
