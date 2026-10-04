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


test("highlight engine caps extreme minimum duration", () => {
  const candidates = rankHighlights([{ start: 0, end: 20, text: "A useful story that should still be handled safely." }], { minDuration: 999999, maxDuration: 999999 });
  assert.equal(candidates.length, 0);
});

test("AI highlight wrapper caps oversized selection arrays", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  const segments = Array.from({ length: 30 }, (_, index) => ({
    start: index * 20,
    end: index * 20 + 20,
    text: `Here is the thing: useful highlight number ${index} with a memorable payoff.`,
  }));
  const selections = Array.from({ length: 200 }, (_, index) => ({
    id: index % 30,
    score: 100 - (index % 30),
    reason: "useful",
    title: `Highlight ${index}`,
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({
    output_text: JSON.stringify({ selections }),
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await rankHighlightsWithAI(segments, { limit: 2, minDuration: 15, maxDuration: 75 });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.ok(result.candidates.length <= 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("highlight engine classifies clip intelligence types", () => {
  const candidates = rankHighlights([
    { start: 0, end: 20, text: "Here is how you can avoid the biggest mistake and finally get the result." },
  ], { limit: 1, minDuration: 15, maxDuration: 75 });
  assert.equal(candidates.length, 1);
  assert.ok(["how-to", "reveal", "payoff", "hook", "insight"].includes(candidates[0].highlightType));
});


test("AI highlight selections use an allowed intelligence type and reject unknown values", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      selections: [
        { id: 0, score: 96, reason: "Strong reveal", title: "The hidden mistake", type: "reveal" },
        { id: 1, score: 95, reason: "Unknown type", title: "Fallback type", type: "made-up-type" },
      ],
    }),
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, text: "The secret is that creators often make this biggest mistake." },
      { start: 100, end: 120, text: "Here is useful context about how the process finally works." },
    ], { limit: 2, minDuration: 15, maxDuration: 75 });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.equal(result.candidates[0].highlightType, "reveal");
    assert.notEqual(result.candidates[1].highlightType, "made-up-type");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});


test("AI highlight packs diversify intelligence types before filling by score", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      selections: [
        { id: 0, score: 99, hook: 97, standalone: 95, payoff: 88, emotion: 70, clarity: 96, reason: "Strong hook", title: "Hook", type: "hook" },
        { id: 1, score: 98, reason: "Another hook", title: "Hook two", type: "hook" },
        { id: 2, score: 90, reason: "Useful payoff", title: "Payoff", type: "payoff" },
      ],
    }),
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, text: "Here is the first strong question for you." },
      { start: 100, end: 120, text: "Here is another strong question for you." },
      { start: 200, end: 220, text: "The result finally shows why this works." },
    ], { limit: 2, minDuration: 15, maxDuration: 75 });
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].highlightType, "hook");
    assert.equal(result.candidates[1].highlightType, "payoff");
    assert.equal(result.candidates[0].hookScore, 97);
    assert.equal(result.candidates[0].standaloneScore, 95);
    assert.equal(result.candidates[0].clarityScore, 96);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});


test("AI highlight wrapper sends producer target types to the model", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  let requestBody = "";
  globalThis.fetch = async (_url, options) => {
    requestBody = String(options?.body || "");
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        selections: [{ id: 0, score: 91, reason: "Good payoff", title: "Result", type: "payoff" }],
      }),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, text: "The result finally shows why this works." },
    ], { limit: 1, targetTypes: ["payoff", "payoff", "not-real"] });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.match(requestBody, /Prioritize these intelligence types for this batch: payoff/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
