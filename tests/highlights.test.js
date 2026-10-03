import test from "node:test";
import assert from "node:assert/strict";
import { rankHighlights, rankHighlightsWithAI } from "../server/highlights.js";

test("highlight engine returns ranked non-overlapping candidates with speaker data", () => {
  const segments = [];
  for (let i = 0; i < 12; i += 1) {
    const start = i * 5;
    const text = i === 2
      ? "Here is the thing: the biggest mistake creators make is waiting too long because the audience needs the answer now!"
      : `This is supporting transcript sentence number ${i} with useful context for the audience.`;
    segments.push({ start, end: start + 5, text, speaker: i % 2 ? "SPEAKER B" : "SPEAKER A" });
  }
  const candidates = rankHighlights(segments, { limit: 40, minDuration: 15, maxDuration: 75 });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.length <= 40);
  assert.equal(candidates[0].rank, 1);
  assert.ok(candidates[0].score > 0);
  assert.ok(candidates[0].transcript.includes("biggest mistake"));
  assert.ok(candidates[0].speakers.includes("SPEAKER A"));
  assert.ok(candidates.every((item) => item.duration >= 15 && item.duration <= 75));
  for (let i = 1; i < candidates.length; i += 1) {
    assert.ok(Math.max(candidates[i - 1].start, candidates[i].start) >= Math.min(candidates[i - 1].end, candidates[i].end) - 2);
  }
});

test("highlight engine ignores malformed transcript segments", () => {
  const candidates = rankHighlights([
    { start: 0, end: 0, text: "bad" },
    { start: "nope", end: 2, text: "bad" },
    { start: 0, end: 20, text: "A valid story about how something finally worked." },
  ], { limit: 40 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].start, 0);
});

test("highlight engine caps oversized transcript input", () => {
  const segments = Array.from({ length: 5001 }, (_, index) => ({
    start: index,
    end: index + 1,
    text: `segment ${index}`,
  }));
  const candidates = rankHighlights(segments, { limit: 40, minDuration: 15, maxDuration: 75 });
  assert.ok(candidates.length <= 40);
  assert.ok(candidates.every((item) => item.end <= 5000));
});

test("highlight engine caps oversized segment text and speaker fields", () => {
  const longText = "x".repeat(2000);
  const longSpeaker = "speaker ".repeat(100);
  const candidates = rankHighlights([
    { start: 0, end: 20, text: longText, speaker: longSpeaker },
  ], { limit: 1, minDuration: 15, maxDuration: 75 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].transcript.length, 500);
  assert.equal(candidates[0].title.length, 72);
  assert.equal(candidates[0].speakers[0].length, 120);
  assert.equal(candidates[0].captionSegments[0].text.length, 500);
  assert.equal(candidates[0].captionSegments[0].speaker.length, 120);
});

test("highlight engine normalizes unsafe ranking options", () => {
  const candidates = rankHighlights([
    { start: 0, end: 20, text: "A useful story about how this finally worked." },
  ], { limit: 999999, minDuration: "bad", maxDuration: -10 });
  assert.equal(candidates.length, 1);
  assert.ok(candidates[0].duration >= 15);
  assert.ok(candidates[0].duration <= 75);
});

test("AI highlight wrapper normalizes unsafe options without an API key", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, text: "A useful story about how this finally worked." },
    ], { limit: 999999, minDuration: "bad", maxDuration: -10 });
    assert.equal(result.engine, "heuristic-fallback");
    assert.equal(result.candidates.length, 1);
    assert.ok(result.candidates[0].duration >= 15);
    assert.ok(result.candidates[0].duration <= 75);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
