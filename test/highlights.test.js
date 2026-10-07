import test from "node:test";
import assert from "node:assert/strict";
import { rankHighlights, selectNearbyContext } from "../server/highlights.js";

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

test("highlight selection reduces near-time duplicates", () => {
  const clips = rankHighlights([
    { start: 0, end: 8, text: "The big lesson is to focus on your audience." },
    { start: 8, end: 16, text: "The big lesson is to focus on your audience and improve the hook." },
    { start: 70, end: 78, text: "The result was 10x better after changing the opening." },
    { start: 78, end: 86, text: "The result was 10x better after changing the opening and payoff." },
  ], { limit: 2, minDuration: 15, maxDuration: 30 });

  assert.equal(clips.length, 2);
  assert.notEqual(Math.floor(clips[0].start / 40), Math.floor(clips[1].start / 40));
});

test("highlight boundaries trim leading filler without losing the minimum duration", () => {
  const clips = rankHighlights([
    { start: 0, end: 2, text: "Um, okay, welcome back." },
    { start: 2, end: 9, text: "The biggest mistake creators make is ignoring the audience." },
    { start: 9, end: 17, text: "The result is much stronger when you fix that one thing." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  assert.equal(clips.length, 1);
  assert.equal(clips[0].start, 2);
  assert.equal(clips[0].transcript.includes("welcome back"), false);
  assert.equal(clips[0].duration, 15);
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

  assert.equal(clips.length, 1);
  assert.match(clips[0].transcript, /(?:result|lesson)/i);
  assert.equal(clips.some((clip) => /promo code/i.test(clip.transcript)), false);
});

test("highlight ranking rewards meaningful speaker interaction", () => {
  const dialogue = rankHighlights([
    { start: 0, end: 6, speaker: "host", text: "Why did the strategy fail for so many creators?" },
    { start: 6, end: 12, speaker: "guest", text: "Because the opening gave viewers no reason to keep watching." },
    { start: 12, end: 18, speaker: "host", text: "So the fix is to show the value before the explanation?" },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  const monologue = rankHighlights([
    { start: 0, end: 6, text: "Why did the strategy fail for so many creators?" },
    { start: 6, end: 12, text: "Because the opening gave viewers no reason to keep watching." },
    { start: 12, end: 18, text: "So the fix is to show the value before the explanation." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  assert.equal(dialogue.length, 1);
  assert.equal(monologue.length, 1);
  assert.ok(dialogue[0].score > monologue[0].score);
  assert.deepEqual(dialogue[0].speakers, ["host", "guest"]);
});

test("AI nearby context keeps setup, clip content, and payoff balanced", () => {
  const context = selectNearbyContext([
    { start: 0, end: 4, text: "Earlier setup." },
    { start: 4, end: 8, text: "Key setup detail." },
    { start: 8, end: 12, text: "Inside one." },
    { start: 12, end: 16, text: "Inside two." },
    { start: 16, end: 20, text: "Inside three." },
    { start: 20, end: 24, text: "Inside four." },
    { start: 24, end: 28, text: "Inside five." },
    { start: 28, end: 32, text: "Inside six." },
    { start: 32, end: 36, text: "Payoff detail." },
    { start: 32, end: 36, text: "Later context." },
  ], 10, 26, 8);

  assert.deepEqual(context.map((item) => item.text), [
    "Earlier setup.",
    "Key setup detail.",
    "Inside one.",
    "Inside two.",
    "Inside four.",
    "Inside five.",
    "Inside six.",
    "Later context.",
  ]);
  assert.equal(context.length, 8);
});
