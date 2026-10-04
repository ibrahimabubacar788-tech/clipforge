import test from "node:test";
import assert from "node:assert/strict";
import { getContentProfile, listContentProfiles, normalizeContentProfile } from "../server/content-strategy.js";
test("normalizes content profiles", () => {
  assert.equal(normalizeContentProfile("podcast"), "podcast");
  assert.equal(normalizeContentProfile("REAL ESTATE"), "real_estate");
  assert.equal(normalizeContentProfile("unknown"), "creator");
});
test("profiles contain useful creator strategy", () => {
  const podcast = getContentProfile("podcast");
  assert.equal(podcast.label, "Podcast");
  assert.match(podcast.focus, /opinions/i);
  assert.ok(listContentProfiles().length >= 10);
});
