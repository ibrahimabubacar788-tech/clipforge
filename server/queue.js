import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { id, now } from "./database.js";
export class ClipQueue {
  constructor(db, storageDir) { this.db = db; this.storageDir = storageDir; this.running = false; }
  async enqueue(clip) { const job = { id: id("job"), clipId: clip.id, status: "queued", progress: 0, createdAt: now() }; await this.db.transaction((d) => d.jobs.push(job)); this.work(); return job; }
  async work() {
    if (this.running) return; this.running = true;
    while (true) {
      const job = await this.db.transaction((d) => { const next = d.jobs.find((j) => j.status === "queued"); if (next) { next.status = "processing"; next.progress = 15; next.startedAt = now(); } return next && { ...next }; });
      if (!job) break;
      try {
        await new Promise((resolve) => setTimeout(resolve, 80));
        await this.db.transaction((d) => { const j = d.jobs.find((x) => x.id === job.id); if (j) j.progress = 70; });
        const clip = await this.db.read((d) => d.clips.find((c) => c.id === job.clipId));
        await mkdir(join(this.storageDir, "exports"), { recursive: true });
        const filename = `${clip.id}.json`;
        await writeFile(join(this.storageDir, "exports", filename), JSON.stringify({ clipId: clip.id, render: "ClipForge pipeline placeholder", sourceVideoId: clip.videoId, range: [clip.start, clip.end], captions: clip.captions, format: clip.format }, null, 2));
        await this.db.transaction((d) => { const j = d.jobs.find((x) => x.id === job.id); const c = d.clips.find((x) => x.id === job.clipId); if (j) Object.assign(j, { status: "completed", progress: 100, completedAt: now() }); if (c) Object.assign(c, { status: "ready", downloadUrl: `/storage/exports/${filename}`, updatedAt: now() }); });
      } catch (error) { await this.db.transaction((d) => { const j = d.jobs.find((x) => x.id === job.id); if (j) Object.assign(j, { status: "failed", error: error.message }); }); }
    }
    this.running = false;
  }
}
