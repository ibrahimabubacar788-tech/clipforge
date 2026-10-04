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
