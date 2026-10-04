const PLATFORM_RULES = {
  tiktok: { label: "TikTok", cta: "Follow for more.", hashtags: ["fyp", "viral"] },
  instagram: { label: "Instagram Reels", cta: "Save this and share it with someone who needs it.", hashtags: ["reels", "reelitfeelit"] },
  youtube: { label: "YouTube Shorts", cta: "Subscribe for more.", hashtags: ["shorts", "youtube"] },
  linkedin: { label: "LinkedIn", cta: "What do you think? Share your take.", hashtags: ["linkedin", "creatoreconomy"] },
  x: { label: "X", cta: "What would you add?", hashtags: ["creators", "content"] },
};
const TYPE_HOOKS = {
  hook: "You need to hear this.",
  reveal: "The part nobody tells you:",
  payoff: "And this is what happened next.",
  "how-to": "Here is how to do it.",
  humor: "This did NOT go as planned.",
  emotion: "This one hits differently.",
  insight: "One thing I learned:",
};
const cleanText = (value, max = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const tag = (value) => cleanText(value, 32).toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).join("");
function hashtags(clip, rule) {
  const profile = String(clip.contentProfile || "creator").replace(/_/g, "");
  const type = String(clip.highlightType || "insight").replace(/[^a-z0-9]/gi, "");
  return [...new Set([...rule.hashtags, profile, type].map(tag).filter(Boolean))].slice(0, 5).map((item) => "#" + item);
}
export function buildContentPack(clip = {}) {
  const title = cleanText(clip.title || clip.transcript || "Untitled clip", 100);
  const transcript = cleanText(clip.transcript || title, 260);
  const type = String(clip.highlightType || "insight").trim().toLowerCase();
  const hook = TYPE_HOOKS[type] || TYPE_HOOKS.insight;
  const reason = cleanText(clip.aiReason || "Selected as a strong standalone moment.", 180);
  const platforms = {};
  for (const [key, rule] of Object.entries(PLATFORM_RULES)) {
    platforms[key] = {
      platform: rule.label,
      title: title.length > 68 ? title.slice(0, 65).trimEnd() + "…" : title,
      hook,
      caption: cleanText(hook + " " + transcript + " " + rule.cta, 420),
      hashtags: hashtags(clip, rule),
    };
  }
  return {
    intelligence: {
      type,
      strategy: cleanText(clip.contentProfileLabel || "Creator", 80),
      reason,
      score: Number.isFinite(Number(clip.highlightScore)) ? Math.round(Number(clip.highlightScore)) : null,
    },
    platforms,
  };
}
