import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonDatabase } from "../server/database.js";
import { ClipQueue } from "../server/queue.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-queue-"));
  const storageDir = join(dir, "storage");
  await mkdir(join(storageDir, "exports"), { recursive: true });
  await mkdir(join(storageDir, "uploads"), { recursive: true });
  const db = new JsonDatabase(join(dir, "db.json"));
  await db.load();
  return { dir, storageDir, db };
}

test("queue recovery requeues stale processing jobs and restarts them", async () => {
  const { storageDir, db } = await setup();
  await db.transaction((d) => {
    d.jobs.push({
      id: "job-stale",
      clipId: "missing-clip",
      status: "processing",
      progress: 62,
      startedAt: new Date().toISOString(),
      error: "stale"
    });
  });
  const queue = new ClipQueue(db, storageDir);
  queue.checkSubtitleSupport = async () => true;
  await queue.recover();

  let state;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    state = await db.read((d) => ({ job: d.jobs[0], running: queue.running }));
    if (state.job.status === "failed" && !state.running) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(state.job.status, "failed");
  assert.equal(state.job.progress, 15);
  assert.equal(state.job.error, "Clip not found.");
  assert.equal(state.running, false);
  await db.close();
});

test("queue failure marks both the job and clip failed", async () => {
  const { storageDir, db } = await setup();
  await db.transaction((d) => {
    d.clips.push({
      id: "clip-failure",
      status: "queued",
      sourceUrl: "/storage/uploads/missing.mp4",
      start: 0,
      end: 2,
      format: "9:16"
    });
    d.jobs.push({
      id: "job-failure",
      clipId: "clip-failure",
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString()
    });
  });
  const queue = new ClipQueue(db, storageDir, { ffmpegPath: process.execPath });
  await queue.work();
  const state = await db.read((d) => ({ job: d.jobs[0], clip: d.clips[0] }));

  assert.equal(state.job.status, "failed");
  assert.match(state.job.error, /ENOENT|no such file|missing|Invalid source video path/i);
  assert.equal(state.clip.status, "failed");
  assert.ok(state.job.completedAt);
  await db.close();
});

test("removeExport deletes real export files but refuses traversal and symlink targets", async () => {
  const { storageDir, db } = await setup();
  const queue = new ClipQueue(db, storageDir);
  const exportDir = join(storageDir, "exports");
  const outside = join(storageDir, "outside.mp4");

  await writeFile(outside, "protected");
  await writeFile(join(exportDir, "clip.mp4"), "export");
  await symlink(outside, join(exportDir, "link.mp4"));

  await queue.removeExport("/storage/exports/clip.mp4");
  await assert.rejects(readFile(join(exportDir, "clip.mp4")), /ENOENT/);

  await queue.removeExport("/storage/exports/../outside.mp4");
  assert.equal(await readFile(outside, "utf8"), "protected");

  await queue.removeExport("/storage/exports/link.mp4");
  assert.equal(await readFile(outside, "utf8"), "protected");
  await db.close();
});
