import { getContentProfile } from "./content-strategy.js";

const TYPE_LABELS = {
  hook: "Hooks",
  reveal: "Reveals",
  payoff: "Payoffs",
  "how-to": "How-to",
  humor: "Humor",
  emotion: "Emotion",
  insight: "Insights",
};

const TYPE_NEEDS = {
  hook: "Create a stronger opening that makes the viewer stop immediately.",
  reveal: "Look for a surprising fact, secret, mistake, or unexpected turn.",
  payoff: "Find moments with a clear result, conclusion, or story payoff.",
  "how-to": "Find practical step-by-step moments viewers can apply.",
  humor: "Capture a funny reaction, joke, failure, or unexpected interaction.",
  emotion: "Find a genuine emotional moment with a clear human feeling.",
  insight: "Extract a memorable lesson, opinion, or useful idea.",
};

export function buildProducerPlan(clips = [], profile = "creator") {
  const safeClips = Array.isArray(clips) ? clips : [];
  const strategy = getContentProfile(profile);
  const counts = safeClips.reduce((map, clip) => {
    const type = String(clip.highlightType || "insight").trim().toLowerCase();
    map[type] = (map[type] || 0) + 1;
    return map;
  }, {});
  const scored = safeClips.filter((clip) => Number.isFinite(Number(clip.highlightScore)));
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, clip) => sum + Number(clip.highlightScore), 0) / scored.length)
    : null;
  const strongest = [...safeClips].sort((a, b) => Number(b.highlightScore || 0) - Number(a.highlightScore || 0))[0] || null;
  const missingTypes = Object.keys(TYPE_LABELS).filter((type) => !counts[type]);
  const priorities = missingTypes.slice(0, 3).map((type) => ({
    type,
    label: TYPE_LABELS[type],
    recommendation: TYPE_NEEDS[type],
  }));
  if (!priorities.length) {
    const weakest = Object.entries(counts).sort((a, b) => a[1] - b[1]).slice(0, 2);
    for (const [type] of weakest) {
      if (TYPE_NEEDS[type]) priorities.push({ type, label: TYPE_LABELS[type] || type, recommendation: TYPE_NEEDS[type] });
    }
  }
  return {
    strategy: { key: strategy.key, label: strategy.label, focus: strategy.focus },
    totalClips: safeClips.length,
    averageScore,
    strongest: strongest ? {
      id: strongest.id || null,
      title: String(strongest.title || "Untitled clip").slice(0, 100),
      type: String(strongest.highlightType || "insight"),
      score: Number.isFinite(Number(strongest.highlightScore)) ? Math.round(Number(strongest.highlightScore)) : null,
    } : null,
    mix: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, label: TYPE_LABELS[type] || type, count })),
    priorities,
  };
}
