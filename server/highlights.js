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
  // Reward clips that can stand alone: a clear opening, enough substance,
  // and a complete thought are more useful than arbitrary transcript windows.
  if (/^[^.!?]{8,}[.!?]/.test(text.trim())) score += 4;
  if (/\b(because|therefore|that means|which is why|so)\b/i.test(text)) score += 4;
  if (/\b(um+|uh+|you know|like|basically|sort of|kind of)\b/i.test(text)) score -= 4;
  if (/\b(subscribe|sponsored by|promo code|link in the description)\b/i.test(text)) score -= 12;
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
      text = text ? `${text} ${next.text}` : next.text;
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


export async function rankHighlightsWithAI(segments, { limit = 12, minDuration = 15, maxDuration = 75, profile = "creator", targetTypes = [] } = {}) {
  const contentProfile = getContentProfile(normalizeContentProfile(profile));
  const safeTargetTypes = [...new Set((Array.isArray(targetTypes) ? targetTypes : String(targetTypes || "").split(",")).map((type) => String(type || "").trim().toLowerCase()).filter((type) => ["hook", "reveal", "payoff", "how-to", "humor", "emotion", "insight"].includes(type)))].slice(0, 3);
  const apiKey = process.env.OPENAI_API_KEY;
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const safeMinDuration = Number.isFinite(Number(minDuration)) ? Math.min(300, Math.max(0, Number(minDuration))) : 15;
  const parsedMaxDuration = Number(maxDuration);
  const safeMaxDuration = Number.isFinite(parsedMaxDuration) && parsedMaxDuration > 0
    ? Math.max(safeMinDuration, Math.min(300, parsedMaxDuration))
    : 75;
  const fallback = () => rankHighlights(segments, { limit: safeLimit, minDuration: safeMinDuration, maxDuration: safeMaxDuration });
  if (!apiKey) return { candidates: fallback(), engine: "heuristic-fallback" };

  const baseline = collectRankedHighlights(segments, {
    limit: safeLimit,
    candidateLimit: Math.min(150, safeLimit * 3),
    minDuration: safeMinDuration,
    maxDuration: safeMaxDuration,
  }).map((item, index) => ({ ...item, rank: index + 1 }));
  if (!baseline.length) return { candidates: [], engine: "openai-highlights-v1" };

  const candidates = baseline.map((item, id) => ({
    id,
    start: item.start,
    end: item.end,
    duration: item.duration,
    transcript: item.transcript.slice(0, 1800),
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_HIGHLIGHT_MODEL || "gpt-6-luna",
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: `Select the strongest short-form video moments from these transcript windows.\nContent strategy: ${contentProfile.label}. Prioritize ${contentProfile.focus}. Reject ${contentProfile.reject}.
Prefer standalone hooks, surprising insights, emotion, humor, conflict, story payoffs, useful information, or memorable statements.
Reject filler, contextless fragments, repetitive introductions, and sponsor boilerplate.
${safeTargetTypes.length ? `Prioritize these intelligence types for this batch: ${safeTargetTypes.join(", ")}. Include them when the transcript genuinely supports them.` : ""}
Return ONLY JSON in this exact shape: {"selections":[{"id":0,"score":95,"hook":92,"standalone":94,"payoff":90,"emotion":78,"clarity":96,"reason":"brief reason","title":"short title","type":"hook"}]}.
For type, choose exactly one of: "hook", "reveal", "payoff", "how-to", "humor", "emotion", "insight".
Use only supplied IDs. Score each selection from 0 to 100. Do not invent timestamps.`,
            }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify({ requested: safeLimit, candidates }) }],
          },
        ],
        max_output_tokens: Math.max(800, safeLimit * 120),
      }),
    });

    const raw = await response.text();
    let data = {};
    try { data = JSON.parse(raw); } catch {}
    if (!response.ok) throw new Error(data?.error?.message || "Highlight analysis failed.");
    const text = String(
      data.output_text ||
      data.output?.find((item) => item.type === "message")?.content?.find((item) => item.type === "output_text")?.text ||
      ""
    ).trim();
    const cleaned = text.replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\x60\x60\x60$/i, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error("AI returned invalid highlight JSON.");
      parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    const allowedHighlightTypes = new Set(["hook", "reveal", "payoff", "how-to", "humor", "emotion", "insight"]);
    const selections = Array.isArray(parsed.selections) ? parsed.selections.slice(0, safeLimit * 3) : [];
    const byId = new Map(baseline.map((item, id) => [id, item]));
    const ranked = selections.map((selection) => {
      const base = byId.get(Number(selection.id));
      if (!base) return null;
      const score = Number(selection.score);
      return {
        ...base,
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : base.score,
        aiScore: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null,
        hookScore: Number.isFinite(Number(selection.hook)) ? Math.max(0, Math.min(100, Number(selection.hook))) : null,
        standaloneScore: Number.isFinite(Number(selection.standalone)) ? Math.max(0, Math.min(100, Number(selection.standalone))) : null,
        payoffScore: Number.isFinite(Number(selection.payoff)) ? Math.max(0, Math.min(100, Number(selection.payoff))) : null,
        emotionScore: Number.isFinite(Number(selection.emotion)) ? Math.max(0, Math.min(100, Number(selection.emotion))) : null,
        clarityScore: Number.isFinite(Number(selection.clarity)) ? Math.max(0, Math.min(100, Number(selection.clarity))) : null,
        aiReason: String(selection.reason || "").trim().slice(0, 240),
        highlightType: allowedHighlightTypes.has(String(selection.type || "").trim().toLowerCase())
          ? String(selection.type).trim().toLowerCase()
          : base.highlightType || "insight",
        title: String(selection.title || base.title).replace(/\s+/g, " ").trim().slice(0, 100) || base.title,
      };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.start - b.start);

    const selected = [];
    const tokenize = (value) => new Set(String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2));
    const similarity = (left, right) => {
      const a = tokenize(left);
      const b = tokenize(right);
      if (!a.size || !b.size) return 0;
      let shared = 0;
      for (const word of a) if (b.has(word)) shared += 1;
      return shared / (a.size + b.size - shared);
    };
    const addIfDistinct = (candidate) => {
      if (!candidate || selected.length >= safeLimit) return false;
      const overlaps = selected.some((item) => Math.max(item.start, candidate.start) < Math.min(item.end, candidate.end) - 2);
      if (overlaps) return false;
      const duplicate = selected.some((item) => similarity(item.transcript, candidate.transcript) >= 0.72);
      if (duplicate) return false;
      selected.push(candidate);
      return true;
    };

    // Build a more useful clip pack by giving distinct intelligence types
    // a chance before filling the remaining slots with pure score order.
    const seenTypes = new Set();
    for (const candidate of ranked) {
      if (selected.length >= safeLimit) break;
      const type = String(candidate.highlightType || "").trim().toLowerCase();
      if (type && seenTypes.has(type)) continue;
      if (addIfDistinct(candidate) && type) seenTypes.add(type);
    }
    for (const candidate of ranked) {
      if (selected.length >= safeLimit) break;
      addIfDistinct(candidate);
    }

    // If the model returns fewer clips than requested, fill the remaining slots
    // with the strongest non-overlapping baseline candidates. This keeps the
    // automatic pipeline productive when the model is conservative or truncates
    // its JSON response, while preserving AI selections at the top.
    for (const candidate of baseline) {
      if (selected.length >= safeLimit) break;
      addIfDistinct(candidate);
    }

    if (!selected.length) throw new Error("AI returned no usable highlight selections.");
    return { candidates: selected.map((item, index) => ({ ...item, rank: index + 1 })), engine: "openai-highlights-v1" };
  } catch (error) {
    return {
      candidates: fallback(),
      engine: "heuristic-fallback",
      aiError: error?.name === "AbortError" ? "Highlight analysis timed out." : String(error?.message || "Highlight analysis failed."),
    };
  } finally {
    clearTimeout(timer);
  }
}