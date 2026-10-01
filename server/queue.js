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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    const timeout = setTimeout(() => {\n      child.kill("SIGKILL");\n      reject(new Error("FFmpeg render timed out."));\n    }, 15 * 60 * 1000);
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
  const relativeSource = relative(uploadsDir, file);\n  if (relativeSource.startsWith("..") || relativeSource.startsWith("/") || relativeSource.startsWith("\\\\")) throw new Error("Invalid source video path.");
  return file;
}

function videoFilter(clip) {
  const { width, height } = formats[clip.format] || formats["9:16"];
  const filters = [`scale=${width}:${height}:force_original_aspect_ratio=increase`, `crop=${width}:${height}`];
  if (clip.captions) {
    const color = captionColors[clip.style?.color] || captionColors.lime;
    const emphasis = clip.style?.weight === "soft" ? "fontsize=32:fontcolor=white:borderw=2" : `fontsize=38:fontcolor=${color}:bordercolor=black:borderw=4`;
    // This intentionally uses a deterministic label until a transcription provider is configured.
    // It still gives exports a real burned-in caption treatment and applies the selected style.
    filters.push(`drawtext=text='Captions enabled':x=(w-text_w)/2:y=h-(text_h*3):${emphasis}`);
  }
  return filters.join(",");
}

export class ClipQueue {
  constructor(db, storageDir, { ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg" } = {}) { this.db = db; this.storageDir = storageDir; this.ffmpegPath = ffmpegPath; this.running = false; }
  async recover() {
    await this.db.transaction((d) => {
      for (const job of d.jobs) {
        if (job.status === "processing") { job.status = "queued"; job.progress = 0; delete job.startedAt; }
      }
    });
    void this.work();
  }
  async enqueue(clip) { const job = { id: id("job"), clipId: clip.id, status: "queued", progress: 0, createdAt: now() }; await this.db.transaction((d) => d.jobs.push(job)); void this.work(); return job; }
  async render(clip) {
    const source = sourcePath(this.storageDir, clip.sourceUrl);
    await access(source);
    const exportDir = join(this.storageDir, "exports");
    await mkdir(exportDir, { recursive: true });
    const filename = `${clip.id}.mp4`;
    const output = join(exportDir, filename);
    const duration = clip.end - clip.start;
    try {
      await run(this.ffmpegPath, ["-y", "-i", source, "-ss", String(clip.start), "-t", String(duration), "-map", "0:v:0", "-map", "0:a?", "-vf", videoFilter(clip), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output]);
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
        const { filename } = await this.render(clip);
        await this.db.transaction((d) => { const j = d.jobs.find((x) => x.id === job.id); const c = d.clips.find((x) => x.id === job.clipId); if (j) Object.assign(j, { status: "completed", progress: 100, completedAt: now() }); if (c) Object.assign(c, { status: "ready", downloadUrl: `/storage/exports/${filename}`, updatedAt: now() }); });
      } catch (error) {
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
    const relativeExport = relative(exportDir, candidate);\n    if (relativeExport.startsWith("..") || relativeExport.startsWith("/") || relativeExport.startsWith("\\\\")) return;
    await unlink(candidate).catch(() => {});
  }
}
