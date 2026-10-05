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
const CURIOSITY_GAPS = [
  /\b(?:what nobody tells you|the part people miss|here'?s what happened next|you'?d never guess|the surprising part|what I didn'?t expect|there'?s a reason)\b/i,
  /\b(?:I thought|we thought|I assumed|we assumed)\b/i,
];
const STAKES = [
  /\b(?:had to|couldn'?t|almost|nearly|risked|lost|won|failed|succeeded|changed everything|never forgot)\b/i,
  /\b(?:million|thousand|hundred|%|times)\b/i,
];
const STORY_ARCS = [
  /\b(?:before|after|then|until|finally|eventually|at first|in the end)\b/i,
  /\b(?:went from|used to|now I|now we|ended up|turned into|changed from)\b/i,
];
const EMOTIONAL_SHIFTS = [
  /\b(?:I was|we were|I felt|we felt|I got|we got)\b/i,
  /\b(?:relieved|excited|terrified|shocked|angry|proud|embarrassed|surprised|grateful|disappointed)\b/i,
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
  if (/\b(how|steps?|do this|here'?s how|tutorial|learn|tip|tips|lesson)\b/i.test(value)) return "how-to";
  if (/\b(secret|truth|biggest|mistake|never|nobody|surprising|didn'?t expect|turns out)\b/i.test(value)) return "reveal";
  if (/[!?]/.test(value) && /\b(you|your|we|I|my)\b/i.test(value)) return "hook";
  if (/\b(because|that means|result|ended up|finally|then|after|therefore|which is why)\b/i.test(value)) return "payoff";
  if (/\b(laugh|funny|joke|hilarious|crazy)\b/i.test(value)) return "humor";
  if (/\b(feel|felt|love|hate|scared|happy|sad|angry|emotional)\b/i.test(value)) return "emotion";
  return "insight";
}

function boundaryQualityScore(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  let score = 0;
  // Prefer windows that begin and end on natural linguistic boundaries.
  // This keeps auto-clips from opening/ending on dangling fragments.
  if (/^[A-Z0-9"“'‘]/.test(value)) score += 3;
  if (/[.!?]["”'’)]?$/.test(value)) score += 6;
  if (/[,:;]$/.test(value)) score -= 5;
  if (/(?:^|\s)(?:and|but|or|so|because|which|that|if|when|while|although|yet|then|than)$/i.test(value.replace(/[.!?,;:]+$/, ""))) score -= 7;
  if (/^(?:and|but|or|so|because|which|that|if|when|while|although|yet|then|than)\b/i.test(value)) score -= 7;
  if (/(?:\b(?:a|an|the|to|of|for|with|from|on|in|at|by|as|is|are|was|were|this|that)\s*)$/i.test(value.replace(/[.!?,;:]+$/, ""))) score -= 4;
  return score;
}

function standaloneContextScore(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  let score = 0;
  // Penalize transcript windows that depend heavily on an unseen previous sentence.
  // Keep normal conversational openings safe when they immediately provide a subject.
  if (/^(?:this|that|it|they|he|she|we|you)\b/i.test(value)
      && !/^(?:this|that|it)\s+(?:is|was|means|shows|happens|happened|can|will|would|should|matters|works|does|doesn't|isn't)\b/i.test(value)) {
    score -= 8;
  }
  if (/^(?:and|but|so|because|which|that|then|or)\b/i.test(value)) score -= 7;
  if (/\b(?:as I said|like I said|as we discussed|earlier|before this|the previous)\b/i.test(value)) score -= 6;
  if (/^(?:he|she|they)\b/i.test(value) && !/\b(?:named|called|is|was|are|were)\b/i.test(value.slice(0, 100))) score -= 4;
  // Reward clips that establish a subject early and close with a complete thought.
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length >= 16 && /\b(?:I|we|you|they|he|she)\b/i.test(value.slice(0, 90))) score += 3;
  if (/[.!?]["'”’)]?$/.test(value)) score += 3;
  return score;
}

function payoffPlacementScore(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 12) return 0;
  const payoffPattern = /\b(?:because|that means|turns out|ended up|result|which is why|therefore|realized|learned|discovered|changed|actually|so)\b/i;
  const positions = [];
  for (let i = 0; i < words.length; i += 1) if (payoffPattern.test(words[i])) positions.push(i / Math.max(1, words.length - 1));
  if (!positions.length) return 0;
  const strongest = Math.max(...positions);
  if (strongest >= 0.55) return 7;
  if (strongest >= 0.35) return 3;
  if (strongest < 0.2) return -5;
  return 0;
}

function scoreWindow(text, duration) {
  let score = boundaryQualityScore(text) + standaloneContextScore(text) + payoffPlacementScore(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words >= 12) score += 10;
  if (words >= 25) score += 8;
  if (words >= 45) score += 5;
  if (/[!?]/.test(text)) score += 8;
  if (HOOKS.some((pattern) => pattern.test(text))) score += 22;
  if (PAYOFFS.some((pattern) => pattern.test(text))) score += 10;
  if (/\b(you|your|we|I|my)\b/i.test(text)) score += 5;
  // Reward concrete, information-dense moments instead of generic chatter.
  if (/\b\d+(?:\.\d+)?(?:%|x|k|m|b)?\b/i.test(text)) score += 5;
  if (/\b(step|steps|tip|tips|lesson|rule|example|result|proof|mistake|reason)\b/i.test(text)) score += 5;
  if (/\b(but|however|instead|yet|although|until|even though)\b/i.test(text)) score += 5;
  // Cheap semantic signals: reward question-to-answer moments and concrete
  // framing that often survives context removal in short-form clips.
  if (/\?/.test(text) && /\b(because|so|therefore|that means|the reason|it\s+(?:is|was))\b/i.test(text)) score += 7;
  if (/\b(?:if you|when you|the reason|the key|the best|the worst|what happened|what I learned|what we found)\b/i.test(text)) score += 6;
  const uniqueWords = new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length >= 4));
  const totalWords = text.split(/\s+/).filter(Boolean).length;
  if (totalWords >= 18 && uniqueWords.size / totalWords >= 0.62) score += 5;
  // Reward clips that can stand alone: a clear opening, enough substance,
  // and a complete thought are more useful than arbitrary transcript windows.
  if (/^[^.!?]{8,}[.!?]/.test(text.trim())) score += 4;
  if (/\b(because|therefore|that means|which is why|so)\b/i.test(text)) score += 4;
  // Reward stronger short-form narrative signals: contrast, stakes, outcomes,
  // and concrete before/after or numeric claims tend to survive context removal.
  if (/\b(?:but|however|instead|yet|although|except|until|then)\b/i.test(text) && /\b(?:because|so|therefore|why|reason|result|ended up|turned out)\b/i.test(text)) score += 6;
  if (/\b(?:before|after|now|then|used to|went from|changed|learned|discovered|realized)\b/i.test(text)) score += 4;
  if (/\b(?:won|lost|failed|succeeded|saved|made|spent|earned|cost|grew|dropped|increased|decreased)\b/i.test(text) && /\b\d+(?:\.\d+)?(?:%|k|m|b)?\b/i.test(text)) score += 5;
  if (/\b(?:most people|nobody|everyone|no one|the problem|the biggest|the key|the secret)\b/i.test(text)) score += 4;
  // High-value narrative signals: curiosity gaps + stakes + belief changes
  // often make a clip compelling even when the original long-form context is removed.
  if (CURIOSITY_GAPS.some((pattern) => pattern.test(text))) score += 9;
  if (STAKES.some((pattern) => pattern.test(text))) score += 4;
  if (STORY_ARCS.filter((pattern) => pattern.test(text)).length >= 2) score += 6;
  if (EMOTIONAL_SHIFTS.some((pattern) => pattern.test(text))
      && /\b(?:but|then|until|after|before|finally|actually|realized|learned|changed|turns out)\b/i.test(text)) score += 7;
  if (/\b(?:I thought|we thought|I used to|we used to|then I|then we|until I|until we|but I|but we)\b/i.test(text)
      && /\b(?:realized|learned|discovered|changed|wrong|right|actually|turns out)\b/i.test(text)) score += 8;
  if (/\b(um+|uh+|you know|like|basically|sort of|kind of)\b/i.test(text)) score -= 4;
  if (/\b(subscribe|sponsored by|promo code|link in the description)\b/i.test(text)) score -= 12;
  if (/\b(guys|hey guys|welcome back|today we're going to|in this video)\b/i.test(text)) score -= 3;
  if (duration >= 15 && duration <= 75) score += 15;
  if (duration > 90) score -= 10;
  return score;
}
function transcriptTokenSet(text) {
  return new Set(String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length >= 4));
}

function transcriptSimilarity(left, right) {
  const a = transcriptTokenSet(left);
  const b = transcriptTokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function diversityPenalty(candidate, selected) {
  return selected.reduce((penalty, item) => {
    const similarity = transcriptSimilarity(candidate.transcript, item.transcript);
    const sameType = candidate.highlightType === item.highlightType ? 0.08 : 0;
    const temporalCloseness = Math.max(0, 1 - Math.abs(candidate.start - item.start) / 45) * 0.08;
    return Math.max(penalty, similarity * 0.45 + sameType + temporalCloseness);
  }, 0);
}

function transcriptContinuityScore(items) {
  if (!Array.isArray(items) || items.length < 2) return 0;
  let score = 0;
  let largeGaps = 0;
  let totalGap = 0;
  for (let i = 1; i < items.length; i += 1) {
    const previousEnd = Number(items[i - 1].end);
    const currentStart = Number(items[i].start);
    if (!Number.isFinite(previousEnd) || !Number.isFinite(currentStart)) continue;
    const gap = Math.max(0, currentStart - previousEnd);
    totalGap += gap;
    if (gap > 2.5) largeGaps += 1;
    if (gap <= 0.7) score += 1;
    else if (gap <= 1.5) score += 0.5;
    else if (gap > 3.5) score -= 2;
  }
  if (largeGaps >= 2) score -= 3;
  if (totalGap > 8) score -= 3;
  return score;
}

function sentenceCompletenessScore(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  let score = 0;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length >= 12) score += 2;
  if (/[.!?]["'”’)]?$/.test(value)) score += 7;
  if (/[,:;]$/.test(value)) score -= 5;
  if (/\b(?:a|an|the|to|of|for|with|from|in|on|at|by|is|are|was|were|and|but|or|because|which|that)\s*$/i.test(value.replace(/[.!?,;:]+$/, ""))) score -= 7;
  if (/\b(?:I|we|you|they|he|she)\s+(?:was|were|am|are|is|have|had|will|would|can|could)\b/i.test(value)) score += 2;
  return score;
}

function isTrimWorthyBoundary(text, side) {
  const value = String(text || "").trim();
  if (!value) return false;
  if (side === "start") {
    // Only remove a connective when it is genuinely acting as a dangling
    // continuation. "So this is..." or "But here's why..." are valid hooks.
    const danglingStarter = /^(?:and|but|or|because|which|that|if|when|while|although|yet|then|you know|basically|like)[,.:;!\s]/i.test(value)
      && !/^(?:and|but|so|then)\s+(?:this|that|here|there|I|we|you|the|a|an|my|our|what|why|how)\b/i.test(value);
    return /^(?:um+|uh+|well|okay|ok)[,.:;!\s]/i.test(value)
      || danglingStarter
      || /^(?:today we're going to|in this video|in today's video)\b/i.test(value);
  }
  return /(?:subscribe|sponsored by|promo code|link in the description)\b/i.test(value)
    || /^(?:thanks for watching|see you next time|that's it)[.!\s]*$/i.test(value);
}

function refineBoundarySegments(items, minDuration) {
  let start = 0;
  let end = items.length;
  while (end - start > 1) {
    const duration = Number(items[end - 1].end) - Number(items[start].start);
    if (duration < minDuration) break;
    if (isTrimWorthyBoundary(items[start].text, "start")) {
      start += 1;
      continue;
    }
    if (isTrimWorthyBoundary(items[end - 1].text, "end")) {
      end -= 1;
      continue;
    }
    break;
  }
  return items.slice(start, end);
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
  // Sample a small set of useful duration checkpoints instead of scoring every
  // possible transcript window. This keeps long videos fast while preserving
  // the 15–75s range that short-form clips normally need.
  const targetDurations = [...new Set([
    safeMinDuration,
    Math.min(safeMaxDuration, Math.max(safeMinDuration, 20)),
    Math.min(safeMaxDuration, Math.max(safeMinDuration, 30)),
    Math.min(safeMaxDuration, Math.max(safeMinDuration, 45)),
    Math.min(safeMaxDuration, Math.max(safeMinDuration, 60)),
    safeMaxDuration,
  ].map((value) => Number(value.toFixed(3))))].sort((a, b) => a - b);
  for (let i = 0; i < clean.length; i += 1) {
    const start = clean[i].start;
    let end = start;
    const windowSegments = [];
    let checkpointIndex = 0;
    for (let j = i; j < clean.length; j += 1) {
      const next = clean[j];
      if (next.start - start > safeMaxDuration) break;
      end = Math.max(end, next.end);
      windowSegments.push(next);
      const duration = end - start;
      if (duration < safeMinDuration) continue;
      if (duration > safeMaxDuration) break;
      if (checkpointIndex >= targetDurations.length || duration + 0.001 < targetDurations[checkpointIndex]) continue;

      const refinedSegments = refineBoundarySegments(windowSegments, safeMinDuration);
      const refinedStart = refinedSegments[0]?.start ?? start;
      const refinedEnd = refinedSegments[refinedSegments.length - 1]?.end ?? end;
      const refinedDuration = refinedEnd - refinedStart;
      const refinedText = refinedSegments.map((item) => item.text).join(" ").trim();
      const completeness = sentenceCompletenessScore(refinedText);
      const continuity = transcriptContinuityScore(refinedSegments);
      const promotionalBoilerplate = /\b(?:subscribe(?:d)?|sponsored by|promo code|link in the description|use (?:my|the) promo code|thanks for watching|see you next time)\b/i.test(refinedText);
      if (refinedDuration >= safeMinDuration && refinedText && completeness >= -1 && !promotionalBoilerplate) {
        candidates.push({
          start: Number(refinedStart.toFixed(3)), end: Number(refinedEnd.toFixed(3)),
          duration: Number(refinedDuration.toFixed(3)), score: scoreWindow(refinedText, refinedDuration) + completeness + continuity,
          highlightType: classifyHighlight(refinedText),
          title: refinedText.replace(/\s+/g, " ").slice(0, 72) || "Untitled highlight",
          transcript: refinedText,
          speakers: [...new Set(refinedSegments.map((item) => item.speaker).filter(Boolean))],
          captionSegments: refinedSegments,
        });
      }
      while (checkpointIndex < targetDurations.length && duration + 0.001 >= targetDurations[checkpointIndex]) checkpointIndex += 1;
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const parsedCandidateLimit = Number(candidateLimit);
  const safeCandidateLimit = Number.isFinite(parsedCandidateLimit)
    ? Math.max(safeLimit, Math.min(150, Math.floor(parsedCandidateLimit)))
    : safeLimit;
  const selected = [];
  const pool = candidates.slice(0, Math.min(candidates.length, Math.max(safeCandidateLimit * 4, 40)));
  while (selected.length < safeCandidateLimit && pool.length) {
    let bestIndex = -1;
    let bestUtility = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      const overlaps = selected.some((item) => Math.max(item.start, candidate.start) < Math.min(item.end, candidate.end) - 2);
      if (overlaps) continue;
      const utility = candidate.score - diversityPenalty(candidate, selected) * 100;
      if (utility > bestUtility) {
        bestUtility = utility;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) break;
    selected.push(pool[bestIndex]);
    pool.splice(bestIndex, 1);
  }
  selected.sort((a, b) => b.score - a.score || a.start - b.start);
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

  // Keep the model focused on the strongest, most diverse candidates. Sending
  // every baseline window makes the AI call slower without improving the top
  // results proportionally, especially on 30–50 clip requests.
  const aiCandidateLimit = Math.min(60, Math.max(24, safeLimit * 2));
  const aiCandidates = baseline.slice(0, aiCandidateLimit);
  const candidates = aiCandidates.map((item, id) => ({
    id,
    start: item.start,
    end: item.end,
    duration: item.duration,
    transcript: item.transcript.slice(0, 900),
    baselineScore: Math.round(Number(item.score) || 0),
    highlightType: item.highlightType || "insight",
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
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
Prefer standalone hooks, surprising insights, emotion, humor, conflict, story payoffs, useful information, or memorable statements.\nJudge whether a viewer can understand what is happening without the original long-form video: reward enough setup to identify the subject, then a meaningful payoff, answer, realization, or useful takeaway.
Reject filler, contextless fragments, repetitive introductions, sponsor boilerplate, and windows that begin or end mid-thought. Prefer natural sentence boundaries and complete ideas.
${safeTargetTypes.length ? `Prioritize these intelligence types for this batch: ${safeTargetTypes.join(", ")}. Include them when the transcript genuinely supports them.` : ""}
Return ONLY JSON in this exact shape: {"selections":[{"id":0,"score":95,"hook":92,"standalone":94,"context":90,"payoff":90,"emotion":78,"clarity":96,"reason":"brief reason","title":"short title","type":"hook"}]}.
For type, choose exactly one of: "hook", "reveal", "payoff", "how-to", "humor", "emotion", "insight".
Use only supplied IDs. Score each selection from 0 to 100. Do not invent timestamps.`,
            }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify({ requested: safeLimit, candidates }) }],
          },
        ],
        max_output_tokens: Math.max(700, Math.min(4200, safeLimit * 90)),
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
      const aiScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
      const dimensionWeights = [
        ["standalone", 20],
        ["context", 8],
        ["hook", 12],
        ["clarity", 10],
        ["payoff", 4],
        ["emotion", 4],
      ];
      let dimensionTotal = 0;
      let dimensionWeight = 0;
      for (const [key, weight] of dimensionWeights) {
        const value = Number(selection[key]);
        if (!Number.isFinite(value)) continue;
        dimensionTotal += Math.max(0, Math.min(100, value)) * weight;
        dimensionWeight += weight;
      }
      const dimensionScore = dimensionWeight > 0 ? dimensionTotal / dimensionWeight : null;
      // Use the model's overall judgment as the anchor, but incorporate its
      // explicit quality dimensions when available. This prevents a candidate
      // with a flashy hook but poor standalone clarity from outranking a complete,
      // useful clip simply because its single headline score was high.
      const effectiveAiScore = aiScore === null
        ? dimensionScore
        : dimensionScore === null
          ? aiScore
          : Math.round(aiScore * 0.55 + dimensionScore * 0.45);
      const baselineScore = Math.max(0, Math.min(100, Number(base.score) * 0.8));
      const blendedScore = effectiveAiScore === null
        ? baselineScore
        : Math.round(effectiveAiScore * 0.82 + baselineScore * 0.18);
      return {
        ...base,
        score: blendedScore,
        aiScore,
        baselineScore: Math.round(baselineScore),
        blendedScore,
        hookScore: Number.isFinite(Number(selection.hook)) ? Math.max(0, Math.min(100, Number(selection.hook))) : null,
        contextScore: Number.isFinite(Number(selection.context)) ? Math.max(0, Math.min(100, Number(selection.context))) : null,
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

    // Build a stronger clip pack with coverage-aware selection: reward a
    // requested intelligence type or a new type, but never sacrifice a large
    // quality gap just to force diversity.
    const seenTypes = new Set();
    const selectionPool = [...ranked];
    while (selected.length < safeLimit && selectionPool.length) {
      let bestIndex = -1;
      let bestUtility = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < selectionPool.length; i += 1) {
        const candidate = selectionPool[i];
        const type = String(candidate.highlightType || "").trim().toLowerCase();
        const requestedBonus = safeTargetTypes.includes(type) && !seenTypes.has(type) ? 8 : 0;
        const noveltyBonus = type && !seenTypes.has(type) ? 12 : 0;
        const weakContextPenalty = Number.isFinite(candidate.contextScore) && candidate.contextScore < 55
          ? (55 - candidate.contextScore) * 0.55
          : 0;
        const weakStandalonePenalty = Number.isFinite(candidate.standaloneScore) && candidate.standaloneScore < 60
          ? (60 - candidate.standaloneScore) * 0.35
          : 0;
        const utility = Number(candidate.score || 0) + requestedBonus + noveltyBonus
          - weakContextPenalty - weakStandalonePenalty;
        if (utility > bestUtility) {
          bestUtility = utility;
          bestIndex = i;
        }
      }
      if (bestIndex < 0) break;
      const candidate = selectionPool.splice(bestIndex, 1)[0];
      const type = String(candidate.highlightType || "").trim().toLowerCase();
      if (addIfDistinct(candidate) && type) seenTypes.add(type);
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