import { getContentProfile, normalizeContentProfile } from "./content-strategy.js";
// Performance learning is blended into AI ranking after transcript analysis.
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
  const payoffPattern = /\b(?:because|that means|turns out|ended up|as a result|which is why|therefore|realized|learned|discovered|changed|actually|so)\b/i;
  const positions = [];
  const normalizedWords = words.map((word) => word.replace(/[^a-z0-9']/gi, "").toLowerCase());
  for (let i = 0; i < normalizedWords.length; i += 1) {
    const single = normalizedWords[i];
    const phrase2 = [single, normalizedWords[i + 1]].filter(Boolean).join(" ");
    const phrase3 = [phrase2, normalizedWords[i + 2]].filter(Boolean).join(" ");
    if (payoffPattern.test(single) || payoffPattern.test(phrase2) || payoffPattern.test(phrase3)) {
      positions.push(i / Math.max(1, normalizedWords.length - 1));
    }
  }
  if (!positions.length) return 0;
  const strongest = Math.max(...positions);
  if (strongest >= 0.55) return 7;
  if (strongest >= 0.35) return 3;
  if (strongest < 0.2) return -5;
  return 0;
}

function questionResolutionScore(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 14) return 0;
  const questionPattern = /\b(?:why|how|what|who|when|where|whether|did|does|can|could|should|would)\b/i;
  const answerPattern = /\b(?:because|the reason|that means|the answer|it turns out|turns out|actually|in fact|so|therefore|realized|learned|discovered|result|ended up)\b/i;
  const firstHalf = words.slice(0, Math.ceil(words.length * 0.55)).join(" ");
  const secondHalf = words.slice(Math.floor(words.length * 0.35)).join(" ");
  const hasQuestion = /\?/.test(value) || questionPattern.test(firstHalf);
  const hasLaterAnswer = answerPattern.test(secondHalf);
  if (hasQuestion && hasLaterAnswer) return 8;
  if (hasQuestion && !hasLaterAnswer) return -4;
  return 0;
}

function unresolvedTeaserScore(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 10) return 0;
  const teaserPattern = /\b(?:i'?ll tell you|i'?m going to tell you|we'?ll get to that|coming up|wait until|you'?ll find out|i'?ll explain|more on that|we'?ll talk about|stay tuned|but first)\b/i;
  const resolutionPattern = /\b(?:because|the reason|that means|the answer|it turns out|turns out|actually|in fact|therefore|realized|learned|discovered|result|ended up|which is why)\b/i;
  if (!teaserPattern.test(value)) return 0;
  const laterText = words.slice(Math.floor(words.length * 0.45)).join(" ");
  return resolutionPattern.test(laterText) ? -2 : -10;
}

function outcomeCompletionScore(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 18) return 0;
  const setupPattern = /\b(?:the problem is|the challenge is|i thought|we thought|i assumed|we assumed|at first|initially|the question is|you might wonder)\b/i;
  const outcomePattern = /\b(?:because|which is why|that meant|that means|the answer is|it turns out|turns out|eventually|in the end|finally|ended up|as a result|so we|so i|we realized|i realized|we learned|i learned|we discovered|i discovered|changed|won|lost|failed|succeeded)\b/i;
  const firstHalf = words.slice(0, Math.ceil(words.length * 0.55)).join(" ");
  const secondHalf = words.slice(Math.floor(words.length * 0.45)).join(" ");
  const hasSetup = setupPattern.test(firstHalf);
  const hasOutcome = outcomePattern.test(secondHalf);
  if (hasSetup && hasOutcome) return 9;
  if (hasSetup && !hasOutcome) return -7;
  return 0;
}
function narrativeProgressionScore(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 20) return 0;

  const normalized = words.map((word) => word.replace(/[^a-z0-9']/gi, "").toLowerCase());
  const hookPattern = /^(?:why|how|what|where|when)\b|(?:here'?s the thing|secret|mistake|truth|problem|story|question|surprising|didn'?t expect|nobody|biggest|never)\b/;
  const developmentPattern = /(?:but|however|then|after|before|until|while|because|thought|assumed|tried|started|realized|learned|discovered)/;
  const payoffPattern = /(?:because|therefore|that means|turns out|ended up|as a result|which is why|realized|learned|discovered|finally|in the end|won|lost|failed|succeeded|changed)/;

  const positionsFor = (pattern) => {
    const positions = [];
    for (let i = 0; i < normalized.length; i += 1) {
      if (pattern.test(normalized[i]) || pattern.test(normalized.slice(i, i + 3).join(" "))) {
        positions.push(i / Math.max(1, normalized.length - 1));
      }
    }
    return positions;
  };

  const hooks = positionsFor(hookPattern);
  const development = positionsFor(developmentPattern);
  const payoffs = positionsFor(payoffPattern);
  if (!hooks.length || !payoffs.length) return 0;

  const earlyHook = Math.min(...hooks) <= 0.32;
  const laterPayoff = Math.max(...payoffs) >= 0.55;
  const hasMiddleDevelopment = development.some((position) => position >= 0.2 && position <= 0.75);
  const ordered = Math.min(...hooks) < Math.max(...payoffs);

  if (earlyHook && laterPayoff && hasMiddleDevelopment && ordered) return 9;
  if (earlyHook && laterPayoff && ordered) return 5;
  if (laterPayoff && !earlyHook) return 2;
  if (earlyHook && !laterPayoff) return -3;
  return 0;
}

function noveltyProgressionScore(text) {
  const value = String(text || "").trim();
  const words = value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 30) return 0;
  const stop = new Set(["the","and","that","this","with","from","have","were","they","them","then","than","when","what","your","you","for","are","was","but","not","its","into","about","just","really","very","there","their","would","could","should","because","also","some","more","been","being","were"]);
  const third = Math.ceil(words.length / 3);
  const sections = [words.slice(0, third), words.slice(third, third * 2), words.slice(third * 2)];
  const sets = sections.map((section) => new Set(section.filter((word) => word.length >= 4 && !stop.has(word))));
  const newWords = (a, b) => {
    let count = 0;
    for (const word of b) if (!a.has(word)) count += 1;
    return count;
  };
  const firstNew = newWords(sets[0], sets[1]);
  const secondNew = newWords(new Set([...sets[0], ...sets[1]]), sets[2]);
  const totalUnique = new Set(words.filter((word) => word.length >= 4 && !stop.has(word))).size;
  let score = 0;
  if (firstNew >= 4 && secondNew >= 4) score += 6;
  else if (firstNew >= 3 || secondNew >= 3) score += 3;
  if (secondNew >= firstNew && secondNew >= 4) score += 2;
  if (totalUnique < 10) score -= 3;
  return Math.max(-4, Math.min(8, score));
}

function payoffConcretenessScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;
  const late = words.slice(Math.floor(words.length * 0.58)).join(" ");
  const concrete = /\b(?:number|percent|dollars?|naira|million|thousand|days?|weeks?|months?|years?|steps?|rule|method|strategy|price|cost|saved|earned|lost|gained|increased|decreased|grew|reduced|improved|failed|won|sold|bought|result|answer|solution|example|exactly|specifically)\b/i;
  const vague = /\b(?:something|somehow|things|stuff|someone|somebody|somewhere|a lot|kind of|sort of|basically)\b/gi;
  const concreteHits = late.match(concrete)?.length || 0;
  const vagueHits = late.match(vague)?.length || 0;
  const endsCleanly = /[.!?]["'”’)]?$/.test(value);
  let score = 0;
  if (concreteHits >= 2) score += 7;
  else if (concreteHits === 1) score += 3;
  if (concreteHits >= 1 && endsCleanly) score += 2;
  if (vagueHits >= 2 && concreteHits === 0) score -= 5;
  if (vagueHits >= 3) score -= 2;
  return Math.max(-6, Math.min(9, score));
}

function sentenceRhythmScore(text) {
  const value = String(text || "").trim();
  const sentences = value.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length < 3) return 0;
  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const average = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  const short = lengths.filter((n) => n >= 5 && n <= 14).length;
  const medium = lengths.filter((n) => n >= 15 && n <= 34).length;
  const long = lengths.filter((n) => n >= 55).length;
  let score = 0;
  if (short >= 1 && medium >= 1) score += 3;
  if (medium >= 2) score += 2;
  if (long >= 2 && average > 45) score -= 3;
  const ending = sentences[sentences.length - 1] || "";
  if (ending.split(/\s+/).filter(Boolean).length >= 6 && ending.length <= 220) score += 2;
  return Math.max(-3, Math.min(6, score));
}

function topicConsistencyScore(text) {
  const value = String(text || "").trim();
  const words = value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 30) return 0;
  const stop = new Set(["the","and","that","this","with","from","have","were","they","them","then","than","when","what","your","you","for","are","was","but","not","its","into","about","just","really","very","there","their","would","could","should","because","also","some","more"]);
  const meaningful = words.filter((word) => word.length >= 4 && !stop.has(word));
  if (meaningful.length < 10) return 0;
  const third = Math.ceil(words.length / 3);
  const sections = [
    words.slice(0, third),
    words.slice(third, third * 2),
    words.slice(third * 2),
  ];
  const sets = sections.map((section) => new Set(section.filter((word) => word.length >= 4 && !stop.has(word))));
  const overlap = (a, b) => {
    if (!a.size || !b.size) return 0;
    let shared = 0;
    for (const word of a) if (b.has(word)) shared += 1;
    return shared / Math.max(1, Math.min(a.size, b.size));
  };
  const firstMiddle = overlap(sets[0], sets[1]);
  const middleLast = overlap(sets[1], sets[2]);
  const allSet = new Set(meaningful);
  const repeated = meaningful.filter((word, index) => meaningful.indexOf(word) !== index);
  const repetitionRatio = repeated.length / meaningful.length;
  let score = 0;
  if (firstMiddle >= 0.18 && middleLast >= 0.18) score += 6;
  else if (firstMiddle >= 0.12 || middleLast >= 0.12) score += 3;
  if (firstMiddle < 0.05 && middleLast < 0.05) score -= 3;
  if (repetitionRatio > 0.42) score -= 2;
  if (allSet.size >= 12 && repetitionRatio < 0.3) score += 2;
  return Math.max(-4, Math.min(8, score));
}

function claimEvidenceScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 26) return 0;

  const claim = /\b(?:I|we|they|it)\s+(?:made|did|got|found|learned|discovered|increased|decreased|saved|lost|earned|won|failed|built|sold|bought|changed|achieved)\b/i.test(value)
    || /\b(?:the result|the proof|the data|the numbers|evidence|example|case study|actually)\b/i.test(value);
  const evidence = /\b(?:because|for example|specifically|the reason|according to|in fact|which means|that means|as a result|the numbers|percent|million|thousand|dollars|naira)\b/i.test(value)
    || /\b\d+(?:[.,]\d+)?(?:%|x|k|m|b)?\b/i.test(value);
  const conclusion = /\b(?:therefore|so|that'?s why|which is why|result|ended up|turns out|finally|in the end|realized|learned|discovered)\b/i.test(value);

  let score = 0;
  if (claim && evidence && conclusion) score += 9;
  else if (claim && evidence) score += 6;
  else if (evidence && conclusion) score += 4;
  else if (claim) score += 1;

  if (claim && !evidence && !conclusion) score -= 2;
  return Math.max(-3, Math.min(9, score));
}

function emotionalArcScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 30) return 0;

  const positive = /\b(?:excited|happy|proud|relieved|amazing|great|love|won|success|hopeful|grateful|confident)\b/gi;
  const negative = /\b(?:afraid|angry|sad|worried|scared|failed|lost|pain|hard|difficult|problem|mistake|regret|frustrated)\b/gi;
  const turning = /\b(?:but|however|then|until|suddenly|realized|learned|discovered|changed|turned out|ended up|finally)\b/gi;

  const sections = [
    words.slice(0, Math.ceil(words.length / 3)).join(" "),
    words.slice(Math.ceil(words.length / 3), Math.ceil(words.length * 2 / 3)).join(" "),
    words.slice(Math.ceil(words.length * 2 / 3)).join(" "),
  ];

  const state = sections.map((section) => ({
    positive: section.match(positive)?.length || 0,
    negative: section.match(negative)?.length || 0,
    turning: section.match(turning)?.length || 0,
  }));

  const startPolarity = state[0].positive - state[0].negative;
  const endPolarity = state[2].positive - state[2].negative;
  const polarityShift = Math.abs(endPolarity - startPolarity);
  const turns = state.reduce((sum, item) => sum + item.turning, 0);

  let score = 0;
  if (polarityShift >= 2 && turns >= 1) score += 7;
  else if (polarityShift >= 1 || turns >= 2) score += 3;
  if (state[2].turning >= 1 && (state[2].positive > 0 || state[2].negative > 0)) score += 2;

  if (polarityShift === 0 && turns === 0) return 0;
  return Math.max(0, Math.min(9, score));
}

function narrativePayoffDistanceScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 28) return 0;

  const hookPattern = /\b(?:why|how|secret|truth|mistake|biggest|surprising|nobody|never|didn'?t expect|question)\b/i;
  const payoffPattern = /\b(?:because|answer|reason|solution|result|realized|learned|discovered|found|turns out|ended up|which means|that means|finally|in the end|actually)\b/i;

  const hookIndex = words.findIndex((word) => hookPattern.test(word));
  let payoffIndex = -1;
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (payoffPattern.test(words[i])) { payoffIndex = i; break; }
  }

  if (hookIndex < 0 || payoffIndex < 0 || payoffIndex <= hookIndex) return 0;

  const distanceRatio = (payoffIndex - hookIndex) / words.length;
  if (distanceRatio >= 0.18 && distanceRatio <= 0.78) return 7;
  if (distanceRatio < 0.10) return 2;
  if (distanceRatio > 0.88) return -3;
  return 4;
}

function audienceCuriosityArcScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 28) return 0;

  const early = words.slice(0, Math.ceil(words.length * 0.35)).join(" ");
  const middle = words.slice(Math.floor(words.length * 0.3), Math.ceil(words.length * 0.72)).join(" ");
  const late = words.slice(Math.floor(words.length * 0.62)).join(" ");

  const curiosity = /\b(?:why|how|what|secret|truth|surprising|didn'?t expect|nobody|never|question|wonder|curious|turns out)\b/i.test(early);
  const development = /\b(?:because|then|but|however|after|when|tried|found|discovered|realized|learned|started|changed)\b/i.test(middle);
  const resolution = /\b(?:answer|reason|result|solution|realized|learned|discovered|turns out|ended up|which means|that means|finally|in the end|actually)\b/i.test(late);

  let score = 0;
  if (curiosity && development && resolution) score += 9;
  else if (curiosity && resolution) score += 5;
  else if (development && resolution) score += 3;

  if (curiosity && !resolution) score -= 5;
  if (!curiosity && resolution && development) score += 1;

  return Math.max(-5, Math.min(9, score));
}

function payoffSpecificityScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;
  const late = words.slice(Math.floor(words.length * 0.55)).join(" ");
  const concrete = [
    /\b\d+(?:[.,]\d+)?(?:%|x|k|m|b)?\b/i,
    /\b(?:because|the reason|the answer|the solution|the result|the difference|the key|the lesson|the exact|specifically|for example|which means|that means)\b/i,
    /\b(?:saved|made|lost|gained|increased|decreased|cost|paid|earned|grew|reduced|improved|failed|won|sold|bought)\b/i,
    /\b(?:step|steps|method|strategy|rule|mistake|decision|change|process)\b/i,
  ];
  const hits = concrete.reduce((sum, pattern) => sum + (pattern.test(late) ? 1 : 0), 0);
  let score = hits >= 3 ? 9 : hits === 2 ? 6 : hits === 1 ? 2 : 0;
  if (/[.!?]["'”’)]?$/.test(value) && hits >= 2) score += 2;
  if (/\b(?:something|somehow|things|stuff|whatever|some guy|someone)\b/i.test(late) && hits < 2) score -= 3;
  return Math.max(-3, Math.min(11, score));
}

function informationGainScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 30) return 0;

  const parts = [
    words.slice(0, Math.ceil(words.length / 3)),
    words.slice(Math.ceil(words.length / 3), Math.ceil(words.length * 2 / 3)),
    words.slice(Math.ceil(words.length * 2 / 3)),
  ].map((section) => section.join(" ").toLowerCase());

  const changePattern = /\b(?:learned|realized|discovered|found|revealed|explained|showed|means|because|reason|result|difference|changed|turned out|ended up|actually|instead|therefore|so)\b/g;
  const firstWords = new Set(parts[0].replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 5));
  const secondWords = new Set(parts[1].replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 5));
  const thirdWords = new Set(parts[2].replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 5));

  const newMiddle = [...secondWords].filter((w) => !firstWords.has(w)).length;
  const newEnd = [...thirdWords].filter((w) => !secondWords.has(w)).length;
  const changes = parts.map((part) => part.match(changePattern)?.length || 0);
  const totalChange = changes.reduce((sum, n) => sum + n, 0);

  let score = 0;
  if (newMiddle >= 3 && newEnd >= 3) score += 6;
  else if (newMiddle >= 2 || newEnd >= 2) score += 3;
  if (changes[1] >= 1 && changes[2] >= 1) score += 4;
  else if (totalChange >= 2) score += 2;

  const repeated = [...secondWords].filter((w) => firstWords.has(w)).length
    + [...thirdWords].filter((w) => secondWords.has(w)).length;
  if (repeated > 12 && totalChange === 0) score -= 4;

  return Math.max(-4, Math.min(10, score));
}

function semanticShiftScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 28) return 0;

  const first = words.slice(0, Math.ceil(words.length * 0.42)).join(" ").toLowerCase();
  const last = words.slice(Math.floor(words.length * 0.58)).join(" ").toLowerCase();

  const expectation = /\b(?:thought|assumed|expected|believed|planned|wanted|hoped|supposed|figured|used to)\b/.test(first);
  const shift = /\b(?:but|however|instead|yet|actually|realized|learned|discovered|found|changed|different|wrong|turned out|ended up|became|decided)\b/.test(last);
  const contrast = /\b(?:but|however|instead|yet|although|except|surprisingly)\b/.test(value);

  const firstConcepts = new Set(first.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 5));
  const lastConcepts = new Set(last.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 5));
  const overlap = [...firstConcepts].filter((word) => lastConcepts.has(word)).length;
  const continuity = overlap / Math.max(1, Math.min(firstConcepts.size, 10));

  let score = 0;
  if (expectation && shift) score += 7;
  else if (shift && contrast) score += 4;
  if (expectation && contrast) score += 2;
  if (expectation && shift && continuity >= 0.15) score += 3;

  if (expectation && !shift && contrast) score -= 2;
  return Math.max(-3, Math.min(12, score));
}

function endingClosureScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  const ending = words.slice(Math.floor(words.length * 0.62)).join(" ");
  const closureSignals = ending.match(/\b(?:because|therefore|so|that means|which is why|turns out|ended up|as a result|finally|in the end|ultimately|realized|learned|discovered|the answer|the reason|the solution|the result|what happened|what I learned|what we learned|now I know|that's why)\b/gi) || [];
  const finalSentence = ending.split(/[.!?]/).filter(Boolean).pop()?.trim() || ending;
  const finalWords = finalSentence.split(/\s+/).filter(Boolean);

  let score = 0;
  if (closureSignals.length >= 2) score += 5;
  else if (closureSignals.length >= 1) score += 3;

  if (/[.!?]["'”’)]?$/.test(value)) score += 4;
  if (/[,:;]$/.test(value)) score -= 5;
  if (/^(?:and|but|or|because|which|that|if|when|while|so)\b/i.test(finalSentence)) score -= 4;
  if (finalWords.length >= 8 && finalWords.length <= 42) score += 2;
  if (/^(?:um+|uh+|well|okay|ok|you know|basically)\b/i.test(finalSentence)) score -= 2;

  return Math.max(-6, Math.min(11, score));
}

function unresolvedReferencePenaltyScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  const opening = words.slice(0, Math.ceil(words.length * 0.35)).join(" ");
  const openingWords = opening.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const vagueRefs = new Set(["this","that","these","those","they","them","he","she","it","there","here","someone","something","somebody"]);
  const vagueCount = openingWords.filter((word) => vagueRefs.has(word)).length;
  const explicitSubjects = opening.match(/\b(?:person|people|company|brand|product|place|city|country|story|problem|challenge|goal|mistake|reason|idea|business|money|price|customer|client|team|game|project|lesson|experience)\b/gi)?.length || 0;
  const properNouns = opening.match(/\b[A-Z][a-z]{2,}\b/g)?.length || 0;
  const questions = opening.match(/\b(?:who|what|why|how|when|where|which)\b/gi)?.length || 0;

  let penalty = 0;
  const vagueRatio = vagueCount / Math.max(1, openingWords.length);
  if (vagueRatio >= 0.18 && explicitSubjects === 0 && properNouns === 0 && questions === 0) penalty -= 7;
  else if (vagueRatio >= 0.12 && explicitSubjects === 0 && properNouns === 0) penalty -= 3;

  if (/^(?:this|that|these|those|they|he|she|it|there|here)\b/i.test(value) && questions === 0 && explicitSubjects === 0) {
    penalty -= 4;
  }

  return Math.max(-8, Math.min(0, penalty));
}

function openingContextDensityScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  const opening = words.slice(0, Math.ceil(words.length * 0.28)).join(" ");
  const openingWords = opening.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4);

  const subjectSignals = /\b(?:person|people|company|brand|product|place|city|country|story|problem|challenge|goal|mistake|reason|idea|business|money|price|customer|client|team|game|video|project|lesson|experience)\b/g;
  const referenceSignals = /\b(?:this|that|they|them|he|she|it|we|you|there|here|something|someone)\b/g;
  const concreteSignals = /\b(?:\d+(?:[.,]\d+)?|[A-Z][a-z]{2,})\b/g;

  const subjects = opening.match(subjectSignals)?.length || 0;
  const vague = opening.match(referenceSignals)?.length || 0;
  const concrete = opening.match(concreteSignals)?.length || 0;
  const density = (subjects + concrete) / Math.max(1, openingWords.length);
  const vagueRatio = vague / Math.max(1, openingWords.length);

  let score = 0;
  if (subjects >= 1) score += 3;
  if (subjects >= 2) score += 2;
  if (concrete >= 1) score += 2;
  if (density >= 0.12) score += 3;
  if (vagueRatio >= 0.18 && subjects === 0 && concrete === 0) score -= 6;
  if (/^(?:and|but|so|because|which|that|if|when|while)\b/i.test(value)) score -= 5;

  return Math.max(-6, Math.min(10, score));
}

function progressionMomentumScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 28) return 0;

  const normalized = words.map((word) => word.replace(/[^a-z0-9']/gi, "").toLowerCase());
  const segments = [];
  const size = Math.max(8, Math.ceil(normalized.length / 3));
  for (let i = 0; i < normalized.length; i += size) segments.push(normalized.slice(i, i + size));

  const changePattern = /\b(?:but|however|instead|yet|then|after|before|because|until|while|tried|started|stopped|changed|became|realized|learned|discovered|found|decided|failed|succeeded|ended|result|finally|eventually)\b/;
  const newInfoPattern = /\b(?:new|different|another|first|second|next|also|more|less|increase|decrease|from|to|now|then|result|example|step|lesson|reason|answer|solution)\b/;

  const changeCounts = segments.map((segment) => segment.filter((word) => changePattern.test(word)).length);
  const infoCounts = segments.map((segment) => segment.filter((word) => newInfoPattern.test(word)).length);

  let score = 0;
  if (changeCounts[0] + changeCounts[1] + changeCounts[2] >= 3) score += 3;
  if (changeCounts[1] + changeCounts[2] >= 2) score += 3;
  if (infoCounts[1] + infoCounts[2] >= 2) score += 2;

  const firstSet = new Set(segments[0] || []);
  const secondSet = new Set(segments[1] || []);
  const thirdSet = new Set(segments[2] || []);
  const overlap12 = [...firstSet].filter((word) => secondSet.has(word) && word.length >= 5).length;
  const overlap23 = [...secondSet].filter((word) => thirdSet.has(word) && word.length >= 5).length;
  const meaningfulFirst = [...firstSet].filter((word) => word.length >= 5).length;
  const repetitionRatio = (overlap12 + overlap23) / Math.max(1, meaningfulFirst * 2);

  if (repetitionRatio >= 0.42 && changeCounts[1] + changeCounts[2] < 2) score -= 7;
  else if (repetitionRatio >= 0.30 && changeCounts[1] + changeCounts[2] < 2) score -= 3;

  if (changeCounts[2] >= 2 && infoCounts[2] >= 1) score += 3;
  return Math.max(-7, Math.min(14, score));
}

function questionPayoffCoherenceScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  const early = words.slice(0, Math.ceil(words.length * 0.42)).join(" ");
  const late = words.slice(Math.floor(words.length * 0.55)).join(" ");

  const questionSignals = early.match(/\b(?:why|how|what|when|where|which|who|problem|challenge|goal|mistake|reason|question|wanted to know|trying to)\b/gi) || [];
  const resolutionSignals = late.match(/\b(?:because|the reason|the answer|that means|which is why|turns out|ended up|as a result|finally|in the end|realized|learned|discovered|solution|result|changed|won|lost|failed|succeeded)\b/gi) || [];

  if (!questionSignals.length || !resolutionSignals.length) return 0;

  const topicWords = new Set(
    early.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 5)
      .filter((word) => !new Set(["about","there","their","would","could","should","thing","really","because","people"]).has(word))
  );
  const lateWords = late.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5);

  const overlap = new Set(lateWords.filter((word) => topicWords.has(word))).size;
  const coherence = overlap / Math.max(1, Math.min(topicWords.size, 8));

  if (questionSignals.length >= 2 && resolutionSignals.length >= 2 && coherence >= 0.25) return 10;
  if (questionSignals.length >= 1 && resolutionSignals.length >= 1 && coherence >= 0.15) return 6;
  if (questionSignals.length >= 1 && resolutionSignals.length >= 1) return -2;
  return 0;
}

function storyPhaseCoverageScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  const normalized = words.map((word) => word.replace(/[^a-z0-9']/gi, "").toLowerCase());
  const phasePattern = {
    setup: /^(?:at|initially|first|before|originally|the problem|the challenge|i thought|we thought|i assumed|we assumed|wanted|needed|tried)\b|(?:problem|challenge|question|goal|plan|expect)/,
    development: /^(?:then|next|after|while|but|however|because|until|tried|started|struggled|worked|failed|kept)\b|(?:tested|built|changed|discovered|learned|realized)/,
    resolution: /^(?:finally|eventually|ultimately|in|the end|so|therefore|because|that means|turns out|ended up)\b|(?:result|answer|solution|won|lost|succeeded|failed|saved|earned|changed|learned|realized|discovered)/
  };

  const findPositions = (pattern) => {
    const positions = [];
    for (let i = 0; i < normalized.length; i += 1) {
      const window = normalized.slice(i, i + 4).join(" ");
      if (pattern.test(normalized[i]) || pattern.test(window)) {
        positions.push(i / Math.max(1, normalized.length - 1));
      }
    }
    return positions;
  };

  const setup = findPositions(phasePattern.setup);
  const development = findPositions(phasePattern.development);
  const resolution = findPositions(phasePattern.resolution);
  const earlySetup = setup.some((p) => p <= 0.38);
  const middleDevelopment = development.some((p) => p >= 0.18 && p <= 0.78);
  const lateResolution = resolution.some((p) => p >= 0.55);

  let score = 0;
  if (earlySetup) score += 2;
  if (middleDevelopment) score += 3;
  if (lateResolution) score += 3;
  if (earlySetup && middleDevelopment && lateResolution) score += 4;

  const ordered = earlySetup
    && middleDevelopment
    && lateResolution
    && Math.min(...setup) < Math.max(...development)
    && Math.min(...development) < Math.max(...resolution);
  if (ordered) score += 3;

  if (lateResolution && !earlySetup) score -= 2;
  if (earlySetup && !lateResolution) score -= 3;
  return Math.max(-4, Math.min(15, score));
}

function repetitionPenaltyScore(text) {
  const value = String(text || "").trim();
  const words = value.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;
  const counts = new Map();
  for (const word of words) {
    if (word.length < 4) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  const repeated = [...counts.values()].filter((count) => count >= 3).length;
  const density = repeated / Math.max(1, counts.size);
  if (density >= 0.16) return -8;
  if (density >= 0.1) return -4;
  return 0;
}

function speechQualityScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 18) return 0;
  const lowValue = new Set(["um","uh","erm","ah","like","basically","literally"]);
  let count = 0;
  for (const word of words) {
    if (lowValue.has(word.toLowerCase().replace(/[.,!?]/g, ""))) count += 1;
  }
  const ratio = count / words.length;
  if (ratio >= 0.14) return -9;
  if (ratio >= 0.09) return -5;
  if (ratio >= 0.06) return -2;
  return 0;
}

function valueDensityScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 20) return 0;
  const valueSignals = /\b(?:the key|the reason|the lesson|the trick|the rule|the answer|the point|the difference|what I learned|what we learned|here's how|the best way|the worst|important|remember|because|result|example|proof|step|steps|mistake|solution|strategy|advice)\b/gi;
  const signals = value.match(valueSignals)?.length || 0;
  const density = signals / words.length;
  if (signals >= 3 && density >= 0.035) return 7;
  if (signals >= 2) return 4;
  if (signals === 1) return 1;
  return 0;
}

function temporalFlowScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;
  const transitionPattern = /\b(?:first|then|next|after|before|later|eventually|finally|meanwhile|at first|in the end|because|so|but|however|until|once|when)\b/gi;
  const changePattern = /\b(?:started|stopped|changed|became|realized|learned|discovered|found|ended up|went from|turned into|decided|tried|failed|succeeded)\b/gi;
  const transitions = value.match(transitionPattern)?.length || 0;
  const changes = value.match(changePattern)?.length || 0;
  if (transitions >= 2 && changes >= 1) return 7;
  if (transitions >= 2 || changes >= 2) return 3;
  return 0;
}

function concreteEntityScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 18) return 0;
  const properNounSignals = (value.match(/\b[A-Z][a-z]{2,}\b/g) || []).length;
  const numberSignals = (value.match(/\b\d+(?:[.,]\d+)?(?:%|x|k|m|b)?\b/gi) || []).length;
  const specificSignals = (value.match(/\b(?:company|person|place|city|country|product|year|month|day|dollar|naira|million|thousand|team|brand|customer|client|price|cost|date)\b/gi) || []).length;
  const signals = properNounSignals + numberSignals + specificSignals;
  if (signals >= 4) return 7;
  if (signals >= 2) return 4;
  if (signals >= 1) return 1;
  return 0;
}

function fillerRatioPenaltyScore(text) {
  const value = String(text || "").trim();
  const words = value.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 20) return 0;
  const filler = new Set(["you","know","kind","sort","basically","actually","literally","right","okay","ok","yeah","yes","well"]);
  const count = words.filter((word) => filler.has(word)).length;
  const ratio = count / words.length;
  if (ratio >= 0.18) return -8;
  if (ratio >= 0.13) return -5;
  if (ratio >= 0.09) return -2;
  return 0;
}

function contrastSignalScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 18) return 0;
  const contrast = /\b(?:but|however|instead|yet|although|except|surprisingly|actually)\b/i.test(value);
  const shift = /\b(?:thought|assumed|expected|believed)\b/i.test(value)
    && /\b(?:realized|learned|discovered|changed|different|wrong)\b/i.test(value);
  if (shift && contrast) return 8;
  if (shift) return 6;
  if (contrast) return 2;
  return 0;
}

function hookPayoffAlignmentScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 18) return 0;
  const hookPattern = /\b(?:secret|truth|mistake|biggest|why|how|here'?s the thing|surprising|nobody|never|didn'?t expect)\b/i;
  const payoffPattern = /\b(?:because|that means|the reason|turns out|ended up|as a result|which is why|realized|learned|discovered|result|finally|in the end|actually)\b/i;
  const early = words.slice(0, Math.ceil(words.length * 0.38)).join(" ");
  const late = words.slice(Math.floor(words.length * 0.55)).join(" ");
  const hasHook = hookPattern.test(early);
  const hasPayoff = payoffPattern.test(late);
  if (hasHook && hasPayoff) return 9;
  if (hasHook && !hasPayoff) return -4;
  if (!hasHook && hasPayoff) return 1;
  return 0;
}

function payoffBridgeScore(text) {
  const value = String(text || "").trim();
  const words = value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 30) return 0;

  const stop = new Set(["the","and","that","this","with","from","have","were","they","them","then","than","when","what","your","you","for","are","was","but","not","its","into","about","just","really","very","there","their","would","could","should","because","also","some","more","been","being","will","can"]);
  const early = new Set(words.slice(0, Math.ceil(words.length * 0.45)).filter((word) => word.length >= 4 && !stop.has(word)));
  const late = words.slice(Math.floor(words.length * 0.58)).filter((word) => word.length >= 4 && !stop.has(word));
  if (early.size < 8 || !late.length) return 0;

  const lateUnique = new Set(late);
  let shared = 0;
  for (const word of lateUnique) if (early.has(word)) shared += 1;

  const bridgeRatio = shared / Math.max(1, Math.min(early.size, lateUnique.size));
  const payoffSignal = /\b(?:because|reason|answer|solution|result|realized|learned|discovered|turns out|ended up|changed|actually|finally|ultimately|why|how)\b/i.test(late.join(" "));

  let score = 0;
  if (shared >= 3 && bridgeRatio >= 0.18 && payoffSignal) score += 7;
  else if (shared >= 2 && payoffSignal) score += 4;
  else if (shared === 0 && payoffSignal) score -= 2;
  if (shared >= 4 && !payoffSignal) score += 2;

  return Math.max(-3, Math.min(7, score));
}

function timeToValueScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  const earlyCount = Math.max(8, Math.ceil(words.length * 0.35));
  const early = words.slice(0, earlyCount).join(" ");
  const middle = words.slice(earlyCount, Math.ceil(words.length * 0.62)).join(" ");
  const valueSignal = /\b(?:key|lesson|tip|reason|answer|solution|result|mistake|rule|strategy|method|learned|realized|discovered|found|because|here'?s how|the point|the trick|the difference|important)\b/i;
  const contextSignal = /\b(?:I|we|you|they|he|she|the|this|that|problem|goal|company|customer|story|experience)\b/i;
  const fillerSignal = /\b(?:um+|uh+|you know|basically|like|okay|well|so)\b/gi;

  const earlyValue = (early.match(valueSignal) || []).length;
  const middleValue = (middle.match(valueSignal) || []).length;
  const earlyContext = contextSignal.test(early);
  const earlyFiller = (early.match(fillerSignal) || []).length;

  let score = 0;
  if (earlyContext && earlyValue >= 1) score += 6;
  else if (earlyValue >= 1) score += 3;
  if (middleValue >= 1 && earlyValue >= 1) score += 2;
  if (earlyFiller >= 3 && earlyValue === 0) score -= 4;
  if (earlyValue === 0 && middleValue === 0) score -= 2;

  return Math.max(-4, Math.min(8, score));
}

function payoffEscalationScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 30) return 0;

  const third = Math.ceil(words.length / 3);
  const first = words.slice(0, third).join(" ");
  const middle = words.slice(third, third * 2).join(" ");
  const last = words.slice(third * 2).join(" ");

  const signal = /\b(?:because|reason|answer|solution|result|realized|learned|discovered|found|revealed|means|changed|turned out|ended up|finally|ultimately|actually|proof|example|lesson|key|difference|mistake|strategy|method|saved|earned|lost|won|failed|improved|increased|decreased)\b/gi;
  const concrete = /\b\d+(?:[.,]\d+)?(?:%|x|k|m|b)?\b|\b(?:dollars?|naira|million|thousand|days?|weeks?|months?|years?|steps?|price|cost)\b/gi;

  const firstSignals = (first.match(signal) || []).length;
  const middleSignals = (middle.match(signal) || []).length;
  const lastSignals = (last.match(signal) || []).length;
  const lastConcrete = (last.match(concrete) || []).length;

  let score = 0;
  if (lastSignals > firstSignals && lastSignals >= middleSignals) score += 5;
  else if (lastSignals > firstSignals) score += 3;
  if (lastConcrete >= 1 && lastSignals >= 1) score += 3;
  if (firstSignals >= 3 && lastSignals === 0) score -= 4;
  if (firstSignals === 0 && middleSignals === 0 && lastSignals === 0) score -= 2;

  return Math.max(-4, Math.min(8, score));
}

function replayDependencyScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  const opening = words.slice(0, Math.ceil(words.length * 0.3)).join(" ");
  const rest = words.slice(Math.ceil(words.length * 0.3)).join(" ");

  const dependency = /\b(?:as I said|as I mentioned|like I said|again|previously|earlier|back then|you know what I mean|you remember|that thing|the other thing|the one I told you|from before)\b/i;
  const selfContained = /\b(?:the problem|the goal|the reason|the answer|the result|the company|the customer|the product|the story|I learned|we learned|I realized|we realized|because|here'?s how|the key|the mistake)\b/i;

  const dependencyHits = (opening.match(dependency) || []).length;
  const contextHits = (opening.match(selfContained) || []).length;
  const laterContext = selfContained.test(rest);

  let score = 0;
  if (dependencyHits >= 2 && contextHits === 0) score -= 6;
  else if (dependencyHits >= 1 && contextHits === 0 && !laterContext) score -= 4;
  if (contextHits >= 1) score += 3;
  if (laterContext && dependencyHits === 0) score += 2;

  return Math.max(-6, Math.min(5, score));
}

function payoffNoveltyScore(text) {
  const value = String(text || "").trim();
  const words = value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 30) return 0;

  const third = Math.ceil(words.length / 3);
  const early = words.slice(0, third);
  const middle = words.slice(third, third * 2);
  const late = words.slice(third * 2);

  const stop = new Set(["the","and","that","this","with","from","have","were","they","them","then","than","when","what","your","you","for","are","was","but","not","its","into","about","just","really","very","there","their","would","could","should","because","also","some","more","been","being","will","can","here","how","why"]);
  const meaningful = (list) => new Set(list.filter((word) => word.length >= 4 && !stop.has(word)));
  const earlySet = meaningful(early);
  const middleSet = meaningful(middle);
  const lateSet = meaningful(late);

  if (earlySet.size < 8) return 0;

  let lateNew = 0;
  for (const word of lateSet) if (!earlySet.has(word) && !middleSet.has(word)) lateNew += 1;

  let middleNew = 0;
  for (const word of middleSet) if (!earlySet.has(word)) middleNew += 1;

  const lateNovelty = lateNew / Math.max(1, lateSet.size);
  const middleNovelty = middleNew / Math.max(1, middleSet.size);
  const payoffSignal = /\b(?:result|answer|solution|realized|learned|discovered|found|changed|ended up|turned out|finally|ultimately|actually|proof|lesson|key|difference|mistake|strategy|method|saved|earned|won|improved|increased|decreased)\b/i.test(late.join(" "));

  let score = 0;
  if (lateNew >= 4 && lateNovelty >= 0.28) score += 5;
  else if (lateNew >= 3 && lateNovelty >= 0.2) score += 3;
  if (middleNew >= 3 && middleNovelty >= 0.18) score += 2;
  if (payoffSignal && lateNew >= 3) score += 2;
  if (lateNew <= 1 && middleNew <= 1) score -= 3;

  return Math.max(-4, Math.min(8, score));
}

function audienceValueProgressionScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 30) return 0;

  const third = Math.ceil(words.length / 3);
  const first = words.slice(0, third).join(" ");
  const middle = words.slice(third, third * 2).join(" ");
  const last = words.slice(third * 2).join(" ");

  const audience = /\b(?:you|your|if you|for anyone|people|creator|business|customer|audience|viewer|beginner|entrepreneur|team|company)\b/gi;
  const valueSignal = /\b(?:benefit|help|save|earn|avoid|learn|understand|use|step|strategy|tip|lesson|mistake|solution|result|reason|key|difference|how|why|because|example|proof|method)\b/gi;
  const concrete = /\b\d+(?:[.,]\d+)?(?:%|x|k|m|b)?\b|\b(?:dollars?|naira|days?|weeks?|months?|years?|steps?)\b/gi;

  const firstAudience = (first.match(audience) || []).length;
  const middleValue = (middle.match(valueSignal) || []).length;
  const lastValue = (last.match(valueSignal) || []).length;
  const lastConcrete = (last.match(concrete) || []).length;

  let score = 0;
  if (firstAudience >= 1 && middleValue >= 1 && lastValue >= 2) score += 5;
  else if (middleValue >= 1 && lastValue >= 2) score += 3;
  if (lastConcrete >= 1 && lastValue >= 1) score += 2;
  if (firstAudience === 0 && middleValue === 0 && lastValue <= 1) score -= 3;
  if (firstAudience >= 2 && lastValue === 0) score -= 3;

  return Math.max(-4, Math.min(7, score));
}

function speakerTurnContinuityScore(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  // Favor windows that preserve a coherent speaker thought instead of
  // beginning with a reaction/question and immediately switching direction.
  const early = words.slice(0, Math.ceil(words.length * 0.28)).join(" ");
  const late = words.slice(Math.floor(words.length * 0.72)).join(" ");
  const startsAsResponse = /^(?:yes|yeah|no|well|so|right|exactly|actually|but|and)\b[,.!?]?\s*/i.test(early);
  const unresolvedQuestion = /^(?:why|what|how|where|when|who)\b/i.test(early)
    && !/(?:because|answer|reason|solution|is|was|means|happened|found|learned)\b/i.test(late);
  const abruptEnding = /(?:\b(?:and|but|because|so|which|that|if|when|to|of|for|with)\s*)$/i.test(value.replace(/[.!?,;:]+$/, ""));

  let score = 0;
  if (startsAsResponse) score -= 2;
  if (unresolvedQuestion) score -= 4;
  if (abruptEnding) score -= 4;
  if (/\b(?:because|so what happened was|the reason|what I learned|the answer|the key|it turned out)\b/i.test(value)) score += 2;
  if (/[.!?]["'”’)]?$/.test(value)) score += 2;

  return Math.max(-6, Math.min(4, score));
}

function speechPaceScore(text, duration) {
  const value = String(text || "").trim();
  const safeDuration = Number(duration);
  if (!value || !Number.isFinite(safeDuration) || safeDuration <= 0) return 0;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 10) return 0;
  const wordsPerMinute = (words.length / safeDuration) * 60;
  if (wordsPerMinute >= 125 && wordsPerMinute <= 190) return 6;
  if (wordsPerMinute >= 105 && wordsPerMinute <= 215) return 3;
  if (wordsPerMinute >= 85 && wordsPerMinute <= 235) return 1;
  if (wordsPerMinute < 65 || wordsPerMinute > 260) return -5;
  return -2;
}

function earlyRetentionScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  // Short-form viewers decide very quickly whether a clip is worth staying
  // for. Reward windows that establish the subject and a useful tension/value
  // signal early, then continue adding information instead of front-loading
  // everything or spending the opening on filler.
  const early = words.slice(0, Math.max(8, Math.ceil(words.length * 0.2))).join(" ");
  const middle = words.slice(Math.floor(words.length * 0.2), Math.ceil(words.length * 0.62)).join(" ");
  const late = words.slice(Math.floor(words.length * 0.62)).join(" ");

  const subject = /\b(?:I|we|you|your|this|that|the|my|our|people|company|product|problem|story|goal|mistake|reason|result|lesson|money|business|game|project)\b/i;
  const tension = /\b(?:but|however|instead|surprisingly|secret|truth|mistake|problem|challenge|risk|why|how|what|never|nobody|failed|lost|won|changed|unexpected|actually)\b/i;
  const valueSignal = /\b(?:because|reason|answer|result|solution|lesson|key|tip|step|strategy|method|learned|realized|discovered|saved|earned|improved|increased|decreased|example|proof)\b/i;
  const filler = /\b(?:um+|uh+|well|okay|ok|basically|literally|you know|so today|welcome back|in this video)\b/gi;

  const earlySubject = subject.test(early);
  const earlyTension = tension.test(early);
  const earlyValue = valueSignal.test(early);
  const earlyFiller = (early.match(filler) || []).length;
  const middleValue = (middle.match(valueSignal) || []).length;
  const lateValue = (late.match(valueSignal) || []).length;

  let score = 0;
  if (earlySubject) score += 2;
  if (earlyTension) score += 4;
  if (earlyValue) score += 3;
  if (earlySubject && (earlyTension || earlyValue)) score += 2;
  if (middleValue >= 1) score += 2;
  if (lateValue >= 1) score += 2;
  if (earlyFiller >= 2 && !earlyTension && !earlyValue) score -= 6;
  if (!earlySubject && !earlyTension && !earlyValue) score -= 3;
  if (earlyValue && lateValue) score += 2;

  return Math.max(-6, Math.min(14, score));
}

function contextAwareWindowScore(items, allSegments, startIndex, endIndex) {
  if (!Array.isArray(items) || !items.length || !Array.isArray(allSegments) || allSegments.length <= items.length) return 0;

  const firstText = String(items[0]?.text || "").trim();
  const lastText = String(items[items.length - 1]?.text || "").trim();
  const previous = allSegments.slice(Math.max(0, startIndex - 2), startIndex).map((item) => item.text).join(" ");
  const following = allSegments.slice(endIndex + 1, Math.min(allSegments.length, endIndex + 3))
    .map((item) => item.text).join(" ");

  const openingDependency = /^(?:this|that|these|those|they|them|he|she|it|there|here|and|but|so|because|which|then)\b/i.test(firstText)
    || /\b(?:as I said|as I mentioned|like I said|earlier|before this|the previous)\b/i.test(firstText);
  const explicitSubject = /\b(?:person|people|company|brand|product|place|city|country|story|problem|challenge|goal|mistake|reason|idea|business|money|price|customer|client|team|game|project|lesson|experience|strategy|method|result|answer|solution)\b/i.test(firstText);
  const previousSubject = /\b(?:person|people|company|brand|product|place|city|country|story|problem|challenge|goal|mistake|reason|idea|business|money|price|customer|client|team|game|project|lesson|experience|strategy|method)\b/i.test(previous);
  const unresolvedEnding = /(?:\b(?:and|but|because|which|that|if|when|while|to|of|for|with)\s*)$/i.test(lastText.replace(/[.!?,;:]+$/, ""));
  const followingResolution = /\b(?:because|the reason|the answer|the result|solution|realized|learned|discovered|turns out|ended up|which is why|that means|finally|in the end|actually)\b/i.test(following);

  let score = 0;
  const pronounOpening = /^(?:this|that|these|those|they|them|he|she|it)\b/i.test(firstText);
  const stronglyDependentOpening = /^(?:this|that|these|those|they|them|he|she|it)\s+(?:is|was|are|were|means|shows|explains|saved|cost|changed|worked|failed|won|lost|made|gave|helped)\b/i.test(firstText);
  if (openingDependency && !explicitSubject) score -= previousSubject ? 8 : 5;
  if (pronounOpening && stronglyDependentOpening) score -= previousSubject ? 7 : 5;
  if (!openingDependency && explicitSubject) score += 3;
  if (previousSubject && !explicitSubject) score -= 3;
  if (unresolvedEnding && followingResolution) score -= 8;
  if (!unresolvedEnding && /[.!?]["'”’)]?$/.test(lastText)) score += 3;
  if (items.length >= 3 && previousSubject && explicitSubject) score += 2;

  return Math.max(-12, Math.min(8, score));
}

function speakerInteractionScore(items) {
  if (!Array.isArray(items) || items.length < 2) return 0;
  const speakers = items.map((item) => String(item?.speaker || "").trim()).filter(Boolean);
  const uniqueSpeakers = new Set(speakers);
  if (uniqueSpeakers.size < 2) return 0;

  const text = items.map((item) => String(item?.text || "")).join(" ").trim();
  if (!text) return 0;

  const question = /\?/g;
  const answer = /\b(?:because|the reason|exactly|yes|no|that's right|correct|actually|the answer|it turns out|we found|we learned|I agree)\b/i;
  const conflict = /\b(?:but|however|disagree|wrong|no way|not true|instead|except|really)\b/i;
  const reaction = /\b(?:wait|wow|seriously|exactly|right|really|I didn't know|that's crazy|you're right)\b/i;

  const questionCount = (text.match(question) || []).length;
  let score = 0;
  if (uniqueSpeakers.size >= 2) score += 3;
  if (questionCount >= 1 && answer.test(text)) score += 5;
  if (conflict.test(text) && reaction.test(text)) score += 4;
  if (uniqueSpeakers.size >= 2 && text.split(/\s+/).filter(Boolean).length >= 24) score += 2;

  return Math.max(0, Math.min(10, score));
}

function promiseFulfillmentScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  const early = words.slice(0, Math.ceil(words.length * 0.35)).join(" ");
  const late = words.slice(Math.floor(words.length * 0.58)).join(" ");

  const promisePattern = /\b(?:i(?:'|’)ll show you|i(?:'|’)ll explain|you(?:'|’)ll learn|you(?:'|’)ll see|here(?:'|’)s how|the key is|the secret is|the reason is|what happened was|what you need to know|the important part is)\b/i;
  const resolutionPattern = /\b(?:because|the reason|the answer|that means|which is why|it turns out|turns out|as a result|finally|in the end|realized|learned|discovered|the key|the secret|the solution|the result)\b/i;

  if (!promisePattern.test(early)) return 0;

  const earlyTokens = new Set(
    early.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((word) => word.length >= 5 && !/^(about|there|which|where|their|these|those|would|could|should)$/.test(word))
  );
  const lateTokens = new Set(
    late.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((word) => word.length >= 5)
  );

  let shared = 0;
  for (const word of earlyTokens) if (lateTokens.has(word)) shared += 1;

  let score = 0;
  if (resolutionPattern.test(late)) score += 4;
  if (shared >= 3) score += 5;
  else if (shared >= 1) score += 2;
  if (shared === 0) score -= 6;
  if (resolutionPattern.test(late) && shared >= 1) score += 2;

  return Math.max(-7, Math.min(11, score));
}

function beliefReversalScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  const setup = words.slice(0, Math.ceil(words.length * 0.42)).join(" ");
  const resolution = words.slice(Math.floor(words.length * 0.48)).join(" ");
  const belief = /\b(?:I thought|we thought|I assumed|we assumed|I believed|we believed|I expected|we expected|I was sure|we were sure|seemed like|looked like)\b/i;
  const reversal = /\b(?:but|however|actually|instead|turns out|it turns out|realized|discovered|learned|was wrong|were wrong|not true|not what|changed my mind|changed our mind)\b/i;
  const consequence = /\b(?:because|which is why|that means|as a result|ended up|finally|result|solution|lesson)\b/i;

  const hasBelief = belief.test(setup);
  const hasReversal = reversal.test(resolution);
  const hasConsequence = consequence.test(resolution);

  let score = 0;
  if (hasBelief && hasReversal) score += 7;
  if (hasBelief && hasReversal && hasConsequence) score += 3;
  if (hasReversal && !hasBelief) score += 1;
  if (hasBelief && !hasReversal) score -= 4;

  return Math.max(-5, Math.min(10, score));
}

function tensionReleaseScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 30) return 0;

  const first = words.slice(0, Math.ceil(words.length * 0.33)).join(" ");
  const middle = words.slice(Math.floor(words.length * 0.28), Math.ceil(words.length * 0.72)).join(" ");
  const last = words.slice(Math.floor(words.length * 0.62)).join(" ");

  const stakes = /\b(?:risk|danger|problem|challenge|pressure|worried|scared|afraid|failed|lost|couldn'?t|almost|nearly|at stake|had to)\b/i;
  const tension = /\b(?:but|however|then|until|wait|suddenly|unexpected|surprisingly|thought|assumed|didn'?t know|didn'?t expect|stuck|struggled)\b/i;
  const release = /\b(?:because|so|that means|the answer|the reason|it turns out|turns out|realized|learned|discovered|finally|in the end|solved|worked|won|succeeded|result|relieved|better)\b/i;

  const hasStakes = stakes.test(first);
  const hasTension = tension.test(middle);
  const hasRelease = release.test(last);

  let score = 0;
  if (hasStakes && hasTension && hasRelease) score += 10;
  else if (hasStakes && hasRelease) score += 6;
  else if (hasTension && hasRelease) score += 3;
  if (hasStakes && !hasRelease) score -= 3;

  return Math.max(-5, Math.min(10, score));
}

function semanticLoopClosureScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 30) return 0;

  const early = words.slice(0, Math.ceil(words.length * 0.28)).join(" ");
  const late = words.slice(Math.floor(words.length * 0.68)).join(" ");
  const normalizeWords = (part) => new Set(
    part.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((word) => word.length >= 5)
  );

  const setupTerms = normalizeWords(early);
  const payoffTerms = normalizeWords(late);
  let shared = 0;
  for (const word of setupTerms) if (payoffTerms.has(word)) shared += 1;

  const closure = /\b(?:so|therefore|that means|which is why|because|as a result|in the end|finally|the lesson|the takeaway|the answer|the solution|it turns out)\b/i;
  const returnSignal = /\b(?:back to|going back|this is why|now you can see|that's why|that was the|the reason|the point|what this means)\b/i;

  let score = 0;
  if (shared >= 3 && closure.test(late)) score += 8;
  else if (shared >= 2 && closure.test(late)) score += 5;
  else if (shared >= 2) score += 2;
  if (returnSignal.test(late) && shared >= 2) score += 2;
  if (shared === 0 && closure.test(late)) score -= 3;

  return Math.max(-4, Math.min(10, score));
}

function quoteWorthinessScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 18) return 0;

  const rhetorical = /\b(?:the truth is|the point is|the real reason|what matters is|remember this|here's the thing|the biggest lesson|the mistake is|the answer is|you have to|you don't need to|never forget)\b/i;
  const contrast = /\b(?:but|however|instead|not because|rather than|the opposite|not about)\b/i;
  const punch = /[!?]/g;
  const firstPerson = /\b(?:I|we|you)\b/i;
  const repeated = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean)).size;
  const uniqueRatio = repeated / Math.max(1, words.length);

  let score = 0;
  if (rhetorical.test(value)) score += 5;
  if (contrast.test(value)) score += 3;
  if (firstPerson.test(value)) score += 1;
  if ((value.match(punch) || []).length >= 1) score += 2;
  if (uniqueRatio >= 0.55) score += 2;
  if (uniqueRatio < 0.38) score -= 4;
  if (words.length >= 18 && words.length <= 55) score += 2;

  return Math.max(-5, Math.min(10, score));
}

function audienceReactionCueScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 20) return 0;

  const reaction = /\b(?:wait|wow|seriously|no way|that's crazy|that's wild|exactly|you're right|really|are you serious|I can't believe|this is insane|unbelievable|what\?|how did|why would)/i;
  const escalation = /\b(?:then|suddenly|but|however|until|and then|right after|just when|unexpectedly|out of nowhere)\b/i;
  const consequence = /\b(?:because|so|that means|which is why|as a result|turns out|it turns out|ended up|finally|won|lost|failed|succeeded|changed)/i;

  let score = 0;
  if (reaction.test(value)) score += 6;
  if (reaction.test(value) && escalation.test(value)) score += 2;
  if (reaction.test(value) && consequence.test(value)) score += 2;
  if (reaction.test(value) && value.includes("?")) score += 1;

  return Math.max(-3, Math.min(10, score));
}

function consequenceClarityScore(text) {
  const value = String(text || "").trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 24) return 0;

  const consequence = /\b(?:because|so|therefore|that means|which is why|as a result|this led to|this caused|ended up|resulted in|made it|helped us|allowed us|prevented|saved|earned|lost|won|failed|succeeded|increased|decreased|changed)\b/i;
  const concrete = /\b(?:\$?\d[\d,.]*|\d+%|\d+ times|first|second|third|one|two|three|four|five|days?|weeks?|months?|years?|people|customers|views|sales|revenue|profit|time|hours?)\b/i;
  const vague = /\b(?:things|stuff|something|somehow|some things|a lot|really good|really bad|better|worse|great result|big difference)\b/i;

  let score = 0;
  if (consequence.test(value)) score += 5;
  if (consequence.test(value) && concrete.test(value)) score += 4;
  if (concrete.test(value)) score += 2;
  if (vague.test(value) && !concrete.test(value)) score -= 3;
  if (words.length >= 24 && words.length <= 65 && consequence.test(value)) score += 1;

  return Math.max(-4, Math.min(10, score));
}

function scoreWindow(text, duration, contextItems = [], allSegments = [], startIndex = 0, endIndex = 0) {
  let score = contextAwareWindowScore(contextItems, allSegments, startIndex, endIndex) + speakerInteractionScore(contextItems) + promiseFulfillmentScore(text) + beliefReversalScore(text) + tensionReleaseScore(text) + semanticLoopClosureScore(text) + quoteWorthinessScore(text) + audienceReactionCueScore(text) + consequenceClarityScore(text) + (earlyRetentionScore(text) * 2) + boundaryQualityScore(text) + standaloneContextScore(text) + payoffPlacementScore(text) + questionResolutionScore(text) + unresolvedTeaserScore(text) + outcomeCompletionScore(text) + narrativeProgressionScore(text) + storyPhaseCoverageScore(text) + questionPayoffCoherenceScore(text) + progressionMomentumScore(text) + openingContextDensityScore(text) + unresolvedReferencePenaltyScore(text) + endingClosureScore(text) + semanticShiftScore(text) + informationGainScore(text) + payoffSpecificityScore(text) + audienceCuriosityArcScore(text) + narrativePayoffDistanceScore(text) + emotionalArcScore(text) + claimEvidenceScore(text) + topicConsistencyScore(text) + sentenceRhythmScore(text) + payoffConcretenessScore(text) + noveltyProgressionScore(text) + payoffBridgeScore(text) + timeToValueScore(text) + payoffEscalationScore(text) + replayDependencyScore(text) + payoffNoveltyScore(text) + audienceValueProgressionScore(text) + speakerTurnContinuityScore(text) + repetitionPenaltyScore(text) + speechQualityScore(text) + valueDensityScore(text) + temporalFlowScore(text) + concreteEntityScore(text) + fillerRatioPenaltyScore(text) + contrastSignalScore(text) + hookPayoffAlignmentScore(text);
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
  // Prefer transcript segments that already contain strong narrative signals as
  // window anchors. We still keep every segment eligible, but signal anchors
  // get earlier attention and can capture a complete payoff without requiring
  // the clip to begin at an arbitrary sentence.
  const anchorIndexes = new Set();
  const anchorPatterns = [...HOOKS, ...PAYOFFS, ...CURIOSITY_GAPS, ...STAKES, ...STORY_ARCS, ...EMOTIONAL_SHIFTS];
  for (let i = 0; i < clean.length; i += 1) {
    const text = clean[i].text;
    if (anchorPatterns.some((pattern) => pattern.test(text))) anchorIndexes.add(i);
    if (/[!?]/.test(text) && text.split(/\s+/).filter(Boolean).length >= 8) anchorIndexes.add(i);
  }
  const requestedCandidateBudget = Math.max(1, Math.min(50, Number(limit) || 10));
  const startBudget = Math.min(
    clean.length,
    Math.max(360, Math.min(1200, requestedCandidateBudget * 36)),
  );
  const exhaustiveStarts = clean.length <= startBudget ? clean.map((_, index) => index) : null;
  const anchorStrength = (index) => {
    const text = clean[index]?.text || "";
    return anchorPatterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0)
      + (/[!?]/.test(text) ? 1 : 0);
  };
  const rankedAnchors = [...anchorIndexes].sort((a, b) => {
    const strengthGap = anchorStrength(b) - anchorStrength(a);
    return strengthGap || a - b;
  });
  const selectedStartIndexes = exhaustiveStarts ? [...exhaustiveStarts] : [];
  const selectedStartSet = new Set(selectedStartIndexes);
  const addStartIndex = (index) => {
    if (selectedStartIndexes.length >= startBudget || selectedStartSet.has(index)) return;
    selectedStartSet.add(index);
    selectedStartIndexes.push(index);
  };
  // Preserve the strongest semantic anchors first. This keeps long transcripts
  // fast without throwing away the moments most likely to contain a hook,
  // payoff, reveal, tension, or emotional turn.
  if (!exhaustiveStarts) {
    for (const index of rankedAnchors) addStartIndex(index);
  }
  // Fill the remaining budget with evenly distributed transcript positions so
  // quieter but valuable moments still have a path into the candidate pool.
  if (!exhaustiveStarts && selectedStartIndexes.length < startBudget) {
    const stride = clean.length / Math.max(1, startBudget - selectedStartIndexes.length);
    for (let slot = 0; slot < startBudget - selectedStartIndexes.length; slot += 1) {
      addStartIndex(Math.min(clean.length - 1, Math.floor(slot * stride)));
    }
  }
  const startIndexes = selectedStartIndexes.sort((a, b) => {
    const aAnchor = anchorIndexes.has(a) ? 0 : 1;
    const bAnchor = anchorIndexes.has(b) ? 0 : 1;
    return aAnchor - bAnchor || a - b;
  });
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
  for (const i of startIndexes) {
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
          duration: Number(refinedDuration.toFixed(3)), score: scoreWindow(refinedText, refinedDuration, refinedSegments, clean, i, j) + completeness + continuity,
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
  const sourceDuration = Math.max(0, ...clean.map((segment) => Number(segment.end) || 0));
  candidates.forEach((candidate) => {
    candidate.videoDuration = sourceDuration;
    candidate.storyStageCount = 4;
  });
  const selected = [];
  const pool = candidates.slice(0, Math.min(candidates.length, Math.max(safeCandidateLimit * 4, 40)));
  while (selected.length < safeCandidateLimit && pool.length) {
    let bestIndex = -1;
    let bestUtility = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      const overlaps = selected.some((item) => Math.max(item.start, candidate.start) < Math.min(item.end, candidate.end) - 2);
      // Reject repeated transcript moments even when they occur far apart in the source.
      const duplicate = selected.some((item) => transcriptSimilarity(item.transcript, candidate.transcript) >= 0.62);
      if (overlaps || duplicate) continue;
      const speakerSet = new Set(Array.isArray(candidate.speakers) ? candidate.speakers.map((speaker) => String(speaker || "").trim()).filter(Boolean) : []);
      const selectedSpeakers = new Set(selected.flatMap((item) => Array.isArray(item.speakers) ? item.speakers.map((speaker) => String(speaker || "").trim()).filter(Boolean) : []));
      const introducesNewSpeaker = speakerSet.size > 0 && [...speakerSet].some((speaker) => !selectedSpeakers.has(speaker));
      const speakerCoverageBonus = introducesNewSpeaker ? 5 : 0;
      const selectedTypes = new Set(selected.map((item) => String(item.highlightType || "").trim()).filter(Boolean));
      const introducesNewType = Boolean(candidate.highlightType) && !selectedTypes.has(candidate.highlightType);
      const typeCoverageBonus = introducesNewType ? 4 : 0;
      const duration = Math.max(
        Number(candidate.videoDuration) || 0,
        ...selected.map((item) => Number(item.videoDuration) || 0),
        Number(candidate.end) || 0,
      );
      const stageCount = Math.min(4, Math.max(1, Number(candidate.storyStageCount) || 4));
      const candidateStage = Math.min(
        stageCount - 1,
        Math.max(0, Math.floor(((Number(candidate.start) || 0) / Math.max(1, duration)) * stageCount)),
      );
      const selectedStages = new Set(selected.map((item) => {
        const itemDuration = Math.max(Number(item.videoDuration) || 0, Number(item.end) || 0);
        return Math.min(
          stageCount - 1,
          Math.max(0, Math.floor(((Number(item.start) || 0) / Math.max(1, itemDuration)) * stageCount)),
        );
      }));
      const stageCoverageBonus = selected.length < Math.ceil(safeLimit * 0.6) && !selectedStages.has(candidateStage) ? 6 : 0;
      const utility = candidate.score - diversityPenalty(candidate, selected) * 100 + speakerCoverageBonus + typeCoverageBonus + stageCoverageBonus;
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


function creatorLibraryNoveltyScore(text, creatorMemory = []) {
  const words = String(text || "").toLowerCase().match(/[a-z0-9']{4,}/g) || [];
  if (!words.length || !Array.isArray(creatorMemory) || !creatorMemory.length) return 100;
  const unique = [...new Set(words)];
  let strongestOverlap = 0;
  for (const memoryItem of creatorMemory.slice(0, 48)) {
    const memoryWords = new Set(String(memoryItem?.text || "").toLowerCase().match(/[a-z0-9']{4,}/g) || []);
    if (!memoryWords.size) continue;
    const overlap = unique.filter((word) => memoryWords.has(word)).length / Math.max(1, unique.length);
    strongestOverlap = Math.max(strongestOverlap, overlap);
  }
  return Math.max(0, Math.min(100, Math.round(100 - strongestOverlap * 100)));
}

function creatorLibraryRelationship(text, creatorMemory = []) {
  const value = String(text || "").toLowerCase();
  const words = value.match(/[a-z0-9']{4,}/g) || [];
  if (!words.length || !Array.isArray(creatorMemory) || !creatorMemory.length) {
    return { type: "new", score: 100, matchedMemory: 0 };
  }
  const stop = new Set(["this","that","with","from","have","were","they","them","then","than","when","what","your","you","for","are","was","but","not","into","about","just","really","very","there","their","would","could","should","because","also","some","more","been","being","were","will","what","where","which"]);
  const unique = [...new Set(words.filter((word) => word.length >= 5 && !stop.has(word)))];
  let best = { overlap: 0, memory: null };
  for (const memoryItem of creatorMemory.slice(0, 48)) {
    const memoryWords = new Set((String(memoryItem?.text || "").toLowerCase().match(/[a-z0-9']{4,}/g) || []).filter((word) => word.length >= 5 && !stop.has(word)));
    if (!memoryWords.size) continue;
    const shared = unique.filter((word) => memoryWords.has(word)).length;
    const overlap = shared / Math.max(1, Math.min(unique.length, memoryWords.size));
    if (overlap > best.overlap) best = { overlap, memory: memoryItem };
  }
  if (!best.memory || best.overlap < 0.12) return { type: "new", score: Math.round(100 - best.overlap * 40), matchedMemory: 0 };
  const update = /\b(?:update|updated|now|today|this time|since then|new result|latest|changed|improved|worse|better|again)\b/i.test(value);
  const reversal = /\b(?:but now|however|actually|turns out|changed my mind|changed our mind|i was wrong|we were wrong|opposite|instead)\b/i.test(value);
  const continuation = /\b(?:again|next|continued|continuing|still|follow-up|follow up|another|more on|building on|after that)\b/i.test(value);
  const repeat = best.overlap >= 0.55 && !update && !reversal && !continuation;
  const type = reversal ? "reversal" : update ? "update" : continuation ? "continuation" : repeat ? "repeat" : "new-angle";
  const score = Math.max(0, Math.min(100, Math.round((1 - best.overlap) * 70 + (reversal || update || continuation ? 30 : 8))));
  return { type, score, matchedMemory: best.memory?.videoId || best.memory?.title || "memory" };
}

function buildGlobalTranscriptContext(segments, maxItems = 72) {
  const clean = Array.isArray(segments)
    ? segments
        .map((segment) => ({
          start: Number(segment?.start),
          end: Number(segment?.end),
          text: String(segment?.text || "").replace(/\s+/g, " ").trim(),
          speaker: String(segment?.speaker || "").trim(),
        }))
        .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start && segment.text)
    : [];
  if (!clean.length) return [];
  const safeMaxItems = Math.max(12, Math.min(120, Number(maxItems) || 72));
  if (clean.length <= safeMaxItems) {
    return clean.map((segment, index) => ({
      index,
      start: Number(segment.start.toFixed(2)),
      end: Number(segment.end.toFixed(2)),
      speaker: segment.speaker || undefined,
      text: segment.text.slice(0, 220),
    }));
  }
  const picked = [];
  const step = (clean.length - 1) / (safeMaxItems - 1);
  for (let i = 0; i < safeMaxItems; i += 1) {
    const index = Math.min(clean.length - 1, Math.round(i * step));
    const segment = clean[index];
    picked.push({
      index,
      start: Number(segment.start.toFixed(2)),
      end: Number(segment.end.toFixed(2)),
      speaker: segment.speaker || undefined,
      text: segment.text.slice(0, 220),
    });
  }
  return picked;
}

export function selectNearbyContext(segments, start, end, maxItems = 8) {
  const safeStart = Number(start);
  const safeEnd = Number(end);
  const limit = Math.max(1, Math.min(12, Number(maxItems) || 8));
  if (!Number.isFinite(safeStart) || !Number.isFinite(safeEnd) || safeEnd <= safeStart) return [];
  const nearby = (Array.isArray(segments) ? segments : [])
    .map((segment, index) => ({
      index,
      start: Number(segment?.start),
      end: Number(segment?.end),
      text: String(segment?.text || "").replace(/\s+/g, " ").trim(),
      speaker: String(segment?.speaker || "").trim(),
    }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start && segment.text)
    .filter((segment) => segment.end >= safeStart - 18 && segment.start <= safeEnd + 18)
    .sort((a, b) => a.start - b.start)
    .reduce((picked, segment) => {
      if (segment.start < safeEnd && segment.end > safeStart) picked.inside.push(segment);
      else if (segment.end <= safeStart) picked.before.push(segment);
      else if (segment.start >= safeEnd) picked.after.push(segment);
      return picked;
    }, { inside: [], before: [], after: [] });
  const beforeBudget = Math.min(2, nearby.before.length);
  const afterBudget = Math.min(2, nearby.after.length);
  const insideBudget = Math.max(1, limit - beforeBudget - afterBudget);
  const inside = nearby.inside.length <= insideBudget
    ? nearby.inside
    : [
        ...nearby.inside.slice(0, Math.ceil(insideBudget / 2)),
        ...nearby.inside.slice(-Math.floor(insideBudget / 2)),
      ];
  return [...nearby.before.slice(-beforeBudget), ...inside, ...nearby.after.slice(0, afterBudget)]
    .sort((a, b) => a.start - b.start).slice(0, limit);
}

export async function rankHighlightsWithAI(segments, { limit = 12, minDuration = 15, maxDuration = 75, profile = "creator", targetTypes = [], performanceLearning = null, creatorMemory = [] } = {}) {
  const contentProfile = getContentProfile(normalizeContentProfile(profile));
  const learning = performanceLearning && typeof performanceLearning === "object" ? performanceLearning : {};
  const learnedTypeWeights = learning.byType && typeof learning.byType === "object" ? learning.byType : {};
  const learnedTypes = Object.entries(learnedTypeWeights)
    .map(([type, value]) => [String(type).toLowerCase(), Number(value)])
    .filter(([type, value]) => ["hook", "reveal", "payoff", "how-to", "humor", "emotion", "insight"].includes(type) && Number.isFinite(value))
    .sort((a, b) => b[1] - a[1]);
  const hasLearning = learnedTypes.length > 0 && Number(learning.trackedClips) > 0;
  const safeTargetTypes = [...new Set((Array.isArray(targetTypes) ? targetTypes : String(targetTypes || "").split(",")).map((type) => String(type || "").trim().toLowerCase()).filter((type) => ["hook", "reveal", "payoff", "how-to", "humor", "emotion", "insight"].includes(type)))].slice(0, 3);
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const engineMode = String(process.env.CLIPFORGE_HIGHLIGHT_ENGINE || "local").trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const safeMinDuration = Number.isFinite(Number(minDuration)) ? Math.min(300, Math.max(0, Number(minDuration))) : 15;
  const parsedMaxDuration = Number(maxDuration);
  const safeMaxDuration = Number.isFinite(parsedMaxDuration) && parsedMaxDuration > 0
    ? Math.max(safeMinDuration, Math.min(300, parsedMaxDuration))
    : 75;
  const fallback = () => rankHighlights(segments, { limit: safeLimit, minDuration: safeMinDuration, maxDuration: safeMaxDuration });
  // ClipForge-owned ranking is the default. External ranking is opt-in so the core
  // moment-selection pipeline does not require a paid AI request for every video.
  if (engineMode !== "openai") return { candidates: fallback(), engine: "clipforge-local-v1" };
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
  // Preserve a quality-first shortlist while reserving slots for strong moments
  // from later parts of the source. This keeps the AI from inheriting a blind
  // spot caused by the heuristic pre-ranker concentrating candidates in one
  // section of a long conversation.
  const qualityBudget = Math.max(12, Math.ceil(aiCandidateLimit * 0.7));
  const coverageBudget = Math.max(0, aiCandidateLimit - qualityBudget);
  const qualityCandidates = baseline.slice(0, qualityBudget);
  const remainingBaseline = baseline.slice(qualityBudget);
  const sourceStart = Number(segments?.[0]?.start);
  const sourceEnd = Array.isArray(segments) && segments.length
    ? Math.max(...segments.map((segment) => Number(segment?.end)).filter(Number.isFinite))
    : 0;
  const sourceDuration = Number.isFinite(sourceStart) && Number.isFinite(sourceEnd)
    ? Math.max(1, sourceEnd - sourceStart)
    : 0;
  const coverageCandidates = [];
  if (coverageBudget > 0 && sourceDuration > 0 && remainingBaseline.length) {
    const stageBuckets = Array.from({ length: 4 }, () => []);
    for (const candidate of remainingBaseline) {
      const relative = Math.max(0, Math.min(0.999999, (Number(candidate.start) - sourceStart) / sourceDuration));
      stageBuckets[Math.min(3, Math.floor(relative * 4))].push(candidate);
    }

    // Long interviews can contain several speakers whose strongest moments
    // would otherwise be crowded out by a single high-scoring section. Build
    // coverage in two passes: first reserve a few strong moments from distinct
    // story stages/speakers, then fill the remaining slots by baseline score.
    const coverageSeenSpeakers = new Set();
    const stageCount = stageBuckets.length;
    for (let pass = 0; pass < 2 && coverageCandidates.length < coverageBudget; pass += 1) {
      for (let stageIndex = 0; stageIndex < stageCount && coverageCandidates.length < coverageBudget; stageIndex += 1) {
        const bucket = stageBuckets[stageIndex];
        if (!bucket.length) continue;
        let pickIndex = 0;
        if (pass === 0) {
          const speakerIndex = bucket.findIndex((candidate) => {
            const speakers = Array.isArray(candidate.speakers)
              ? candidate.speakers.map((speaker) => String(speaker || "").trim()).filter(Boolean)
              : [];
            return speakers.some((speaker) => !coverageSeenSpeakers.has(speaker));
          });
          if (speakerIndex >= 0) pickIndex = speakerIndex;
        }
        const [picked] = bucket.splice(pickIndex, 1);
        coverageCandidates.push(picked);
        if (Array.isArray(picked.speakers)) {
          picked.speakers.map((speaker) => String(speaker || "").trim()).filter(Boolean)
            .forEach((speaker) => coverageSeenSpeakers.add(speaker));
        }
      }
    }

    while (coverageCandidates.length < coverageBudget && stageBuckets.some((bucket) => bucket.length)) {
      let bestBucket = -1;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (let stageIndex = 0; stageIndex < stageCount; stageIndex += 1) {
        const candidate = stageBuckets[stageIndex][0];
        if (!candidate) continue;
        const score = Number(candidate.score) || 0;
        if (score > bestScore) {
          bestScore = score;
          bestBucket = stageIndex;
        }
      }
      if (bestBucket < 0) break;
      coverageCandidates.push(stageBuckets[bestBucket].shift());
    }
  }
  const aiCandidates = [...qualityCandidates, ...coverageCandidates].slice(0, aiCandidateLimit);
  // Give the model a lightweight view of the entire conversation so it can judge
  // candidate windows against the broader story, not only the selected snippets.
  const globalConversationContext = buildGlobalTranscriptContext(segments);
  const safeCreatorMemory = Array.isArray(creatorMemory)
    ? creatorMemory
        .filter((item) => item && typeof item === "object" && String(item.text || "").trim())
        .slice(0, 48)
        .map((item) => ({
          videoId: String(item.videoId || "").slice(0, 80),
          title: String(item.title || "").slice(0, 120),
          text: String(item.text || "").replace(/\s+/g, " ").trim().slice(0, 260),
        }))
    : [];

  // Keep the AI context compact: the candidate transcript carries the main
  // evidence, while a small boundary window supplies just enough setup/payoff
  // context. Avoid repeating large nearby transcript blocks for every candidate,
  // which makes large 40-50 clip requests unnecessarily slow.
  const candidateContextById = new Map(aiCandidates.map((item, id) => [
    id,
    selectNearbyContext(segments, item.start, item.end, 6).map((segment) => ({
      index: segment.index,
      start: Number(segment.start.toFixed(2)),
      end: Number(segment.end.toFixed(2)),
      speaker: segment.speaker || undefined,
      text: segment.text.slice(0, 180),
    })),
  ]));

  const candidates = aiCandidates.map((item, id) => ({
    id,
    start: item.start,
    end: item.end,
    duration: item.duration,
    transcript: item.transcript.slice(0, 900),
    nearbyContext: candidateContextById.get(id) || [],
    speakers: [...new Set((candidateContextById.get(id) || [])
      .map((segment) => String(segment.speaker || "").trim())
      .filter(Boolean))],
    baselineScore: Math.round(Number(item.score) || 0),
    highlightType: item.highlightType || "insight",
    libraryNovelty: creatorLibraryNoveltyScore(item.transcript, safeCreatorMemory),
    libraryRelationship: creatorLibraryRelationship(item.transcript, safeCreatorMemory),
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_HIGHLIGHT_MODEL || "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: `Select the strongest short-form video moments from these transcript windows.\nYou also receive a lightweight global conversation map below. Use it to understand the overall topic, story progression, repeated ideas, and where each candidate fits in the full conversation. Do not select from the map directly; only select supplied candidate IDs.\nYou may also receive a lightweight creator memory from earlier videos. Use it only to understand recurring topics, terminology, themes, and continuity across this creator's library. Do not select or invent moments from memory; only select supplied candidate IDs. If the current video revisits an earlier topic, favor moments that add a new angle, meaningful update, contradiction, continuation, or stronger payoff instead of repeating an old idea. Each candidate includes libraryNovelty plus libraryRelationship intelligence. libraryRelationship describes whether the candidate appears to be a new angle, continuation, update, reversal, repeat, or new topic relative to sampled earlier-video memory. Use these as secondary signals only. Favor meaningful updates, reversals, continuations, and genuinely new angles over near-repeats when quality is comparable. Never reject a strong moment solely because it shares terminology with older content.\nCreator memory: ${JSON.stringify(safeCreatorMemory)} Each candidate also includes nearbyContext from the surrounding transcript. Use it to avoid cutting off setup or payoff, while scoring only the supplied candidate window.\nGlobal conversation map: ${JSON.stringify(globalConversationContext)}\n\nContent strategy: ${contentProfile.label}. Prioritize ${contentProfile.focus}. Reject ${contentProfile.reject}.
Prefer standalone hooks, surprising insights, emotion, humor, conflict, story payoffs, useful information, or memorable statements.\nJudge whether a viewer can understand what is happening without the original long-form video: reward enough setup to identify the subject, then a meaningful payoff, answer, realization, or useful takeaway.
When returning several clips, prefer genuinely strong moments from different stages of the conversation when quality is comparable. Do not cluster the entire clip pack around one short section of the source.
When the transcript has multiple speakers, also prefer genuinely strong moments that represent different speakers when quality is comparable.
${hasLearning ? `Use this project's historical performance as a secondary signal, not a hard rule. Previously tracked clip-type engagement: ${JSON.stringify(learnedTypes.slice(0, 5).map(([type, value]) => ({ type, engagementRate: Number(value.toFixed(2)) })))}. Favor proven types modestly when the transcript quality is comparable, but still surface genuinely exceptional moments of other types.` : ""}
Reject filler, contextless fragments, repetitive introductions, sponsor boilerplate, and windows that begin or end mid-thought. Prefer natural sentence boundaries and complete ideas. Also score editability: how ready the selected window is to publish as a standalone short clip with clean opening/ending boundaries, minimal dependence on unseen dialogue, and enough setup/payoff to work without manual transcript surgery. When useful, refine the clip boundaries using startSegment and endSegment from the provided nearby-context segment indexes.
${safeTargetTypes.length ? `Prioritize these intelligence types for this batch: ${safeTargetTypes.join(", ")}. Include them when the transcript genuinely supports them.` : ""}
Return ONLY JSON in this exact shape: {"selections":[{"id":0,"score":95,"hook":92,"standalone":94,"context":90,"payoff":90,"emotion":78,"clarity":96,"novelty":90,"replayability":88,"specificity":92,"editability":94,"startSegment":12,"endSegment":15,"reason":"brief reason","title":"short title","hookLine":"short spoken-style hook","socialCaption":"short caption for posting","type":"hook"}]}.
For type, choose exactly one of: "hook", "reveal", "payoff", "how-to", "humor", "emotion", "insight".
Use only supplied IDs. Score each selection from 0 to 100. For hookLine, write a concise attention-grabbing line grounded only in the selected moment. For socialCaption, write a concise natural-language post caption grounded only in the selected moment; do not invent facts, links, or hashtags. Do not invent timestamps.`,
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
    const byId = new Map(aiCandidates.map((item, id) => [id, {
      ...item,
      speakers: [...new Set((candidateContextById.get(id) || [])
        .map((segment) => String(segment.speaker || "").trim())
        .filter(Boolean))],
    }]));
    const optionalScore = (value) => {
      if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
      const score = Number(value);
      return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
    };
    const ranked = selections.map((selection) => {
      const base = byId.get(Number(selection.id));
      if (!base) return null;
      const aiScore = optionalScore(selection.score);
      const dimensionWeights = [
        ["standalone", 20],
        ["context", 8],
        ["hook", 12],
        ["clarity", 10],
        ["payoff", 12],
        ["emotion", 4],
        ["novelty", 7],
        ["replayability", 9],
        ["specificity", 8],
        ["editability", 8],
      ];
      let dimensionTotal = 0;
      let dimensionWeight = 0;
      let dimensionSignals = 0;
      for (const [key, weight] of dimensionWeights) {
        const value = optionalScore(selection[key]);
        if (value === null) continue;
        dimensionTotal += value * weight;
        dimensionWeight += weight;
        dimensionSignals += 1;
      }
      const dimensionScore = dimensionWeight > 0 ? dimensionTotal / dimensionWeight : null;
      // Treat the dimension bundle as a quality cross-check only when the model
      // actually returned a sufficiently complete bundle. A partial response
      // (for example, one or two dimensions plus an overall score) should not
      // move a candidate nearly as much as a complete model judgment.
      const hasReliableDimensionBundle = dimensionSignals >= 4;
      const effectiveDimensionScore = hasReliableDimensionBundle ? dimensionScore : null;
      const effectiveAiScore = aiScore === null
        ? effectiveDimensionScore
        : effectiveDimensionScore === null
          ? aiScore
          : Math.round(aiScore * 0.55 + effectiveDimensionScore * 0.45);
      const editabilityScore = optionalScore(selection.editability);
      const contextWindow = candidateContextById.get(Number(selection.id)) || [];
      const trimStartIndex = Number.isInteger(Number(selection.startSegment)) ? Number(selection.startSegment) : null;
      const trimEndIndex = Number.isInteger(Number(selection.endSegment)) ? Number(selection.endSegment) : null;
      let refinedStart = base.start;
      let refinedEnd = base.end;
      if (trimStartIndex !== null && trimEndIndex !== null && trimEndIndex >= trimStartIndex) {
        const trimStart = contextWindow.find((segment) => segment.index === trimStartIndex);
        const trimEnd = contextWindow.find((segment) => segment.index === trimEndIndex);
        if (trimStart && trimEnd && trimEnd.end > trimStart.start) {
          const proposedStart = Math.max(Number(base.start) - 4, Number(trimStart.start));
          const proposedEnd = Math.min(Number(base.end) + 4, Number(trimEnd.end));
          const proposedDuration = proposedEnd - proposedStart;
          if (proposedEnd > proposedStart && proposedDuration >= safeMinDuration && proposedDuration <= safeMaxDuration) {
            refinedStart = Number(proposedStart.toFixed(2));
            refinedEnd = Number(proposedEnd.toFixed(2));
          }
        }
      }
      const baselineScore = Math.max(0, Math.min(100, Number(base.score) * 0.8));
      const learnedTypeEngagement = learnedTypeWeights[String(selection.type || base.highlightType || "insight").trim().toLowerCase()];
      const learnedTypeBoost = hasLearning && Number.isFinite(Number(learnedTypeEngagement))
        ? Math.max(-4, Math.min(4, Number(learnedTypeEngagement) * 0.18))
        : 0;
      const editabilityPenalty = editabilityScore !== null && editabilityScore < 55
        ? (55 - editabilityScore) * 0.22
        : 0;
      const blendedScore = effectiveAiScore === null
        ? baselineScore + learnedTypeBoost - editabilityPenalty
        : Math.round(effectiveAiScore * 0.82 + baselineScore * 0.18 + learnedTypeBoost - editabilityPenalty);
      return {
        ...base,
        start: refinedStart,
        end: refinedEnd,
        score: blendedScore,
        aiScore,
        baselineScore: Math.round(baselineScore),
        blendedScore,
        hookScore: optionalScore(selection.hook),
        contextScore: optionalScore(selection.context),
        standaloneScore: optionalScore(selection.standalone),
        payoffScore: optionalScore(selection.payoff),
        emotionScore: optionalScore(selection.emotion),
        noveltyScore: optionalScore(selection.novelty),
        replayabilityScore: optionalScore(selection.replayability),
        specificityScore: optionalScore(selection.specificity),
        editabilityScore,
        clarityScore: optionalScore(selection.clarity),
        aiReason: String(selection.reason || "").trim().slice(0, 240),
        highlightType: allowedHighlightTypes.has(String(selection.type || "").trim().toLowerCase())
          ? String(selection.type).trim().toLowerCase()
          : base.highlightType || "insight",
        title: String(selection.title || base.title).replace(/\s+/g, " ").trim().slice(0, 100) || base.title,
        hookLine: String(selection.hookLine || "").replace(/\s+/g, " ").trim().slice(0, 160) || null,
        socialCaption: String(selection.socialCaption || "").replace(/\s+/g, " ").trim().slice(0, 320) || null,
        libraryNovelty: Number.isFinite(Number(base.libraryNovelty)) ? Math.max(0, Math.min(100, Number(base.libraryNovelty))) : null,
        libraryRelationship: base.libraryRelationship && typeof base.libraryRelationship === "object"
          ? {
              type: String(base.libraryRelationship.type || "new").trim().slice(0, 40) || "new",
              score: Number.isFinite(Number(base.libraryRelationship.score)) ? Math.max(0, Math.min(100, Number(base.libraryRelationship.score))) : null,
              matchedMemory: String(base.libraryRelationship.matchedMemory || "").trim().slice(0, 120) || null,
            }
          : null,
      };
    }).filter(Boolean).filter((candidate) => {
      const aiQuality = Number(candidate.aiScore);
      const standaloneValue = candidate.standaloneScore;
      const contextValue = candidate.contextScore;
      const standalone = Number(standaloneValue);
      const context = Number(contextValue);
      if (Number.isFinite(aiQuality) && aiQuality < 42) return false;
      if (standaloneValue !== null && standaloneValue !== undefined && Number.isFinite(standalone) && standalone < 45) return false;
      if (contextValue !== null && contextValue !== undefined && Number.isFinite(context) && context < 42) return false;
      return true;
    }).sort((a, b) => b.score - a.score || a.start - b.start);

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
      const duplicate = selected.some((item) => similarity(item.transcript, candidate.transcript) >= 0.62);
      if (duplicate) return false;
      selected.push(candidate);
      return true;
    };

    // Build a stronger clip pack with coverage-aware selection: reward a
    // requested intelligence type or a new type, while also covering distinct
    // story stages. This prevents a long interview from producing six clips
    // from the same opening section when equally strong moments exist later.
    const seenTypes = new Set();
    const selectedStoryChapters = new Set();
    const selectedSpeakers = new Set();
    const timelineStart = Number(segments?.[0]?.start);
    const timelineEnd = Array.isArray(segments) && segments.length
      ? Math.max(...segments.map((segment) => Number(segment?.end)).filter(Number.isFinite))
      : 0;
    const timelineDuration = Number.isFinite(timelineStart) && Number.isFinite(timelineEnd)
      ? Math.max(1, timelineEnd - timelineStart)
      : 0;
    const getStoryChapter = (candidate) => {
      if (!timelineDuration) return null;
      const relative = Math.max(0, Math.min(0.999999, (Number(candidate?.start) - timelineStart) / timelineDuration));
      return Math.min(3, Math.floor(relative * 4));
    };
    const selectionPool = [...ranked];
    while (selected.length < safeLimit && selectionPool.length) {
      let bestIndex = -1;
      let bestUtility = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < selectionPool.length; i += 1) {
        const candidate = selectionPool[i];
        const type = String(candidate.highlightType || "").trim().toLowerCase();
        const topScore = Number(selectionPool[0]?.score);
        const scoreGap = Number.isFinite(topScore) ? Math.max(0, topScore - Number(candidate.score || 0)) : 0;
        const coverageEligible = scoreGap <= 8;
        const requestedBonus = coverageEligible && safeTargetTypes.includes(type) && !seenTypes.has(type) ? 8 : 0;
        const noveltyBonus = coverageEligible && type && !seenTypes.has(type) ? 12 : 0;
        const weakContextPenalty = Number.isFinite(candidate.contextScore) && candidate.contextScore < 55
          ? (55 - candidate.contextScore) * 0.55
          : 0;
        const weakStandalonePenalty = Number.isFinite(candidate.standaloneScore) && candidate.standaloneScore < 60
          ? (60 - candidate.standaloneScore) * 0.35
          : 0;
        const temporalCoverageBonus = selected.length
          ? Math.min(8, Math.max(0, Math.min(...selected.map((item) => Math.abs(Number(candidate.start) - Number(item.start)))) / 18))
          : 0;
        const storyChapter = getStoryChapter(candidate);
        const storyCoverageBonus = coverageEligible && storyChapter !== null && !selectedStoryChapters.has(storyChapter)
          ? 12
          : 0;
        const candidateSpeakers = Array.isArray(candidate.speakers)
          ? candidate.speakers.map((speaker) => String(speaker || "").trim()).filter(Boolean)
          : [];
        const speakerCoverageBonus = coverageEligible && candidateSpeakers.length && candidateSpeakers.some((speaker) => !selectedSpeakers.has(speaker))
          ? 8
          : 0;
        const libraryNovelty = Number(candidate.libraryNovelty);
        const libraryRelationshipType = String(candidate.libraryRelationship?.type || "").trim().toLowerCase();
        const libraryNoveltyBonus = Number.isFinite(libraryNovelty)
          ? Math.max(0, Math.min(6, (libraryNovelty - 55) * 0.12))
          : 0;
        const repeatPenalty = libraryRelationshipType === "repeat"
          ? -4
          : libraryRelationshipType === "new-angle" || libraryRelationshipType === "update" || libraryRelationshipType === "reversal"
            ? 2
            : 0;
        // Avoid spending several clip slots on near-identical moments that
        // happen close together in the source. Keep this a soft penalty so a
        // genuinely stronger nearby moment can still win.
        const nearbyRedundancyPenalty = selected.reduce((penalty, item) => {
          const distance = Math.abs(Number(candidate.start) - Number(item.start));
          if (!Number.isFinite(distance) || distance >= 25) return penalty;
          const transcriptSimilarity = similarity(item.transcript, candidate.transcript);
          if (transcriptSimilarity < 0.4) return penalty;
          const proximity = (25 - distance) / 25;
          const redundancy = Math.min(1, (transcriptSimilarity - 0.4) / 0.3);
          return Math.max(penalty, Math.round(proximity * redundancy * 6));
        }, 0);
        const utility = Number(candidate.score || 0) + requestedBonus + noveltyBonus
          + temporalCoverageBonus + storyCoverageBonus + speakerCoverageBonus
          + libraryNoveltyBonus + repeatPenalty
          - weakContextPenalty - weakStandalonePenalty - nearbyRedundancyPenalty;
        if (utility > bestUtility) {
          bestUtility = utility;
          bestIndex = i;
        }
      }
      if (bestIndex < 0) break;
      const candidate = selectionPool.splice(bestIndex, 1)[0];
      const type = String(candidate.highlightType || "").trim().toLowerCase();
      if (addIfDistinct(candidate)) {
        if (type) seenTypes.add(type);
        const storyChapter = getStoryChapter(candidate);
        if (storyChapter !== null) selectedStoryChapters.add(storyChapter);
        if (Array.isArray(candidate.speakers)) {
          candidate.speakers.map((speaker) => String(speaker || "").trim()).filter(Boolean).forEach((speaker) => selectedSpeakers.add(speaker));
        }
      }
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
    const aiError = error?.name === "AbortError"
      ? "Highlight analysis timed out."
      : String(error?.message || "Highlight analysis failed.");
    // A billing/quota rejection should not block the rest of the product.
    // Use ClipForge's local ranking for that case and preserve the provider error.
    if (/no credits remaining|insufficient_quota|quota exceeded|billing|credit balance|out of credits/i.test(aiError)) {
      const localCandidates = fallback();
      if (localCandidates.length) {
        console.warn("ClipForge: OpenAI highlight ranking has no available credits; using ClipForge local ranking.");
        return {
          candidates: localCandidates,
          engine: "clipforge-local-v1",
          aiError,
        };
      }
    }
    return {
      candidates: [],
      engine: "openai-highlights-error",
      aiError,
    };
  } finally {
    clearTimeout(timer);
  }
}