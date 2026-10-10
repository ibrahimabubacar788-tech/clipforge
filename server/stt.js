import { readFile, unlink, mkdtemp, rm, open } from "node:fs/promises";
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

function normalizeAssemblyAIResponse(response) {
  const utterances = Array.isArray(response?.utterances) ? response.utterances : [];
  if (utterances.length) {
    return utterances
      .map((item) => ({
        start: Number(item.start) / 1000,
        end: Number(item.end) / 1000,
        ...(item.speaker ? { speaker: String(item.speaker).trim() } : {}),
        text: String(item.text || "").trim(),
      }))
      .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start && segment.text);
  }

  const words = Array.isArray(response?.words) ? response.words : [];
  const segments = [];
  let current = null;
  for (const word of words) {
    const text = String(word.text || word.text_with_speaker || "").trim();
    const start = Number(word.start) / 1000;
    const end = Number(word.end) / 1000;
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (!current) current = { start, end, text };
    else {
      current.end = end;
      current.text += ` ${text}`;
    }
    if (/[.!?]["'”’)]?$/.test(text) || current.text.split(/\s+/).length >= 12) {
      segments.push(current);
      current = null;
    }
  }
  if (current) segments.push(current);
  return segments;
}

async function transcribeWithAssemblyAI({ audioFile, language }) {
  const apiKey = String(process.env.ASSEMBLYAI_API_KEY || "").trim();
  if (!apiKey) throw Object.assign(new Error("AssemblyAI transcription is not configured."), { status: 503 });

  const audio = await readFile(audioFile);
  const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/octet-stream" },
    body: audio,
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  const uploadRaw = await uploadResponse.text();
  let uploadResult = {};
  try { uploadResult = JSON.parse(uploadRaw); } catch { uploadResult = {}; }
  if (!uploadResponse.ok || !uploadResult.upload_url) {
    throw Object.assign(new Error(uploadResult.error || "AssemblyAI could not accept the audio upload."), { status: uploadResponse.status >= 500 ? 502 : 422 });
  }

  const requestBody = {
    audio_url: uploadResult.upload_url,
    speech_models: ["universal-3-pro", "universal-2"],
    speaker_labels: true,
  };
  if (language && language !== "auto") requestBody.language_code = language;

  const submitResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(60 * 1000),
  });
  const submitRaw = await submitResponse.text();
  let transcript = {};
  try { transcript = JSON.parse(submitRaw); } catch { transcript = {}; }
  if (!submitResponse.ok || !transcript.id) {
    throw Object.assign(new Error(transcript.error || "AssemblyAI could not start transcription."), { status: submitResponse.status >= 500 ? 502 : 422 });
  }

  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${encodeURIComponent(transcript.id)}`, {
      headers: { authorization: apiKey },
      signal: AbortSignal.timeout(30 * 1000),
    });
    const pollRaw = await pollResponse.text();
    try { transcript = JSON.parse(pollRaw); } catch { transcript = {}; }
    if (!pollResponse.ok) {
      throw Object.assign(new Error(transcript.error || "AssemblyAI transcription status could not be checked."), { status: pollResponse.status >= 500 ? 502 : 422 });
    }
    if (transcript.status === "completed") return normalizeAssemblyAIResponse(transcript);
    if (transcript.status === "error") {
      throw Object.assign(new Error(transcript.error || "AssemblyAI transcription failed."), { status: 422 });
    }
  }
  throw Object.assign(new Error("Automatic transcription timed out while waiting for AssemblyAI."), { status: 504 });
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

let localWhisperPipelinePromise = null;

async function transcribeWithLocalWhisper({ source, ffmpegPath, tempDir }) {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = process.env.CLIPFORGE_MODEL_CACHE
    || join(process.env.HOME || dirname(source), ".cache", "clipforge-models");
  env.allowLocalModels = false;

  const pcmFile = join(tempDir, "audio-f32le.pcm");
  await run(ffmpegPath, [
    "-y", "-i", source, "-vn", "-ac", "1", "-ar", "16000",
    "-f", "f32le", "-acodec", "pcm_f32le", pcmFile,
  ]);

  const pcmHandle = await open(pcmFile, "r");
  const pcmStat = await pcmHandle.stat();
  const bytesPerSample = 4;
  if (!pcmStat.size || pcmStat.size % bytesPerSample !== 0) {
    await pcmHandle.close();
    throw new Error("Local transcription could not decode the audio.");
  }

  const model = process.env.CLIPFORGE_WHISPER_MODEL || "onnx-community/whisper-tiny";
  // Load the local model once per server process instead of re-downloading/reloading
  // it for every video. If loading fails, clear the cached promise so a later retry works.
  if (!localWhisperPipelinePromise) {
    localWhisperPipelinePromise = pipeline("automatic-speech-recognition", model, {
      dtype: "q8",
      device: "cpu",
    }).catch((error) => {
      localWhisperPipelinePromise = null;
      throw error;
    });
  }

  try {
    const transcriber = await localWhisperPipelinePromise;
    const totalSamples = pcmStat.size / bytesPerSample;
    const sampleRate = 16000;
    const windowSeconds = 30;
    const overlapSeconds = 5;
    const windowSamples = windowSeconds * sampleRate;
    const hopSamples = (windowSeconds - overlapSeconds) * sampleRate;
    const segments = [];

    // Read and infer one bounded audio window at a time. This avoids holding the
    // entire video's decoded audio in RAM on small hosted instances.
    for (let offsetSamples = 0; offsetSamples < totalSamples; offsetSamples += hopSamples) {
      const sampleCount = Math.min(windowSamples, totalSamples - offsetSamples);
      const audioBuffer = Buffer.allocUnsafe(sampleCount * bytesPerSample);
      const { bytesRead } = await pcmHandle.read(
        audioBuffer,
        0,
        audioBuffer.length,
        offsetSamples * bytesPerSample,
      );
      if (bytesRead !== audioBuffer.length) {
        throw new Error("Local transcription could not read a complete audio window.");
      }

      const audio = new Float32Array(
        audioBuffer.buffer.slice(
          audioBuffer.byteOffset,
          audioBuffer.byteOffset + audioBuffer.byteLength,
        ),
      );
      const result = await transcriber(audio, {
        sampling_rate: sampleRate,
        return_timestamps: "chunk",
      });
      const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
      const windowStart = offsetSamples / sampleRate;
      const windowDuration = sampleCount / sampleRate;
      const isFirstWindow = offsetSamples === 0;
      const isLastWindow = offsetSamples + sampleCount >= totalSamples;
      const ownershipStart = isFirstWindow ? 0 : overlapSeconds / 2;
      const ownershipEnd = isLastWindow ? windowDuration : windowSeconds - overlapSeconds / 2;

      for (const chunk of chunks) {
        const start = Number(chunk.timestamp?.[0]);
        const end = Number(chunk.timestamp?.[1]);
        const text = String(chunk.text || "").trim();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) continue;

        // Adjacent windows overlap by five seconds. Assign each overlap midpoint
        // to one window only so the transcript does not repeat boundary phrases.
        const midpoint = (start + end) / 2;
        if (midpoint < ownershipStart || midpoint >= ownershipEnd) continue;
        segments.push({
          start: windowStart + start,
          end: windowStart + end,
          text,
        });
      }
    }

    segments.sort((left, right) => left.start - right.start);
    if (!segments.length) {
      throw new Error("Local transcription returned no timestamped speech segments.");
    }
    console.info("ClipForge: transcription completed using local Whisper (windowed audio).");
    return segments;
  } finally {
    await pcmHandle.close().catch(() => {});
  }
}

export async function transcribeVideo({ source, ffmpegPath, language = "en" }) {
  const assemblyKey = String(process.env.ASSEMBLYAI_API_KEY || "").trim();
  const openAIKey = String(process.env.OPENAI_API_KEY || "").trim();
  const tempDir = await mkdtemp(join(dirname(source), ".clipforge-transcription-"));
  const audioFile = join(tempDir, `audio-${randomUUID()}.mp3`);
  let providerError = null;

  try {
    await run(ffmpegPath, ["-y", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audioFile]);

    if (assemblyKey) {
      try {
        const segments = await transcribeWithAssemblyAI({ audioFile, language });
        if (segments.length) return segments;
        throw new Error("AssemblyAI returned no timestamped speech segments.");
      } catch (error) {
        providerError = error;
        console.warn("ClipForge: AssemblyAI transcription failed; trying the next available transcription route.");
      }
    }

    if (openAIKey) {
      try {
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
            headers: { Authorization: `Bearer ${openAIKey}` },
            body: form,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        const raw = await response.text();
        let result = {};
        try { result = JSON.parse(raw); } catch { result = { error: { message: raw } }; }
        if (!response.ok) {
          throw Object.assign(
            new Error(result?.error?.message || "OpenAI transcription failed."),
            { status: response.status >= 500 ? 502 : 422 },
          );
        }
        const segments = normalizeTranscriptionResponse(result);
        if (segments.length) return segments;
        throw new Error("OpenAI returned no timestamped speech segments.");
      } catch (error) {
        providerError = error;
        console.warn("ClipForge: hosted transcription failed; trying local Whisper.");
      }
    }

    try {
      return await transcribeWithLocalWhisper({ source, ffmpegPath, tempDir });
    } catch (localError) {
      const hostedMessage = providerError ? String(providerError.message || providerError) : "No hosted transcription provider is configured.";
      const localMessage = String(localError.message || localError);
      throw Object.assign(
        new Error(`Automatic transcription failed. Hosted provider: ${hostedMessage} Local Whisper: ${localMessage}`),
        { status: 503, cause: localError },
      );
    }
  } finally {
    await unlink(audioFile).catch(() => {});
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
