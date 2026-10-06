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


test("AI highlight ranking receives a lightweight map of the full conversation", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  let requestBody = "";
  globalThis.fetch = async (_url, options) => {
    requestBody = String(options?.body || "");
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        selections: [{ id: 0, score: 92, reason: "Strong complete moment", title: "The result", type: "payoff" }],
      }),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, text: "The conversation begins with a problem creators keep facing." },
      { start: 100, end: 120, text: "Later we discover the unexpected reason the problem happens." },
      { start: 200, end: 220, text: "Finally the result shows exactly how the problem was solved." },
    ], { limit: 1, minDuration: 20, maxDuration: 20 });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.equal(result.candidates.length, 1);
    assert.match(requestBody, /Global conversation map/);
    assert.match(requestBody, /problem creators keep facing/);
    assert.match(requestBody, /unexpected reason/);
    assert.match(requestBody, /problem was solved/);
    assert.match(requestBody, /nearbyContext/);
    assert.match(requestBody, /unexpected reason/);
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

test("AI highlight packs reject near-duplicate transcript windows", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      selections: [
        { id: 0, score: 99, reason: "Best version", title: "Main point", type: "reveal" },
        { id: 1, score: 98, reason: "Nearly identical", title: "Main point again", type: "reveal" },
        { id: 2, score: 90, reason: "Different point", title: "Different insight", type: "payoff" },
      ],
    }),
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, text: "The biggest lesson is that creators should focus on one clear idea and make the result useful for the audience." },
      { start: 100, end: 120, text: "Creators should focus on one clear idea and make the result useful for the audience today." },
      { start: 200, end: 220, text: "The surprising result is that consistency matters more than posting every single day." },
    ], { limit: 2, minDuration: 20, maxDuration: 20 });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].start, 0);
    const starts = result.candidates.map((candidate) => candidate.start);
    assert.equal(starts.length, 2);
    assert.ok(starts.includes(0));
    assert.ok(starts.includes(200));
    assert.equal(starts.includes(100), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});


test("highlight engine prefers natural sentence boundaries over dangling fragments", () => {
  const candidates = rankHighlights([
    { start: 0, end: 5, text: "And because," },
    { start: 5, end: 10, text: "this is only the beginning of a useful explanation" },
    { start: 10, end: 15, text: "the result is clear and memorable for creators." },
    { start: 15, end: 20, text: "It gives creators a useful result." },
    { start: 100, end: 105, text: "Here is a complete useful idea that creators can apply today." },
    { start: 105, end: 110, text: "It ends cleanly with a result." },
    { start: 110, end: 115, text: "This is another useful sentence for creators." },
    { start: 115, end: 120, text: "Thanks for watching." },
  ], { limit: 2, minDuration: 15, maxDuration: 20 });
  assert.equal(candidates.length, 2);
  assert.ok(candidates.every((item) => /[.!?][“”'"')]*$/.test(item.transcript)));
  assert.equal(/^(?:and|but|or|because|which|that|if|when|while|although|yet|then)\b/i.test(candidates[0].transcript), false);
  assert.equal(candidates.some((item) => item.start === 0), false);
});


test("highlight engine rewards early retention signals", () => {
  const strong = rankHighlights([
    { start: 0, end: 25, text: "The key result is simple for creators. Start with the problem, show the surprising result, explain the method that worked, and give the audience a clear lesson they can use today." },
  ], { limit: 1, minDuration: 15, maxDuration: 25 });
  const weak = rankHighlights([
    { start: 0, end: 25, text: "Welcome back everyone. Today we are going to talk about a few things. Basically, there are some ideas we can discuss before we get into the details." },
  ], { limit: 1, minDuration: 15, maxDuration: 25 });
  assert.equal(strong.length, 1);
  assert.equal(weak.length, 1);
  assert.ok(strong[0].score > weak[0].score);
});

test("highlight engine remains stable when evaluating speech pacing", () => {
  const candidates = rankHighlights([
    { start: 0, end: 20, text: "Here is the key lesson for creators. The result is simple and useful for your audience today." },
    { start: 100, end: 120, text: "Here is another useful explanation for creators. The result is clear and practical." },
  ], { limit: 2, minDuration: 15, maxDuration: 25 });
  assert.equal(candidates.length, 2);
  assert.ok(candidates.every((item) => Number.isFinite(item.score)));
});


test("AI highlight ranking preserves novelty, replayability, and specificity signals", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  let requestBody = "";
  globalThis.fetch = async (_url, options) => {
    requestBody = String(options?.body || "");
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        selections: [{
          id: 0,
          score: 90,
          hook: 88,
          standalone: 92,
          context: 90,
          payoff: 91,
          emotion: 70,
          clarity: 94,
          novelty: 96,
          replayability: 95,
          specificity: 93,
          reason: "Distinct, memorable payoff with concrete value.",
          title: "The key result",
          type: "payoff",
        }],
      }),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, text: "The surprising result is that creators can improve their videos by focusing on one clear idea, using a specific method, and measuring the result carefully." },
    ], { limit: 1, minDuration: 20, maxDuration: 20 });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].noveltyScore, 96);
    assert.equal(result.candidates[0].replayabilityScore, 95);
    assert.equal(result.candidates[0].specificityScore, 93);
    assert.match(requestBody, /replayability/);
    assert.match(requestBody, /specificity/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});


test("highlight engine understands transcript context beyond the selected window", () => {
  const candidates = rankHighlights([
    { start: 0, end: 5, text: "The company changed its pricing after losing important customers." },
    { start: 5, end: 10, text: "This is why the new strategy worked better for them." },
    { start: 10, end: 15, text: "It saved the team money and improved retention." },
    { start: 15, end: 20, text: "The result was a clear improvement for the business." },
    { start: 100, end: 105, text: "The key lesson is simple: define the problem clearly before choosing the solution." },
    { start: 105, end: 110, text: "Then test the solution with real customers and measure the result carefully." },
    { start: 110, end: 115, text: "That method gives you evidence instead of relying on guesses." },
  ], { limit: 3, minDuration: 15, maxDuration: 15 });

  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((item) => Number.isFinite(item.score)));
  const dependent = candidates.find((item) => item.start === 5);
  const standalone = candidates.find((item) => item.start === 100);
  if (dependent && standalone) assert.ok(standalone.score > dependent.score);
  assert.ok(candidates.some((item) => /key lesson|clear improvement|method gives/i.test(item.transcript)));
});


test("highlight engine rewards promise fulfillment when the opening setup is resolved later", () => {
  const fulfilled = rankHighlights([
    { start: 0, end: 6, text: "You will learn the exact method creators use to keep viewers watching." },
    { start: 6, end: 12, text: "First we define one clear problem and remove the unnecessary setup." },
    { start: 12, end: 18, text: "The reason it works is that the viewer understands the value immediately." },
    { start: 18, end: 24, text: "The result is stronger retention and a much clearer clip." },
  ], { limit: 1, minDuration: 15, maxDuration: 25 });

  const brokenPromise = rankHighlights([
    { start: 0, end: 6, text: "You will learn the exact method creators use to keep viewers watching." },
    { start: 6, end: 12, text: "Then we discuss several unrelated examples from different projects and topics." },
    { start: 12, end: 18, text: "There are also some general comments about editing and production." },
    { start: 18, end: 24, text: "It is interesting to see how different people approach their work." },
  ], { limit: 1, minDuration: 15, maxDuration: 25 });

  assert.equal(fulfilled.length, 1);
  assert.equal(brokenPromise.length, 1);
  assert.ok(fulfilled[0].score > brokenPromise[0].score);
});


test("highlight engine rewards belief reversal with a clear consequence", () => {
  const reversal = rankHighlights([
    { start: 0, end: 6, text: "I thought the fastest way to grow was to post more videos every day." },
    { start: 6, end: 12, text: "But I realized the real problem was that none of the videos had a clear hook." },
    { start: 12, end: 18, text: "That means fewer stronger clips worked better, and retention improved." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  const assumption = rankHighlights([
    { start: 0, end: 6, text: "I thought the fastest way to grow was to post more videos every day." },
    { start: 6, end: 12, text: "Then I kept posting more videos and talked about the editing process." },
    { start: 12, end: 18, text: "The schedule stayed busy and the workflow continued normally." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  assert.equal(reversal.length, 1);
  assert.equal(assumption.length, 1);
  assert.ok(reversal[0].score > assumption[0].score);
});


test("highlight engine rewards tension that resolves into a clear release", () => {
  const resolved = rankHighlights([
    { start: 0, end: 6, text: "We were under huge pressure because the launch was almost failing." },
    { start: 6, end: 12, text: "Then we discovered an unexpected problem in the process and had to change everything." },
    { start: 12, end: 18, text: "But we fixed the issue, the launch worked, and the final result was much better." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  const unresolved = rankHighlights([
    { start: 0, end: 6, text: "We were under huge pressure because the launch was almost failing." },
    { start: 6, end: 12, text: "Then we discovered an unexpected problem in the process and had to change everything." },
    { start: 12, end: 18, text: "We kept discussing the pressure, the process, and the problems around the launch." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  assert.equal(resolved.length, 1);
  assert.equal(unresolved.length, 1);
  assert.ok(resolved[0].score > unresolved[0].score);
});


test("highlight engine rewards semantic loop closure from setup to takeaway", () => {
  const closed = rankHighlights([
    { start: 0, end: 6, text: "The biggest problem was our customer retention after the first month." },
    { start: 6, end: 12, text: "We changed the onboarding process and measured customer retention every week." },
    { start: 12, end: 18, text: "In the end, that change improved customer retention because people understood the product sooner." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  const open = rankHighlights([
    { start: 0, end: 6, text: "The biggest problem was our customer retention after the first month." },
    { start: 6, end: 12, text: "We changed the onboarding process and discussed several unrelated design ideas." },
    { start: 12, end: 18, text: "The team also reviewed different tools and talked about future projects." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  assert.equal(closed.length, 1);
  assert.equal(open.length, 1);
  assert.ok(closed[0].score > open[0].score);
});


test("highlight engine rewards memorable quote-worthy phrasing", () => {
  const quotable = rankHighlights([
    { start: 0, end: 8, text: "The truth is, you do not need more tools. You need a better system, because the point is to make the work simpler and more useful." },
    { start: 8, end: 16, text: "We tested the process and the result was clear for the team." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  const ordinary = rankHighlights([
    { start: 0, end: 8, text: "We talked about some tools and then discussed several things that were available for the team to use." },
    { start: 8, end: 16, text: "We tested the process and the result was clear for the team." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  assert.equal(quotable.length, 1);
  assert.equal(ordinary.length, 1);
  assert.ok(quotable[0].score > ordinary[0].score);
});


test("highlight engine rewards strong audience reaction cues", () => {
  const reaction = rankHighlights([
    { start: 0, end: 8, text: "Wait, seriously? We thought the launch had failed, but then the numbers jumped and the result was unbelievable." },
    { start: 8, end: 16, text: "We reviewed the numbers and discussed the next steps with the team." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  const flat = rankHighlights([
    { start: 0, end: 8, text: "We reviewed the launch numbers and discussed the process with the team before moving on to the next topic." },
    { start: 8, end: 16, text: "We reviewed the numbers and discussed the next steps with the team." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  assert.equal(reaction.length, 1);
  assert.equal(flat.length, 1);
  assert.ok(reaction[0].score > flat[0].score);
});


test("highlight engine rewards clear concrete consequences", () => {
  const clear = rankHighlights([
    { start: 0, end: 8, text: "We changed the onboarding flow, which is why customer retention increased by 24% in three weeks and saved the team hours every day." },
    { start: 8, end: 16, text: "We discussed the process and there were some really good improvements for everyone." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  const vague = rankHighlights([
    { start: 0, end: 8, text: "We changed the onboarding flow and somehow things became a lot better for everyone after that." },
    { start: 8, end: 16, text: "We discussed the process and there were some really good improvements for everyone." },
  ], { limit: 1, minDuration: 15, maxDuration: 20 });

  assert.equal(clear.length, 1);
  assert.equal(vague.length, 1);
  assert.ok(clear[0].score > vague[0].score);
});


test("AI highlight packs cover different story stages when quality is comparable", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      selections: [
        { id: 0, score: 99, reason: "Opening hook", title: "Opening", type: "hook" },
        { id: 1, score: 98, reason: "Second opening hook", title: "Opening two", type: "hook" },
        { id: 2, score: 97, reason: "Third opening insight", title: "Opening three", type: "insight" },
        { id: 3, score: 88, reason: "Later payoff", title: "Final payoff", type: "payoff" },
      ],
    }),
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, text: "Here is the biggest lesson from the beginning of this story." },
      { start: 20, end: 40, text: "The opening problem became much clearer after we tested it." },
      { start: 40, end: 60, text: "Another useful insight from the opening section is this result." },
      { start: 80, end: 100, text: "The middle of the conversation explains how the method changed." },
      { start: 180, end: 200, text: "Finally, the result shows exactly what worked and why it mattered." },
      { start: 200, end: 220, text: "The final takeaway gives creators a clear result they can use." },
    ], { limit: 3, minDuration: 20, maxDuration: 20 });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.equal(result.candidates.length, 3);
    assert.ok(result.candidates.some((candidate) => candidate.start >= 180));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});


test("AI highlight packs cover different speakers when quality is comparable", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      selections: [
        { id: 0, score: 99, reason: "Host hook", title: "Host", type: "hook" },
        { id: 1, score: 98, reason: "Host insight", title: "Host two", type: "insight" },
        { id: 2, score: 88, reason: "Guest payoff", title: "Guest", type: "payoff" },
      ],
    }),
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, speaker: "Host", text: "The biggest lesson is how creators should structure their opening." },
      { start: 20, end: 40, speaker: "Host", text: "Another strong insight is why this method keeps viewers watching." },
      { start: 180, end: 200, speaker: "Guest", text: "The final result shows exactly what changed and why it worked." },
      { start: 200, end: 220, speaker: "Guest", text: "The takeaway is a practical result creators can use." },
    ], { limit: 2, minDuration: 20, maxDuration: 20 });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.some((candidate) => candidate.speakers?.includes("Guest")));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});


test("AI highlight ranking includes creator memory without allowing memory to become selectable candidates", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  let requestBody = "";
  globalThis.fetch = async (_url, options) => {
    requestBody = String(options?.body || "");
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        selections: [{ id: 0, score: 94, reason: "Strong new angle", title: "New angle", type: "insight" }],
      }),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, text: "The new episode explains a better approach to the topic." },
    ], {
      limit: 1,
      minDuration: 20,
      maxDuration: 20,
      creatorMemory: [
        { videoId: "vid_old", title: "Older episode", text: "Last month we discussed the original approach and its limitations." },
      ],
    });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.equal(result.candidates.length, 1);
    assert.match(requestBody, /Creator memory/);
    assert.match(requestBody, /original approach and its limitations/);
    assert.match(requestBody, /Do not select or invent moments from memory/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});


test("AI highlight candidates expose cross-video novelty intelligence", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  let requestBody = "";
  globalThis.fetch = async (_url, options) => {
    requestBody = String(options?.body || "");
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        selections: [{ id: 0, score: 91, novelty: 88, reason: "Fresh angle", title: "Fresh angle", type: "insight" }],
      }),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await rankHighlightsWithAI([
      { start: 0, end: 20, text: "The episode explains a different framework for building audiences." },
    ], {
      limit: 1,
      minDuration: 20,
      maxDuration: 20,
      creatorMemory: [
        { videoId: "previous", title: "Earlier episode", text: "The earlier framework for building audiences focused on consistency." },
      ],
    });
    assert.match(requestBody, /libraryNovelty/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});


test("AI highlight candidates expose cross-video continuity intelligence", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  let requestBody = "";
  globalThis.fetch = async (_url, options) => {
    requestBody = String(options?.body || "");
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        selections: [{ id: 0, score: 94, reason: "Meaningful update", title: "The update", type: "insight" }],
      }),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 20, text: "The new framework is better now because we changed the audience strategy and improved the result." },
    ], {
      limit: 1,
      minDuration: 20,
      maxDuration: 20,
      creatorMemory: [
        { videoId: "previous", title: "Earlier strategy", text: "The framework for the audience strategy focused on consistency." },
      ],
    });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.match(requestBody, /libraryRelationship/);
    assert.match(requestBody, /update/);
    assert.match(requestBody, /meaningful updates, reversals, continuations/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
