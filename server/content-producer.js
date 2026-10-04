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

export function summarizePerformance(clips = []) {
  const safeClips = Array.isArray(clips) ? clips : [];
  const tracked = safeClips.filter((clip) => clip?.performance && Number.isFinite(Number(clip.performance.views)));
  const totals = tracked.reduce((sum, clip) => {
    const metric = clip.performance || {};
    sum.views += Math.max(0, Number(metric.views) || 0);
    sum.likes += Math.max(0, Number(metric.likes) || 0);
    sum.comments += Math.max(0, Number(metric.comments) || 0);
    sum.shares += Math.max(0, Number(metric.shares) || 0);
    sum.watchTime += Math.max(0, Number(metric.watchTimeSeconds) || 0);
    return sum;
  }, { views: 0, likes: 0, comments: 0, shares: 0, watchTime: 0 });
  const engagementRate = totals.views
    ? Number((((totals.likes + totals.comments + totals.shares) / totals.views) * 100).toFixed(2))
    : null;
  const byPlatform = {};
  for (const clip of tracked) {
    const metric = clip.performance || {};
    const platform = String(metric.platform || "unknown").trim().toLowerCase() || "unknown";
    const entry = byPlatform[platform] || { platform, clips: 0, views: 0, engagements: 0 };
    entry.clips += 1;
    entry.views += Math.max(0, Number(metric.views) || 0);
    entry.engagements += Math.max(0, Number(metric.likes) || 0) + Math.max(0, Number(metric.comments) || 0) + Math.max(0, Number(metric.shares) || 0);
    byPlatform[platform] = entry;
  }
  const byType = {};
  for (const clip of tracked) {
    const type = String(clip.highlightType || "insight").trim().toLowerCase();
    const metric = clip.performance || {};
    const entry = byType[type] || { type, clips: 0, views: 0, engagements: 0 };
    entry.clips += 1;
    entry.views += Math.max(0, Number(metric.views) || 0);
    entry.engagements += Math.max(0, Number(metric.likes) || 0) + Math.max(0, Number(metric.comments) || 0) + Math.max(0, Number(metric.shares) || 0);
    byType[type] = entry;
  }
  return {
    trackedClips: tracked.length,
    totals,
    engagementRate,
    byType: Object.values(byType).map((entry) => ({
      ...entry,
      engagementRate: entry.views ? Number(((entry.engagements / entry.views) * 100).toFixed(2)) : null,
    })).sort((a, b) => b.views - a.views),
    byPlatform: Object.values(byPlatform).map((entry) => ({
      ...entry,
      engagementRate: entry.views ? Number(((entry.engagements / entry.views) * 100).toFixed(2)) : null,
    })).sort((a, b) => b.views - a.views),
  };
}

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
  const performance = summarizePerformance(safeClips);
  const missingTypes = Object.keys(TYPE_LABELS).filter((type) => !counts[type]);
  const provenTypes = performance.byType
    .filter((entry) => entry.views >= 100)
    .sort((a, b) => (b.engagementRate || 0) - (a.engagementRate || 0))
    .slice(0, 2)
    .map((entry) => entry.type);
  const priorities = provenTypes.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    recommendation: "Double down on this format: it has the strongest tracked engagement so far for this project.",
  }));
  for (const item of missingTypes.slice(0, 3 - priorities.length)) {
    priorities.push({
      type: item,
      label: TYPE_LABELS[item],
      recommendation: TYPE_NEEDS[item],
    });
  }
  if (!priorities.length) {
    const weakest = Object.entries(counts).sort((a, b) => a[1] - b[1]).slice(0, 2);
    for (const [type] of weakest) {
      if (TYPE_NEEDS[type]) priorities.push({ type, label: TYPE_LABELS[type] || type, recommendation: TYPE_NEEDS[type] });
    }
  }
  const recommendedType = provenTypes[0] || priorities[0]?.type || Object.keys(TYPE_LABELS)[0];
  const recommendedReason = provenTypes[0]
    ? "Publish another " + (TYPE_LABELS[recommendedType] || recommendedType) + " next because this format currently leads your tracked engagement."
    : priorities[0]
      ? "Test a " + (TYPE_LABELS[recommendedType] || recommendedType) + " next to strengthen your content mix."
      : "Start with a strong hook and let performance data guide the next recommendation.";
  const recommendationConfidence = provenTypes[0] ? "high" : performance.trackedClips ? "medium" : "low";
  const platformLeader = performance.byPlatform[0] || null;
  const platformEngagementLeader = [...performance.byPlatform]
    .filter((entry) => entry.views >= 100)
    .sort((a, b) => (b.engagementRate || 0) - (a.engagementRate || 0))[0] || null;
  const platformRecommendation = platformLeader
    ? "Prioritize " + platformLeader.platform + " for the next test because it has the most tracked views in this project."
    : "Log platform results after publishing so ClipForge can learn where your content performs best.";
  const platformEngagementRecommendation = platformEngagementLeader
    ? "For engagement, " + platformEngagementLeader.platform + " currently leads at " + platformEngagementLeader.engagementRate + "%."
    : "More platform performance data is needed before comparing engagement.";
  const nextPublishPlan = {
    type: recommendedType,
    typeLabel: TYPE_LABELS[recommendedType] || recommendedType,
    platform: platformLeader?.platform || null,
    confidence: recommendationConfidence,
    reason: platformLeader ? recommendedReason + " " + platformRecommendation : recommendedReason,
  };
  return {
    strategy: { key: strategy.key, label: strategy.label, focus: strategy.focus },
    performance,
    provenTypes,
    nextPublish: { type: recommendedType, label: TYPE_LABELS[recommendedType] || recommendedType, reason: recommendedReason, confidence: recommendationConfidence },
    platformRecommendation: { platform: platformLeader?.platform || null, reason: platformRecommendation, engagementLeader: platformEngagementLeader?.platform || null, engagementReason: platformEngagementRecommendation },
    nextPublishPlan,
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
