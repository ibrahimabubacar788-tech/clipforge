import { readFile, unlink, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Audio extraction timed out.")); }, 15 * 60 * 1000);
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`FFmpeg audio extraction failed: ${stderr.slice(-1200)}`));
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

export async function transcribeVideo({ source, ffmpegPath, language = "en" }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Automatic transcription is not configured. Add OPENAI_API_KEY to the server environment."), { status: 503 });

  const tempDir = join(dirname(source), "transcription-temp");
  const audioFile = join(tempDir, `audio-${randomUUID()}.mp3`);
  await mkdir(tempDir, { recursive: true });

  try {
    await run(ffmpegPath, ["-y", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audioFile]);
    const audio = await readFile(audioFile);
    const form = new FormData();
    form.append("file", new Blob([audio], { type: "audio/mpeg" }), "clipforge-audio.mp3");
    form.append("model", "gpt-4o-transcribe-diarize");
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
    if (language) form.append("language", language);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const raw = await response.text();
    let result = {};
    try { result = JSON.parse(raw); } catch { result = { error: { message: raw } }; }
    if (!response.ok) throw Object.assign(new Error(result?.error?.message || "Automatic transcription failed."), { status: response.status >= 500 ? 502 : 422 });
    return normalizeTranscriptionResponse(result);
  } finally {
    await unlink(audioFile).catch(() => {});
  }
}
