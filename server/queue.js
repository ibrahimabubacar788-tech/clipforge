import { access, mkdir, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { id, now } from "./database.js";
import ffmpegStatic from "ffmpeg-static";

const formats = {
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1280, height: 720 },
};
const captionColors = { lime: "d3e964", pink: "ff8fbe", sky: "8be1ff" };

function escapeDrawtext(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/%/g, "\\%");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FFmpeg render timed out."));
    }, 15 * 60 * 1000);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-1000)}`)); });
  });
}

function sourcePath(storageDir, sourceUrl) {
  if (typeof sourceUrl !== "string" || !sourceUrl.startsWith("/storage/uploads/")) throw new Error("Source video must be an uploaded file.");
  const uploadsDir = resolve(storageDir, "uploads");
  const file = resolve(storageDir, sourceUrl.slice("/storage/".length));
  const relativeSource = relative(uploadsDir, file);
  if (relativeSource.startsWith("..") || relativeSource.startsWith("/") || relativeSource.startsWith("\\\\")) throw new Error("Invalid source video path.");
  return file;
}

const watermarkGlyphs = {
  C: ["01110","10001","10000","10000","10000","10001","01110"],
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  I: ["11111","00100","00100","00100","00100","00100","11111"],
  P: ["11110","10001","10001","11110","10000","10000","10000"],
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  R: ["11110","10001","10001","11110","10100","10010","10001"],
  G: ["01110","10001","10000","10111","10001","10001","01110"],
  E: ["11111","10000","10000","11110","10000","10000","11111"],
};

function watermarkPpm() {
  const text = "CLIPFORGE";
  const scale = 4;
  const padding = 8;
  const gap = 2;
  const glyphWidth = 5;
  const glyphHeight = 7;
  const width = padding * 2 + text.length * glyphWidth * scale + (text.length - 1) * gap * scale;
  const height = padding * 2 + glyphHeight * scale;
  const pixels = Array.from({ length: width * height }, () => [18, 18, 18]);
  const setPixel = (x, y, rgb) => {
    if (x >= 0 && x < width && y >= 0 && y < height) pixels[y * width + x] = rgb;
  };
  let cursor = padding;
  for (const letter of text) {
    const glyph = watermarkGlyphs[letter];
    for (let gy = 0; gy < glyphHeight; gy += 1) {
      for (let gx = 0; gx < glyphWidth; gx += 1) {
        if (glyph[gy][gx] !== "1") continue;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) setPixel(cursor + gx * scale + sx, padding + gy * scale + sy, [245, 245, 245]);
        }
      }
    }
    cursor += glyphWidth * scale + gap * scale;
  }
  const data = pixels.flat().join(" ");
  return `P3\n${width} ${height}\n255\n${data}\n`;
}

function videoFilter(clip) {
  const { width, height } = formats[clip.format] || formats["9:16"];
  const filters = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[base]`,
    `[1:v]format=rgb24,colorkey=0x121212:0.08:0.02,format=rgba[wm]`,
    `[base][wm]overlay=W-w-24:H-h-24:format=auto[v]`,
  ];
  return filters.join(";");
}

export class ClipQueue {
  constructor(db, storageDir, { ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg" } = {}) { this.db = db; this.storageDir = storageDir; this.ffmpegPath = ffmpegPath; this.running = false; }
  async recover() {
    await this.db.transaction((d) => {
      for (const job of d.jobs) {
        if (job.status === "processing") { job.status = "queued"; job.progress = 0; delete job.startedAt; }
      }
    });
    void this.work().catch((error) => console.error("ClipForge queue worker crashed:", error));
  }
  async enqueue(clip) { const job = { id: id("job"), clipId: clip.id, status: "queued", progress: 0, createdAt: now() }; await this.db.transaction((d) => d.jobs.push(job)); void this.work().catch((error) => console.error("ClipForge queue worker crashed:", error)); return job; }
  async render(clip) {
    const source = sourcePath(this.storageDir, clip.sourceUrl);
    await access(source);
    const exportDir = join(this.storageDir, "exports");
    await mkdir(exportDir, { recursive: true });
    const filename = `${clip.id}.mp4`;
    const output = join(exportDir, filename);
    const duration = clip.end - clip.start;
    try {
      const watermarkPath = join(exportDir, `watermark-${clip.id}.ppm`);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(watermarkPath, watermarkPpm(), "utf8");
    try {
      await run(this.ffmpegPath, ["-y", "-i", source, "-loop", "1", "-i", watermarkPath, "-ss", String(clip.start), "-t", String(duration), "-filter_complex", videoFilter(clip), "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", output]);
    } finally {
      await unlink(watermarkPath).catch(() => {});
    }
    } catch (error) {
      await unlink(output).catch(() => {});
      throw error;
    }
    return { filename, output };
  }
  async work() {
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
      const job = await this.db.transaction((d) => { const next = d.jobs.find((j) => j.status === "queued"); if (next) { next.status = "processing"; next.progress = 15; next.startedAt = now(); } return next && { ...next }; });
      if (!job) break;
      try {
        const clip = await this.db.read((d) => d.clips.find((c) => c.id === job.clipId));
        if (!clip) throw new Error("Clip not found.");
        await this.db.transaction((d) => { const j = d.jobs.find((x) => x.id === job.id); if (j) j.progress = 35; });
        console.log(`ClipForge render started: ${job.id} clip=${clip.id} ffmpeg=${this.ffmpegPath}`);
        const { filename } = await this.render(clip);
        await this.db.transaction((d) => { const j = d.jobs.find((x) => x.id === job.id); const c = d.clips.find((x) => x.id === job.clipId); if (j) Object.assign(j, { status: "completed", progress: 100, completedAt: now() }); if (c) Object.assign(c, { status: "ready", downloadUrl: `/storage/exports/${filename}`, updatedAt: now() }); });
      } catch (error) {
        console.error(`ClipForge render failed: job=${job.id} clip=${job.clipId} error=${error.message}`);
        await this.db.transaction((d) => { const j = d.jobs.find((x) => x.id === job.id); const c = d.clips.find((x) => x.id === job.clipId); if (j) Object.assign(j, { status: "failed", error: error.message, completedAt: now() }); if (c) Object.assign(c, { status: "failed", updatedAt: now() }); });
      }
      }
    } finally {
      this.running = false;
    }
  }
  async removeExport(downloadUrl) {
    if (!downloadUrl?.startsWith("/storage/exports/")) return;
    const exportDir = resolve(this.storageDir, "exports");
    const candidate = resolve(this.storageDir, downloadUrl.slice("/storage/".length));
    const relativeExport = relative(exportDir, candidate);
    if (relativeExport.startsWith("..") || relativeExport.startsWith("/") || relativeExport.startsWith("\\\\")) return;
    await unlink(candidate).catch(() => {});
  }
}
