import test from "node:test";
import assert from "node:assert/strict";
import { buildContentPack } from "../server/content-packaging.js";

test("content packaging creates platform-ready variants from clip intelligence", () => {
  const pack = buildContentPack({
    title: "The biggest mistake creators make",
    transcript: "The biggest mistake creators make is waiting too long to publish.",
    highlightType: "reveal",
    contentProfile: "creator",
    contentProfileLabel: "Creators",
    aiReason: "Strong curiosity gap and standalone value.",
    highlightScore: 94,
  });
  assert.equal(pack.intelligence.type, "reveal");
  assert.equal(pack.intelligence.score, 94);
  assert.ok(pack.platforms.tiktok.caption.includes("The part nobody tells you:"));
  assert.ok(pack.platforms.youtube.hashtags.includes("#shorts"));
  assert.ok(pack.platforms.linkedin.caption.includes("What do you think?"));
  assert.equal(Object.keys(pack.platforms).length, 5);
});

test("content packaging safely falls back for incomplete clips", () => {
  const pack = buildContentPack({});
  assert.equal(pack.intelligence.type, "insight");
  assert.equal(pack.intelligence.strategy, "Creator");
  assert.ok(pack.platforms.instagram.title);
  assert.ok(pack.platforms.x.hashtags.length > 0);
});
