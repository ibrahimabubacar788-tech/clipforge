const parseTime = (value) => {
  const text = String(value || "").trim().replace(",", ".");
  const match = text.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
  if (match) {
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if ([hours, minutes, seconds].every(Number.isFinite) && minutes < 60 && seconds < 60) {
      return hours * 3600 + minutes * 60 + seconds;
    }
  }
  const seconds = Number(text);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : NaN;
};

const cleanText = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function normalizeTranscript(segments) {
  return (Array.isArray(segments) ? segments : [])
    .filter((segment) => Number.isFinite(Number(segment.start)) && Number.isFinite(Number(segment.end)) && Number(segment.end) > Number(segment.start) && String(segment.text || "").trim())
    .map((segment) => ({
      start: Number(segment.start),
      end: Number(segment.end),
      ...(segment.speaker ? { speaker: String(segment.speaker).trim() } : {}),
      text: cleanText(segment.text),
    }))
    .sort((a, b) => a.start - b.start);
}

export function parsePipeTranscript(text) {
  return normalizeTranscript(String(text || "").split("\n").map((line) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 4) return null;
    const start = parseTime(parts[0]);
    const end = parseTime(parts[1]);
    const speaker = parts[2] || undefined;
    const caption = cleanText(parts.slice(3).join(" | "));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !caption) return null;
    return { start, end, speaker, text: caption };
  }).filter(Boolean));
}

export function parseTimestampedTranscript(text, format = "auto") {
  const raw = String(text || "").replace(/\r/g, "");
  const detected = format === "auto" ? (/WEBVTT/i.test(raw) ? "vtt" : /-->/.test(raw) ? "srt" : "plain") : format;
  if (detected === "plain") return parsePipeTranscript(raw);
  const segments = [];
  for (const block of raw.split(/\n\s*\n/)) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex].split("-->");
    const start = parseTime(timing[0].split(/\s+/)[0]);
    const end = parseTime(timing[1].split(/\s+/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const textLines = lines.slice(timingIndex + 1);
    let speaker;
    const speakerMatch = textLines[0]?.match(/^\[?([^\]:]{1,60})\]?\s*:\s*(.+)$/);
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      textLines[0] = speakerMatch[2].trim();
    }
    const caption = cleanText(textLines.join(" "));
    if (caption) segments.push({ start, end, speaker, text: caption });
  }
  return normalizeTranscript(segments);
}
