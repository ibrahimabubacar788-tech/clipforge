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


export async function rankHighlightsWithAI(segments, { limit = 12, minDuration = 15, maxDuration = 75 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = () => rankHighlights(segments, { limit, minDuration, maxDuration });
  if (!apiKey) return { candidates: fallback(), engine: "heuristic-fallback" };

  const baseline = rankHighlights(segments, {
    limit: Math.min(40, Math.max(limit * 3, limit)),
    minDuration,
    maxDuration,
  });
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
              text: `Select the strongest short-form video moments from these transcript windows.
Prefer standalone hooks, surprising insights, emotion, humor, conflict, story payoffs, useful information, or memorable statements.
Reject filler, contextless fragments, repetitive introductions, and sponsor boilerplate.
Return ONLY JSON in this exact shape: {"selections":[{"id":0,"score":95,"reason":"brief reason","title":"short title"}]}.
Use only supplied IDs. Score each selection from 0 to 100. Do not invent timestamps.`,
            }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify({ requested: limit, candidates }) }],
          },
        ],
        max_output_tokens: Math.max(800, limit * 120),
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
    const selections = Array.isArray(parsed.selections) ? parsed.selections : [];
    const byId = new Map(baseline.map((item, id) => [id, item]));
    const ranked = selections.map((selection) => {
      const base = byId.get(Number(selection.id));
      if (!base) return null;
      const score = Number(selection.score);
      return {
        ...base,
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : base.score,
        aiScore: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null,
        aiReason: String(selection.reason || "").trim().slice(0, 240),
        title: String(selection.title || base.title).replace(/\s+/g, " ").trim().slice(0, 100) || base.title,
      };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.start - b.start);

    const selected = [];
    const addIfDistinct = (candidate) => {
      if (!candidate || selected.length >= limit) return false;
      const overlaps = selected.some((item) => Math.max(item.start, candidate.start) < Math.min(item.end, candidate.end) - 2);
      if (overlaps) return false;
      selected.push(candidate);
      return true;
    };

    for (const candidate of ranked) {
      if (selected.length >= limit) break;
      addIfDistinct(candidate);
    }

    // If the model returns fewer clips than requested, fill the remaining slots
    // with the strongest non-overlapping baseline candidates. This keeps the
    // automatic pipeline productive when the model is conservative or truncates
    // its JSON response, while preserving AI selections at the top.
    for (const candidate of baseline) {
      if (selected.length >= limit) break;
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
