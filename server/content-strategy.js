const PROFILES = {
  creator: { label: "Creator", focus: "hooks, personality, memorable statements, stories, humor, surprising moments", reject: "slow setup and generic commentary" },
  podcast: { label: "Podcast", focus: "strong opinions, stories, debates, lessons, emotional moments, quotable statements", reject: "long context before the point and repetitive introductions" },
  streamer: { label: "Streamer", focus: "reactions, wins, fails, funny interactions, surprises, intense moments", reject: "dead air and routine gameplay" },
  marketer: { label: "Marketer", focus: "pain points, benefits, objections, proof, hooks, calls-to-action and persuasive statements", reject: "vague claims and weak openings" },
  ecommerce: { label: "E-commerce", focus: "product benefits, demonstrations, objections, transformations, proof and purchase-driving moments", reject: "generic brand talk without a clear benefit" },
  real_estate: { label: "Real Estate", focus: "property highlights, neighborhood insights, investment points, buyer objections, market insights and lead-generating hooks", reject: "generic property tours without a compelling point" },
  agency: { label: "Agency", focus: "client results, strategic insights, before-and-after stories, expert opinions and reusable educational moments", reject: "internal process chatter and filler" },
  church: { label: "Church", focus: "encouragement, teaching, testimony, practical lessons, memorable faith-centered statements and emotional moments", reject: "administrative announcements and repetitive setup" },
  media: { label: "Media & Entertainment", focus: "stories, reactions, interviews, surprising moments, cultural commentary and audience-grabbing hooks", reject: "generic exposition and filler" },
  advertiser: { label: "Advertiser", focus: "high-impact hooks, benefits, proof, objections, product demonstrations and clear calls-to-action", reject: "weak openings and unsupported claims" }
};
export function normalizeContentProfile(value) {
  const key = String(value || "creator").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  return PROFILES[key] ? key : "creator";
}
export function getContentProfile(value) {
  const key = normalizeContentProfile(value);
  return { key, ...PROFILES[key] };
}
export function listContentProfiles() {
  return Object.entries(PROFILES).map(([key, profile]) => ({ key, label: profile.label }));
}
