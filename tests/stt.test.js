import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { transcribeVideo } from "../server/stt.js";

function command(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${binary} exited with ${code}: ${stderr}`)));
  });
}

test("automatic transcription forwards the selected language to OpenAI", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-stt-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const source = join(dir, "source.mp4");
  await command(ffmpegStatic, [
    "-y",
    "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=12",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000",
    "-t", "1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    source
  ]);

  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";

  let receivedLanguage;
  globalThis.fetch = async (_url, options) => {
    receivedLanguage = options.body.get("language");
    const audio = options.body.get("file");
    assert.equal(audio.name, "clipforge-audio.mp3");
    return new Response(JSON.stringify({
      segments: [{ start: 0, end: 0.8, speaker: "SPEAKER_00", text: "Hello" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const transcript = await transcribeVideo({ source, ffmpegPath: ffmpegStatic, language: "yo" });
    assert.equal(receivedLanguage, "yo");
    assert.deepEqual(transcript, [{ start: 0, end: 0.8, speaker: "SPEAKER_00", text: "Hello" }]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
