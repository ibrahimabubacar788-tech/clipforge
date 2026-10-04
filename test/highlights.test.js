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
