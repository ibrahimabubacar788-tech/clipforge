import { readFile, unlink, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Audio extraction timed out."));
    }, 15 * 60 * 1000);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(new Error(`FFmpeg audio extraction failed: ${stderr.slice(-1200)}`));
    });
  });
}

export function normalizeTranscriptionResponse(response) {
  return (Array.isArray(response?.segments) ? response.segments : [])
    .map((segment) => ({
      start: Number(segment.start),
      end: Number(segment.end),
      ...(segment.speaker ? { speaker: String(segment.speaker).trim() } : {}),
      text: String(segment.text || "").trim(),
    }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start && segment.text);
}

export const INTERNATIONAL_LANGUAGES = [
["auto","Auto-detect spoken language"],["en","English"],["es","Spanish"],["fr","French"],["de","German"],["pt","Portuguese"],["it","Italian"],["nl","Dutch"],["pl","Polish"],["tr","Turkish"],["ru","Russian"],["uk","Ukrainian"],["ar","Arabic"],["he","Hebrew"],["fa","Persian"],["hi","Hindi"],["bn","Bengali"],["ur","Urdu"],["ta","Tamil"],["te","Telugu"],["mr","Marathi"],["gu","Gujarati"],["kn","Kannada"],["ml","Malayalam"],["pa","Punjabi"],["th","Thai"],["vi","Vietnamese"],["id","Indonesian"],["ms","Malay"],["ja","Japanese"],["ko","Korean"],["zh","Chinese"],["sw","Swahili"],["yo","Yoruba"],["ha","Hausa"],["ig","Igbo"],["am","Amharic"],["zu","Zulu"],["fil","Filipino"],["ro","Romanian"],["cs","Czech"],["el","Greek"],["hu","Hungarian"],["sv","Swedish"],["da","Danish"],["fi","Finnish"],["no","Norwegian"],["sk","Slovak"],["bg","Bulgarian"],["sr","Serbian"],["hr","Croatian"]
];

export async function translateTranscriptSegments(segments, targetLanguage) {
  const target = String(targetLanguage || "").trim().toLowerCase();
  if (!target || target === "original" || target === "auto") return segments;
  if (!Array.isArray(segments) || !segments.length) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("AI translation is not configured. Add OPENAI_API_KEY to the server environment."), { status: 503 });
  const batchSize = 500;
  const translatedSegments = [];
  for (let offset = 0; offset < segments.length; offset += batchSize) {
    const batch = segments.slice(offset, offset + batchSize);
    const compact = batch.map((segment, index) => ({ index, start: segment.start, end: segment.end, text: segment.text }));
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.CLIPFORGE_TRANSLATION_MODEL || "gpt-4o-mini",
        input: "Translate every transcript segment into " + target + ". Preserve each index, start, and end exactly. Return JSON only as an array of objects with index and text. Do not summarize, omit, merge, or reorder segments. Preserve names and meaning.\n\n" + JSON.stringify(compact)
      })
    });
    const raw = await response.text();
    let result = {};
    try { result = JSON.parse(raw); } catch { result = { error: { message: raw } }; }
    if (!response.ok) throw Object.assign(new Error(result?.error?.message || "AI translation failed."), { status: response.status >= 500 ? 502 : 422 });
    const output = String(result.output_text || "").trim().replace("```json", "").replace("```", "").trim();
    let translated;
    try { translated = JSON.parse(output); } catch { throw Object.assign(new Error("AI translation returned an invalid result."), { status: 502 }); }
    const byIndex = new Map((Array.isArray(translated) ? translated : []).map(item => [Number(item.index), String(item.text || "").trim()]));
    batch.forEach((segment, index) => translatedSegments.push({ ...segment, text: byIndex.get(index) || segment.text }));
  }
  return translatedSegments;
}
export async function transcribeVideo({ source, ffmpegPath, language = "en" }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Automatic transcription is not configured. Add OPENAI_API_KEY to the server environment."), { status: 503 });

  const tempDir = await mkdtemp(join(dirname(source), ".clipforge-transcription-"));
  const audioFile = join(tempDir, `audio-${randomUUID()}.mp3`);

  try {
    await run(ffmpegPath, ["-y", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audioFile]);
    const audio = await readFile(audioFile);
    const form = new FormData();
    form.append("file", new Blob([audio], { type: "audio/mpeg" }), "clipforge-audio.mp3");
    form.append("model", "gpt-4o-transcribe-diarize");
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
    if (language && language !== "auto") form.append("language", language);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15 * 60 * 1000);
    let response;
    try {
      response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw Object.assign(new Error("Automatic transcription timed out."), { status: 504 });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const raw = await response.text();
    let result = {};
    try { result = JSON.parse(raw); } catch { result = { error: { message: raw } }; }
    if (!response.ok) throw Object.assign(new Error(result?.error?.message || "Automatic transcription failed."), { status: response.status >= 500 ? 502 : 422 });
    return normalizeTranscriptionResponse(result);
  } finally {
    await unlink(audioFile).catch(() => {});
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
