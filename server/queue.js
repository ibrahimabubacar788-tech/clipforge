import { access, lstat, mkdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { availableParallelism } from "node:os";
import { id, now } from "./database.js";
import ffmpegStatic from "ffmpeg-static";
import { captionPpm, captionSegmentsForClip } from "./caption-renderer.js";

const formats = {
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1280, height: 720 },
};
const captionColors = { lime: "d3e964", pink: "ff8fbe", sky: "8be1ff" };

function escapeDrawtext(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/%/g, "\\%");
}

async function safeUnlinkExportFile(exportDir, candidate) {
  const exportRoot = await realpath(exportDir).catch(() => null);
  if (!exportRoot) return;
  const lexicalCandidate = resolve(candidate);
  const relativeLexical = relative(resolve(exportDir), lexicalCandidate);
  if (relativeLexical.startsWith("..") || relativeLexical.startsWith("/") || relativeLexical.startsWith("\\\\")) return;
  const candidateInfo = await lstat(lexicalCandidate).catch(() => null);
  if (!candidateInfo || candidateInfo.isSymbolicLink() || !candidateInfo.isFile()) return;
  const resolvedCandidate = await realpath(lexicalCandidate).catch(() => null);
  if (!resolvedCandidate) return;
  const relativeResolved = relative(exportRoot, resolvedCandidate);
  if (relativeResolved.startsWith("..") || relativeResolved.startsWith("/") || relativeResolved.startsWith("\\\\")) return;
  await unlink(resolvedCandidate).catch(() => {});
}

function run(command, args, { onProgress, activeProcesses } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    activeProcesses?.add(child);
    const cleanup = () => activeProcesses?.delete(child);
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      cleanup();
      reject(new Error("FFmpeg render timed out."));
    }, 15 * 60 * 1000);
    let stderr = "";
    let progressBuffer = "";
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
      if (!onProgress) return;
      progressBuffer += text;
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || "";
      for (const line of lines) {
        const match = line.match(/^out_time_us=(\d+)/);
        if (match) void onProgress(Number(match[1]) / 1000000);
      }
    });
    child.on("error", (error) => { clearTimeout(timeout); cleanup(); reject(error); });
    child.on("close", (code) => { clearTimeout(timeout); cleanup(); code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-1000)}`)); });
  });
}

async function sourcePath(storageDir, sourceUrl) {
  if (typeof sourceUrl !== "string" || !sourceUrl.startsWith("/storage/uploads/")) throw new Error("Source video must be an uploaded file.");
  const uploadsDir = resolve(storageDir, "uploads");
  const file = resolve(storageDir, sourceUrl.slice("/storage/".length));
  const relativeSource = relative(uploadsDir, file);
  if (relativeSource.startsWith("..") || relativeSource.startsWith("/") || relativeSource.startsWith("\\\\")) throw new Error("Invalid source video path.");
  return { file, uploadsDir };
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
const captionGlyphs = {
A:["01110","10001","10001","11111","10001","10001","10001"],B:["11110","10001","10001","11110","10001","10001","11110"],C:["01110","10001","10000","10000","10000","10001","01110"],D:["11110","10001","10001","10001","10001","10001","11110"],E:["11111","10000","10000","11110","10000","10000","11111"],F:["11111","10000","10000","11110","10000","10000","10000"],G:["01110","10001","10000","10111","10001","10001","01110"],H:["10001","10001","10001","11111","10001","10001","10001"],I:["11111","00100","00100","00100","00100","00100","11111"],J:["00111","00010","00010","00010","10010","10010","01100"],K:["10001","10010","10100","11000","10100","10010","10001"],L:["10000","10000","10000","10000","10000","10000","11111"],M:["10001","11011","10101","10101","10001","10001","10001"],N:["10001","11001","10101","10011","10001","10001","10001"],O:["01110","10001","10001","10001","10001","10001","01110"],P:["11110","10001","10001","11110","10000","10000","10000"],Q:["01110","10001","10001","10001","10101","10010","01101"],R:["11110","10001","10001","11110","10100","10010","10001"],S:["01111","10000","10000","01110","00001","00001","11110"],T:["11111","00100","00100","00100","00100","00100","00100"],U:["10001","10001","10001","10001","10001","10001","01110"],V:["10001","10001","10001","10001","10001","01010","00100"],W:["10001","10001","10001","10101","10101","11011","10001"],X:["10001","10001","01010","00100","01010","10001","10001"],Y:["10001","10001","01010","00100","00100","00100","00100"],Z:["11111","00001","00010","00100","01000","10000","11111"]," ":["00000","00000","00000","00000","00000","00000","00000"],".":["00000","00000","00000","00000","00000","00110","00110"],"?":["01110","10001","00001","00010","00100","00000","00100"],":":["00000","00110","00110","00000","00110","00110","00000"],"-":["00000","00000","00000","11111","00000","00000","00000"],"!":["00100","00100","00100","00100","00100","00000","00100"]
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

function videoFilter(clip, captions = [], subtitlePath = null) {
  const { width, height } = formats[clip.format] || formats["9:16"];
  const filters=[`[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[base]`,`[1:v]format=rgb24,colorkey=0x121212:0.08:0.02,format=rgba[wm]`,`[base][wm]overlay=W-w-24:H-h-24:format=auto[v0]`];
  let previous="v0";
  captions.forEach((c,i)=>{const input=i+2,next=`v${i+1}`;filters.push(`[${input}:v]format=rgb24,colorkey=0x0a0a0a:0.08:0.02,format=rgba[c${i}]`,`[${previous}][c${i}]overlay=(W-w)/2:H-h-90:enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})':format=auto[${next}]`);previous=next;});
  if (subtitlePath) {
    const escaped = String(subtitlePath).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/\x27/g, "\\x27");
    const color = clip.style?.color === "pink" ? "&H008FBEFF" : clip.style?.color === "sky" ? "&H00FFE18B" : "&H0064E9D3";
    filters.push(`[${previous}]subtitles=\\x27${escaped}\\x27:force_style=\\x27Alignment=2,MarginV=70,FontSize=20,PrimaryColour=${color},OutlineColour=&H00000000,Outline=3,Shadow=0\\x27[v]`);
  } else filters.push(`[${previous}]null[v]`);
  return filters.join(";");
}

export class ClipQueue {
  constructor(db, storageDir, { ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg" } = {}) { this.db = db; this.storageDir = storageDir; this.ffmpegPath = ffmpegPath; this.running = false; this.workerPromise = null; this.shuttingDown = false; this.activeProcesses = new Set(); this.subtitleSupport = null; const configuredConcurrency = Number(process.env.CLIPFORGE_RENDER_CONCURRENCY);
    const cpuConcurrency = Math.max(1, Math.min(2, Number(availableParallelism()) || 1));
    this.concurrency = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
      ? Math.max(1, Math.min(2, Math.floor(configuredConcurrency)))
      : cpuConcurrency; }
  async checkSubtitleSupport() {
    return new Promise((resolve) => {
      const child = spawn(this.ffmpegPath, ["-hide_banner", "-filters"], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      let settled = false;
      const finish = (supported) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.subtitleSupport = supported;
        resolve(supported);
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        console.warn("ClipForge FFmpeg capability check timed out.");
        finish(false);
      }, 10_000);
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.on("error", (error) => { console.warn("ClipForge FFmpeg capability check failed:", error.message); finish(false); });
      child.on("close", () => {
        const supported = /\bsubtitles\b/.test(output);
        console.log(`ClipForge FFmpeg subtitles filter: ${supported ? "available" : "unavailable"}`);
        finish(supported);
      });
    });
  }

  async recover() {
    await this.checkSubtitleSupport();
    await this.db.transaction((d) => {
      for (const job of d.jobs) {
        if (job.status === "processing") {
          job.status = "queued";
          job.progress = 0;
          delete job.startedAt;
          delete job.error;
          const clip = d.clips.find((item) => item.id === job.clipId);
          if (clip && clip.status === "processing") {
            clip.status = "queued";
            clip.updatedAt = now();
          }
        }
      }
    });
    void this.work().catch((error) => console.error("ClipForge queue worker crashed:", error));
  }
  async enqueue(clip) { if (this.shuttingDown) throw new Error("Clip queue is shutting down."); const job = { id: id("job"), clipId: clip.id, status: "queued", progress: 0, createdAt: now() }; await this.db.transaction((d) => d.jobs.push(job)); void this.work().catch((error) => console.error("ClipForge queue worker crashed:", error)); return job; }
  async render(clip) {
    const { file: source, uploadsDir } = await sourcePath(this.storageDir, clip.sourceUrl);
    const sourceInfo = await lstat(source).catch(() => null);
    if (!sourceInfo?.isFile() || sourceInfo.isSymbolicLink()) throw new Error("Invalid source video path.");
    await access(source);
    const resolvedSource = await realpath(source);
    const resolvedUploadsDir = await realpath(uploadsDir);
    const relativeResolved = relative(resolvedUploadsDir, resolvedSource);
    if (relativeResolved.startsWith("..") || relativeResolved.startsWith("/") || relativeResolved.startsWith("\\\\")) throw new Error("Invalid source video path.");
    const exportDir = join(this.storageDir, "exports");
    await mkdir(exportDir, { recursive: true });
    const exportDirInfo = await lstat(exportDir).catch(() => null);
    if (!exportDirInfo?.isDirectory() || exportDirInfo.isSymbolicLink()) throw new Error("Invalid export output path.");
    const resolvedStorageDir = await realpath(this.storageDir).catch(() => null);
    const resolvedExportDir = await realpath(exportDir).catch(() => null);
    if (!resolvedStorageDir || !resolvedExportDir) throw new Error("Invalid export output path.");
    const relativeExportDir = relative(resolvedStorageDir, resolvedExportDir);
    if (relativeExportDir.startsWith("..") || relativeExportDir.startsWith("/") || relativeExportDir.startsWith("\\\\")) throw new Error("Invalid export output path.");
    const filename = `${clip.id}.mp4`;
    const output = join(exportDir, filename);
    const outputInfo = await lstat(output).catch(() => null);
    if (outputInfo?.isSymbolicLink()) throw new Error("Invalid export output path.");
    const renderId = randomUUID();
    const tempOutput = join(exportDir, `.${filename}.${renderId}.tmp.mp4`);
    const duration = clip.end - clip.start;
    const watermarkPath = join(exportDir, `.${clip.id}.${renderId}.watermark.ppm`);
    const captions = captionSegmentsForClip(clip);
    const captionSrtPath = join(exportDir, `.${clip.id}.${renderId}.captions.srt`);
    const captionPaths = captions.map((_,i)=>join(exportDir,`.${clip.id}.${renderId}.caption-${i}.ppm`));
    try {
      await writeFile(watermarkPath, watermarkPpm(), { encoding: "utf8", flag: "wx" });
      if (captions.length && this.subtitleSupport) {
        const stamp = (seconds) => { const total = Math.max(0, Number(seconds) || 0); const ms = Math.round((total % 1) * 1000); const whole = Math.floor(total); const h = Math.floor(whole / 3600); const m = Math.floor((whole % 3600) / 60); const sec = whole % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`; };
        const srt = captions.map((caption, index) => `${index + 1}\n${stamp(caption.start)} --> ${stamp(caption.end)}\n${caption.text}\n`).join("\n");
        await writeFile(captionSrtPath, srt, { encoding: "utf8", flag: "wx" });
      }
      for(let i=0;i<captions.length;i++) await writeFile(captionPaths[i],captionPpm(captions[i].text,clip.style?.color==="pink"?"ff8fbe":clip.style?.color==="sky"?"8be1ff":"d3e964"),{ encoding: "utf8", flag: "wx" });
      const args=["-y","-ss",String(clip.start),"-i",resolvedSource,"-loop","1","-i",watermarkPath];
      for(const p of captionPaths) args.push("-loop","1","-i",p);
      args.push("-t",String(duration),"-filter_complex",videoFilter(clip,captions,this.subtitleSupport && captions.length ? captionSrtPath : null),"-map","[v]","-map","0:a?","-sn","-c:v","libx264","-preset","veryfast","-crf","23","-pix_fmt","yuv420p","-threads","0","-c:a","aac","-shortest","-movflags","+faststart","-avoid_negative_ts","make_zero","-progress","pipe:2","-nostats",tempOutput);
      let lastProgress = -1;
      let lastPersistedAt = 0;
      await run(this.ffmpegPath,args,{
        activeProcesses: this.activeProcesses,
        onProgress: async (seconds) => {
          const progress = Math.max(35, Math.min(99, Math.round((seconds / Math.max(duration, 0.1)) * 64) + 35));
          const current = Date.now();
          if (progress === lastProgress || (current - lastPersistedAt < 2000 && progress < 99)) return;
          lastProgress = progress;
          lastPersistedAt = current;
          await this.db.transaction((d) => {
            const j = d.jobs.find((item) => item.id === clip.jobId);
            const c = d.clips.find((item) => item.id === clip.id);
            if (j) j.progress = progress;
            if (c) c.renderProgress = progress;
          });
        },
      });
      await rename(tempOutput, output);
      const renderedInfo = await lstat(output).catch(() => null);
      if (!renderedInfo?.isFile() || renderedInfo.isSymbolicLink() || renderedInfo.size <= 0) {
        await safeUnlinkExportFile(exportDir, output);
        throw new Error("FFmpeg completed but the rendered clip was not written correctly.");
      }
      try {
        await run(this.ffmpegPath, ["-v", "error", "-i", output, "-map", "0:v:0", "-f", "null", "-"], {
          activeProcesses: this.activeProcesses,
        });
      } catch (error) {
        await safeUnlinkExportFile(exportDir, output);
        throw new Error(`Rendered clip failed media integrity validation: ${error.message}`);
      }
    } catch (error) {
      await safeUnlinkExportFile(exportDir, tempOutput);
      throw error;
    } finally {
      await safeUnlinkExportFile(exportDir, watermarkPath);
      for(const p of captionPaths) await safeUnlinkExportFile(exportDir, p);
      await safeUnlinkExportFile(exportDir, captionSrtPath);
    }
    return { filename, output };
  }
  async work() {
    if (this.running || this.shuttingDown) return;
    this.running = true;
    const worker = async () => {
      while (true) {
        if (this.shuttingDown) break;
        const job = await this.db.transaction((d) => {
          const next = d.jobs.find((j) => j.status === "queued");
          if (next) {
            next.status = "processing";
            next.progress = 15;
            next.startedAt = now();
          }
          return next && { ...next };
        });
        if (!job) break;
        try {
          const clip = await this.db.read((d) => d.clips.find((c) => c.id === job.clipId));
          
          if (!clip) throw new Error("Clip not found.");
          await this.db.transaction((d) => { const j = d.jobs.find((x) => x.id === job.id); const c = d.clips.find((x) => x.id === job.clipId); if (j) j.progress = 35; if (c) c.renderProgress = 35; });
          console.log(`ClipForge render started: ${job.id} clip=${clip.id} ffmpeg=${this.ffmpegPath}`);
          const { filename } = await this.render({ ...clip, jobId: job.id });
          await this.db.transaction((d) => { const j = d.jobs.find((x) => x.id === job.id); const c = d.clips.find((x) => x.id === job.clipId); if (j) Object.assign(j, { status: "completed", progress: 100, completedAt: now() }); if (c) Object.assign(c, { status: "ready", renderProgress: 100, downloadUrl: `/storage/exports/${filename}`, updatedAt: now() }); });
        } catch (error) {
          console.error(`ClipForge render failed: job=${job.id} clip=${job.clipId} error=${error.message}`);
          await this.db.transaction((d) => { const j = d.jobs.find((x) => x.id === job.id); const c = d.clips.find((x) => x.id === job.clipId); if (j) Object.assign(j, { status: "failed", error: error.message, completedAt: now() }); if (c) Object.assign(c, { status: "failed", updatedAt: now() }); });
        }
      }
    };
    this.workerPromise = Promise.all(Array.from({ length: this.concurrency }, () => worker()));
    try {
      await this.workerPromise;
    } finally {
      this.workerPromise = null;
      this.running = false;
    }
  }
  async shutdown() {
    this.shuttingDown = true;
    for (const child of this.activeProcesses) child.kill("SIGTERM");
    const worker = this.workerPromise;
    if (worker) await worker.catch(() => {});
    for (const child of this.activeProcesses) child.kill("SIGKILL");
    this.activeProcesses.clear();
  }
  async removeExport(downloadUrl) {
    if (!downloadUrl?.startsWith("/storage/exports/")) return;
    const exportDir = resolve(this.storageDir, "exports");
    const exportDirInfo = await lstat(exportDir).catch(() => null);
    if (!exportDirInfo?.isDirectory() || exportDirInfo.isSymbolicLink()) return;
    const candidate = resolve(this.storageDir, downloadUrl.slice("/storage/".length));
    const relativeExport = relative(exportDir, candidate);
    if (relativeExport.startsWith("..") || relativeExport.startsWith("/") || relativeExport.startsWith("\\")) return;
    const candidateInfo = await lstat(candidate).catch(() => null);
    if (!candidateInfo || candidateInfo.isSymbolicLink() || !candidateInfo.isFile()) return;
    const resolvedCandidate = await realpath(candidate).catch(() => null);
    const resolvedExportDir = await realpath(exportDir).catch(() => null);
    if (!resolvedCandidate || !resolvedExportDir) return;
    const relativeResolved = relative(resolvedExportDir, resolvedCandidate);
    if (relativeResolved.startsWith("..") || relativeResolved.startsWith("/") || relativeResolved.startsWith("\\")) return;
    await unlink(resolvedCandidate).catch(() => {});
  }}
