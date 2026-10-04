import { getContentProfile, normalizeContentProfile } from "./content-strategy.js";
const HOOKS = [
  /\bhere'?s the thing\b/i, /\byou need to know\b/i, /\bthe truth is\b/i,
  /\bthe biggest\b/i, /\bsecret\b/i, /\bmistake\b/i, /\bnever\b/i,
  /\bwhy\b/i, /\bhow\b/i, /\bimagine\b/i, /\bstory\b/i,
  /\bfirst time\b/i, /\bfinally\b/i,
];
const PAYOFFS = [
  /\bbut\b/i, /\bso\b/i, /\bbecause\b/i, /\bthat means\b/i,
  /\bturns out\b/i, /\bended up\b/i, /\bresult\b/i,
];
const normalize = (segment) => ({
  start: Number(segment.start),
  end: Number(segment.end),
  text: String(segment.text || "").trim().slice(0, 500),
  speaker: segment.speaker ? String(segment.speaker).trim().slice(0, 120) : undefined,
});
function valid(segment) {
  return Number.isFinite(segment.start) && Number.isFinite(segment.end)
    && segment.start >= 0 && segment.end > segment.start && segment.text;
}
function classifyHighlight(text) {
  const value = String(text || "");
  if (/\b(how|steps?|do this|here'?s how|tutorial|learn)\b/i.test(value)) return "how-to";
  if (/\b(secret|truth|biggest|mistake|never|nobody|surprising|didn'?t expect)\b/i.test(value)) return "reveal";
  if (/[!?]/.test(value) && /\b(you|your|we|I|my)\b/i.test(value)) return "hook";
  if (/\b(because|that means|result|ended up|finally|then|after)\b/i.test(value)) return "payoff";
  if (/\b(laugh|funny|joke|hilarious|crazy)\b/i.test(value)) return "humor";
  if (/\b(feel|felt|love|hate|scared|happy|sad|angry|emotional)\b/i.test(value)) return "emotion";
  return "insight";
}

function scoreWindow(text, duration) {
  let score = 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words >= 12) score += 10;
  if (words >= 25) score += 8;
  if (words >= 45) score += 5;
  if (/[!?]/.test(text)) score += 8;
  if (HOOKS.some((pattern) => pattern.test(text))) score += 22;
  if (PAYOFFS.some((pattern) => pattern.test(text))) score += 10;
  if (/\b(you|your|we|I|my)\b/i.test(text)) score += 5;
  if (duration >= 15 && duration <= 75) score += 15;
  if (duration > 90) score -= 10;
  return score;
}
function collectRankedHighlights(segments, { limit = 10, minDuration = 15, maxDuration = 75, candidateLimit } = {}) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const safeMinDuration = Number.isFinite(Number(minDuration)) ? Math.min(300, Math.max(0, Number(minDuration))) : 15;
  const parsedMaxDuration = Number(maxDuration);
  const safeMaxDuration = Number.isFinite(parsedMaxDuration) && parsedMaxDuration > 0
    ? Math.max(safeMinDuration, Math.min(300, parsedMaxDuration))
    : 75;
  const clean = (Array.isArray(segments) ? segments.slice(0, 5000) : [])
    .map(normalize).filter(valid).sort((a, b) => a.start - b.start);
  const candidates = [];
  for (let i = 0; i < clean.length; i += 1) {
    let text = "";
    const start = clean[i].start;
    let end = start;
    const speakers = new Set();
    for (let j = i; j < clean.length; j += 1) {
      const next = clean[j];
      if (next.start - start > safeMaxDuration) break;
      end = Math.max(end, next.end);
      text = text ? `function () { [native code] } ${next.text}` : next.text;
      if (next.speaker) speakers.add(next.speaker);
      const duration = end - start;
      if (duration < safeMinDuration) continue;
      if (duration > safeMaxDuration) break;
      candidates.push({
        start: Number(start.toFixed(3)), end: Number(end.toFixed(3)),
        duration: Number(duration.toFixed(3)), score: scoreWindow(text, duration),
        highlightType: classifyHighlight(text),
        title: text.replace(/\s+/g, " ").slice(0, 72) || "Untitled highlight",
        transcript: text, speakers: [...speakers],
        captionSegments: clean.slice(i, j + 1).filter((item) => item.end > start && item.start < end),
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const parsedCandidateLimit = Number(candidateLimit);
  const safeCandidateLimit = Number.isFinite(parsedCandidateLimit)
    ? Math.max(safeLimit, Math.min(150, Math.floor(parsedCandidateLimit)))
    : safeLimit;
  const selected = [];
  for (const candidate of candidates) {
    if (selected.length >= safeCandidateLimit) break;
    const overlaps = selected.some((item) => Math.max(item.start, candidate.start) < Math.min(item.end, candidate.end) - 2);
    if (!overlaps) selected.push(candidate);
  }
  return selected;
}

export function rankHighlights(segments, options = {}) {
  const safeLimit = Math.max(1, Math.min(50, Number(options.limit) || 10));
  return collectRankedHighlights(segments, { ...options, limit: safeLimit, candidateLimit: safeLimit })
    .slice(0, safeLimit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

