import test from "node:test";
import assert from "node:assert/strict";
import { buildProducerPlan } from "../server/content-producer.js";

test("producer plan identifies missing intelligence types", () => {
  const plan = buildProducerPlan([
    { id: "a", title: "Hook", highlightType: "hook", highlightScore: 91 },
    { id: "b", title: "Reveal", highlightType: "reveal", highlightScore: 84 },
  ], "podcast");
  assert.equal(plan.strategy.label, "Podcast");
  assert.equal(plan.totalClips, 2);
  assert.equal(plan.averageScore, 88);
  assert.equal(plan.strongest.id, "a");
  assert.ok(plan.priorities.some((item) => item.type === "payoff"));
});

test("producer plan falls back safely for empty projects", () => {
  const plan = buildProducerPlan([], "unknown");
  assert.equal(plan.strategy.key, "creator");
  assert.equal(plan.totalClips, 0);
  assert.equal(plan.averageScore, null);
  assert.equal(plan.strongest, null);
  assert.equal(plan.priorities.length, 3);
});


test("producer performance summary identifies proven intelligence types", () => {
  const plan = buildProducerPlan([
    { id: "a", highlightType: "hook", highlightScore: 90, performance: { views: 1000, likes: 100, comments: 20, shares: 30 } },
    { id: "b", highlightType: "hook", highlightScore: 85, performance: { views: 500, likes: 20, comments: 5, shares: 5 } },
    { id: "c", highlightType: "emotion", highlightScore: 88, performance: { views: 800, likes: 24, comments: 8, shares: 8 } },
  ], "creator");
  assert.equal(plan.performance.trackedClips, 3);
  assert.equal(plan.performance.totals.views, 2300);
  assert.equal(plan.performance.totals.likes, 144);
  assert.equal(plan.performance.engagementRate, 9.57);
  assert.equal(plan.provenTypes[0], "hook");
  assert.ok(plan.performance.byType.some((item) => item.type === "hook" && item.views === 1500));
});
