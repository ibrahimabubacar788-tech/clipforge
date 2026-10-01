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
  text: String(segment.text || "").trim(),
  speaker: segment.speaker ? String(segment.speaker).trim() : undefined,
});
function valid(segment) {
  return Number.isFinite(segment.start) && Number.isFinite(segment.end)
    && segment.start >= 0 && segment.end > segment.start && segment.text;
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
export function rankHighlights(segments, { limit = 40, minDuration = 15, maxDuration = 75 } = {}) {
  const clean = segments.map(normalize).filter(valid).sort((a, b) => a.start - b.start);
  const candidates = [];
  for (let i = 0; i < clean.length; i += 1) {
    let text = "";
    const start = clean[i].start;
    let end = start;
    const speakers = new Set();
    for (let j = i; j < clean.length; j += 1) {
      const next = clean[j];
      if (next.start - start > maxDuration) break;
      end = Math.max(end, next.end);
      text = text ? `${text} ${next.text}` : next.text;
      if (next.speaker) speakers.add(next.speaker);
      const duration = end - start;
      if (duration < minDuration) continue;
      if (duration > maxDuration) break;
      candidates.push({
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
        duration: Number(duration.toFixed(3)),
        score: scoreWindow(text, duration),
        title: text.replace(/\s+/g, " ").slice(0, 72) || "Untitled highlight",
        transcript: text,
        speakers: [...speakers],
        captionSegments: clean.slice(i, j + 1).filter((item) => item.end > start && item.start < end),
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const selected = [];
  const max = Math.max(1, Math.min(40, Number(limit) || 40));
  for (const candidate of candidates) {
    if (selected.length >= max) break;
    const overlaps = selected.some((item) => Math.max(item.start, candidate.start) < Math.min(item.end, candidate.end) - 2);
    if (!overlaps) selected.push(candidate);
  }
  return selected.map((item, index) => ({ ...item, rank: index + 1 }));
}
