import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const { rankHighlights } = await import("../server/highlights.js");
const { normalizeTranscriptionResponse } = await import("../server/stt.js");

process.env.DATABASE_URL = "";
process.env.DATABASE_SSL = "false";

const { createApp } = await import("../server/app.js");

async function startTestApp() {
  const root = await mkdtemp(join(tmpdir(), "clipforge-root-"));
  const storageDir = await mkdtemp(join(tmpdir(), "clipforge-storage-"));
  const dbFile = join(root, "clipforge.json");
  const app = createApp({ root: process.cwd(), dbFile, storageDir });
  await new Promise((resolve) => app.listen(0, resolve));
  const address = app.address();
  return {
    app,
    root,
    storageDir,
    base: `http://127.0.0.1:${address.port}`,
  };
}

async function stopTestApp(ctx) {
  await new Promise((resolve) => ctx.app.close(resolve));
  await ctx.app.database.close();
  await rm(ctx.root, { recursive: true, force: true });
  await rm(ctx.storageDir, { recursive: true, force: true });
}

async function createTestVideo(file) {
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      "-y",
      "-f", "lavfi",
      "-i", "color=c=black:s=320x240:r=25",
      "-f", "lavfi",
      "-i", "sine=frequency=880:sample_rate=44100",
      "-t", "20",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-shortest",
      file,
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg test fixture failed (${code}): ${stderr.slice(-2000)}`)));
  });
}

test("ready endpoint reports a healthy ClipForge service", async () => {
  const ctx = await startTestApp();
  try {
    const response = await fetch(`${ctx.base}/api/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "clipforge",
      mediaStorage: { mode: "local", persistent: false },
    });
  } finally {
    await stopTestApp(ctx);
  }
});

test("authentication and project isolation work end to end", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "creator@example.com", password: "strong-pass-123" }),
    });
    assert.equal(register.status, 201);
    const auth = await register.json();
    assert.ok(auth.token);
    assert.ok(auth.user.id);

    const projects = await fetch(`${ctx.base}/api/projects`, {
      headers: { authorization: `Bearer ${auth.token}` },
    });
    assert.equal(projects.status, 200);
    assert.deepEqual((await projects.json()).projects, []);

    const created = await fetch(`${ctx.base}/api/projects`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Smoke Test Project" }),
    });
    assert.equal(created.status, 201);
    const project = (await created.json()).project;
    assert.equal(project.name, "Smoke Test Project");
    assert.equal(project.userId, auth.user.id);

    const tooLong = await fetch(`${ctx.base}/api/projects`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "x".repeat(121) }),
    });
    assert.equal(tooLong.status, 422);

    const blockedDelete = await fetch(`${ctx.base}/api/projects/${project.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${auth.token}` },
    });
    assert.equal(blockedDelete.status, 409);

    const unauthorized = await fetch(`${ctx.base}/api/projects`);
    assert.equal(unauthorized.status, 401);
  } finally {
    await stopTestApp(ctx);
  }
});

test("upload rejects non-video payloads before writing media", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "uploader@example.com", password: "strong-pass-123" }),
    });
    const auth = await register.json();

    const upload = await fetch(`${ctx.base}/api/uploads`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "text/plain",
        "x-filename": "not-a-video.txt",
      },
      body: "not a video",
    });
    assert.equal(upload.status, 415);
  } finally {
    await stopTestApp(ctx);
  }
});

test("upload retry IDs reuse an already completed upload", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "retry@example.com", password: "strong-pass-123" }),
    });
    assert.equal(register.status, 201);
    const auth = await register.json();
    const headers = {
      authorization: `Bearer ${auth.token}`,
      "content-type": "video/mp4",
      "content-length": "11",
      "x-filename": "retry.mp4",
      "x-upload-id": "retry-check-123",
    };
    const first = await fetch(`${ctx.base}/api/uploads`, {
      method: "POST", headers, body: Buffer.from("test-video!"),
    });
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    const second = await fetch(`${ctx.base}/api/uploads`, {
      method: "POST", headers, body: Buffer.from("test-video!"),
    });
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.reused, true);
    assert.equal(secondBody.url, firstBody.url);
  } finally {
    await stopTestApp(ctx);
  }
});



test("video streaming supports byte ranges and rejects invalid ranges", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "stream@example.com", password: "strong-pass-123" }),
    });
    assert.equal(register.status, 201);
    const auth = await register.json();

    const upload = await fetch(`${ctx.base}/api/uploads`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "video/mp4",
        "content-length": "11",
        "x-filename": "stream.mp4",
      },
      body: Buffer.from("test-video!"),
    });
    assert.equal(upload.status, 201);
    const sourceUrl = (await upload.json()).url;

    const projectResponse = await fetch(`${ctx.base}/api/projects`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Stream Test" }),
    });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json()).project;

    const videoResponse = await fetch(`${ctx.base}/api/videos`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: project.id, name: "Stream fixture", duration: 20, sourceUrl }),
    });
    assert.equal(videoResponse.status, 201);
    const video = (await videoResponse.json()).video;

    const ranged = await fetch(`${ctx.base}/api/videos/${video.id}/stream`, {
      headers: { authorization: `Bearer ${auth.token}`, range: "bytes=0-4" },
    });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers.get("content-range"), "bytes 0-4/11");
    assert.equal(ranged.headers.get("content-length"), "5");
    assert.equal(Buffer.from(await ranged.arrayBuffer()).toString(), "test-");

    const openEnded = await fetch(`${ctx.base}/api/videos/${video.id}/stream`, {
      headers: { authorization: `Bearer ${auth.token}`, range: "bytes=6-" },
    });
    assert.equal(openEnded.status, 206);
    assert.equal(openEnded.headers.get("content-range"), "bytes 6-10/11");
    assert.equal(Buffer.from(await openEnded.arrayBuffer()).toString(), "ideo!");

    const clamped = await fetch(`${ctx.base}/api/videos/${video.id}/stream`, {
      headers: { authorization: `Bearer ${auth.token}`, range: "bytes=6-99" },
    });
    assert.equal(clamped.status, 206);
    assert.equal(clamped.headers.get("content-range"), "bytes 6-10/11");
    assert.equal(Buffer.from(await clamped.arrayBuffer()).toString(), "ideo!");

    const multiRange = await fetch(`${ctx.base}/api/videos/${video.id}/stream`, {
      headers: { authorization: `Bearer ${auth.token}`, range: "bytes=0-2,6-8" },
    });
    assert.equal(multiRange.status, 416);

    const invalid = await fetch(`${ctx.base}/api/videos/${video.id}/stream`, {
      headers: { authorization: `Bearer ${auth.token}`, range: "bytes=50-60" },
    });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get("content-range"), "bytes */11");
  } finally {
    await stopTestApp(ctx);
  }
});
test("highlight engine ranks strong moments and caps output at 40", () => {
  const segments = Array.from({ length: 80 }, (_, index) => ({
    start: index * 20,
    end: index * 20 + 20,
    text: index % 3 === 0
      ? "Here's the thing: this is the biggest mistake, and the result changes everything!"
      : "This is a useful discussion about what happened next and why it matters.",
    speaker: index % 2 ? "A" : "B",
  }));
  const clips = rankHighlights(segments, { limit: 40 });
  assert.ok(clips.length > 0 && clips.length <= 40);
  assert.equal(clips[0].rank, 1);
  assert.ok(clips.every((clip) => clip.duration >= 15 && clip.duration <= 75));
  assert.ok(clips.every((clip, index) => clip.rank === index + 1));
});

test("transcription normalization keeps valid diarized segments and drops invalid ones", () => {
  const result = normalizeTranscriptionResponse({
    segments: [
      { start: 0, end: 4.5, speaker: "A", text: " Hello world " },
      { start: 5, end: 4, speaker: "B", text: "invalid" },
      { start: "x", end: 9, text: "invalid" },
      { start: 10, end: 14, text: " Second segment " },
    ],
  });
  assert.deepEqual(result, [
    { start: 0, end: 4.5, speaker: "A", text: "Hello world" },
    { start: 10, end: 14, text: "Second segment" },
  ]);
});



test("failed clip retry rejects an active queued render job", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "retry-guard@example.com", password: "strong-pass-123" }),
    });
    assert.equal(register.status, 201);
    const auth = await register.json();

    const projectResponse = await fetch(`${ctx.base}/api/projects`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Retry Guard Project" }),
    });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json()).project;

    const videoResponse = await fetch(`${ctx.base}/api/videos`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: project.id, name: "Retry Guard Video", duration: 20 }),
    });
    assert.equal(videoResponse.status, 201);
    const video = (await videoResponse.json()).video;

    const clip = {
      id: "clip_retry_guard",
      userId: auth.user.id,
      videoId: video.id,
      projectId: project.id,
      sourceUrl: null,
      title: "Retry guard clip",
      start: 0,
      end: 20,
      format: "9:16",
      captions: false,
      captionSegments: [],
      style: { color: "lime", weight: "bold" },
      status: "failed",
      error: "Previous render failed.",
      createdAt: new Date().toISOString(),
    };
    const job = {
      id: "job_retry_guard",
      clipId: clip.id,
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    await ctx.app.database.transaction((d) => {
      d.clips.push(clip);
      d.jobs.push(job);
    });

    const retry = await fetch(`${ctx.base}/api/clips/${clip.id}/retry`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
    });
    assert.equal(retry.status, 409);

    const state = await ctx.app.database.read((d) => ({
      clip: d.clips.find((item) => item.id === clip.id),
      job: d.jobs.find((item) => item.id === job.id),
    }));
    assert.equal(state.clip.status, "failed");
    assert.equal(state.clip.error, "Previous render failed.");
    assert.equal(state.job.status, "queued");
  } finally {
    await stopTestApp(ctx);
  }
});


test("projects and clips can be renamed with validation", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "rename-feature@example.com", password: "strong-pass-123" }),
    });
    assert.equal(register.status, 201);
    const auth = await register.json();

    const projectResponse = await fetch(`${ctx.base}/api/projects`, {
      method: "POST",
      headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Original Project" }),
    });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json()).project;

    const renameProject = await fetch(`${ctx.base}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed Project" }),
    });
    assert.equal(renameProject.status, 200);
    assert.equal((await renameProject.json()).project.name, "Renamed Project");

    const emptyProject = await fetch(`${ctx.base}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    assert.equal(emptyProject.status, 422);

    const videoResponse = await fetch(`${ctx.base}/api/videos`, {
      method: "POST",
      headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id, name: "Rename Feature Video", duration: 20 }),
    });
    assert.equal(videoResponse.status, 201);
    const video = (await videoResponse.json()).video;

    const clip = {
      id: "clip_rename_feature",
      userId: auth.user.id,
      videoId: video.id,
      projectId: project.id,
      sourceUrl: null,
      title: "Original Clip",
      start: 0,
      end: 10,
      format: "9:16",
      captions: false,
      captionSegments: [],
      style: { color: "lime", weight: "bold" },
      status: "ready",
      createdAt: new Date().toISOString(),
    };
    await ctx.app.database.transaction((d) => d.clips.push(clip));

    const renameClip = await fetch(`${ctx.base}/api/clips/${clip.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
      body: JSON.stringify({ title: "Renamed Clip" }),
    });
    assert.equal(renameClip.status, 200);
    assert.equal((await renameClip.json()).clip.title, "Renamed Clip");

    const emptyClip = await fetch(`${ctx.base}/api/clips/${clip.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    assert.equal(emptyClip.status, 422);
  } finally {
    await stopTestApp(ctx);
  }
});

test("project and video deletion reject queued render jobs", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "delete-guard@example.com", password: "strong-pass-123" }),
    });
    assert.equal(register.status, 201);
    const auth = await register.json();

    const projectResponse = await fetch(`${ctx.base}/api/projects`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Delete Guard Project" }),
    });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json()).project;

    const videoResponse = await fetch(`${ctx.base}/api/videos`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: project.id, name: "Delete Guard Video", duration: 20 }),
    });
    assert.equal(videoResponse.status, 201);
    const video = (await videoResponse.json()).video;

    const clip = {
      id: "clip_delete_guard",
      userId: auth.user.id,
      videoId: video.id,
      projectId: project.id,
      sourceUrl: null,
      title: "Queued guard clip",
      start: 0,
      end: 20,
      format: "9:16",
      captions: false,
      captionSegments: [],
      style: { color: "lime", weight: "bold" },
      status: "queued",
      createdAt: new Date().toISOString(),
    };
    await ctx.app.database.transaction((d) => {
      d.clips.push(clip);
      d.jobs.push({
        id: "job_delete_guard",
        clipId: clip.id,
        status: "queued",
        progress: 0,
        createdAt: new Date().toISOString(),
      });
    });

    const deleteVideo = await fetch(`${ctx.base}/api/videos/${video.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${auth.token}` },
    });
    assert.equal(deleteVideo.status, 409);

    const deleteProject = await fetch(`${ctx.base}/api/projects/${project.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${auth.token}` },
    });
    assert.equal(deleteProject.status, 409);

    const remaining = await ctx.app.database.read((d) => ({
      project: d.projects.some((item) => item.id === project.id),
      video: d.videos.some((item) => item.id === video.id),
      clip: d.clips.some((item) => item.id === clip.id),
      job: d.jobs.some((item) => item.id === "job_delete_guard"),
    }));
    assert.deepEqual(remaining, { project: true, video: true, clip: true, job: true });
  } finally {
    await stopTestApp(ctx);
  }
});



test("clip deletion rejects an active queued render job", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "clip-delete-guard@example.com", password: "strong-pass-123" }),
    });
    assert.equal(register.status, 201);
    const auth = await register.json();

    const projectResponse = await fetch(`${ctx.base}/api/projects`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Clip Delete Guard Project" }),
    });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json()).project;

    const videoResponse = await fetch(`${ctx.base}/api/videos`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: project.id, name: "Clip Delete Guard Video", duration: 20 }),
    });
    assert.equal(videoResponse.status, 201);
    const video = (await videoResponse.json()).video;

    const clip = {
      id: "clip_delete_active_guard",
      userId: auth.user.id,
      videoId: video.id,
      projectId: project.id,
      sourceUrl: null,
      title: "Active queued clip",
      start: 0,
      end: 20,
      format: "9:16",
      captions: false,
      captionSegments: [],
      style: { color: "lime", weight: "bold" },
      status: "queued",
      createdAt: new Date().toISOString(),
    };
    await ctx.app.database.transaction((d) => {
      d.clips.push(clip);
      d.jobs.push({
        id: "job_clip_delete_active_guard",
        clipId: clip.id,
        status: "queued",
        progress: 0,
        createdAt: new Date().toISOString(),
      });
    });

    const response = await fetch(`${ctx.base}/api/clips/${clip.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${auth.token}` },
    });
    assert.equal(response.status, 409);

    const state = await ctx.app.database.read((d) => ({
      clip: d.clips.find((item) => item.id === clip.id),
      job: d.jobs.find((item) => item.id === "job_clip_delete_active_guard"),
    }));
    assert.equal(state.clip.status, "queued");
    assert.equal(state.job.status, "queued");
  } finally {
    await stopTestApp(ctx);
  }
});

test("clip deletion rejects an active processing render job", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "clip-processing-delete@example.com", password: "strong-pass-123" }),
    });
    assert.equal(register.status, 201);
    const auth = await register.json();

    const projectResponse = await fetch(`${ctx.base}/api/projects`, {
      method: "POST",
      headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Processing Delete Guard Project" }),
    });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json()).project;

    const videoResponse = await fetch(`${ctx.base}/api/videos`, {
      method: "POST",
      headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id, name: "Processing Delete Guard Video", duration: 20 }),
    });
    assert.equal(videoResponse.status, 201);
    const video = (await videoResponse.json()).video;

    const clip = {
      id: "clip_processing_delete_guard",
      userId: auth.user.id,
      videoId: video.id,
      projectId: project.id,
      sourceUrl: null,
      title: "Processing guard clip",
      start: 0,
      end: 20,
      format: "9:16",
      captions: false,
      captionSegments: [],
      style: { color: "lime", weight: "bold" },
      status: "processing",
      createdAt: new Date().toISOString(),
    };

    await ctx.app.database.transaction((d) => {
      d.clips.push(clip);
      d.jobs.push({
        id: "job_processing_delete_guard",
        clipId: clip.id,
        status: "processing",
        progress: 35,
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    });

    const response = await fetch(`${ctx.base}/api/clips/${clip.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${auth.token}` },
    });
    assert.equal(response.status, 409);

    const state = await ctx.app.database.read((d) => ({
      clip: d.clips.find((item) => item.id === clip.id),
      job: d.jobs.find((item) => item.id === "job_processing_delete_guard"),
    }));
    assert.equal(state.clip.status, "processing");
    assert.equal(state.job.status, "processing");
  } finally {
    await stopTestApp(ctx);
  }
});

test("upload, queue, FFmpeg render, and clip download work end to end", async () => {
  const ctx = await startTestApp();
  const fixtureDir = await mkdtemp(join(tmpdir(), "clipforge-fixture-"));
  const fixture = join(fixtureDir, "source.mp4");
  try {
    await createTestVideo(fixture);
    const sourceBuffer = await import("node:fs/promises").then(({ readFile }) => readFile(fixture));

    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "render@example.com", password: "strong-pass-123" }),
    });
    assert.equal(register.status, 201);
    const auth = await register.json();

    const upload = await fetch(`${ctx.base}/api/uploads`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "video/mp4",
        "content-length": String(sourceBuffer.length),
        "x-filename": "source.mp4",
      },
      body: sourceBuffer,
    });
    assert.equal(upload.status, 201);
    const sourceUrl = (await upload.json()).url;

    const projectResponse = await fetch(`${ctx.base}/api/projects`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Render Test" }),
    });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json()).project;

    const videoResponse = await fetch(`${ctx.base}/api/videos`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: project.id,
        name: "Render fixture",
        duration: 20,
        sourceUrl,
      }),
    });
    assert.equal(videoResponse.status, 201);
    const video = (await videoResponse.json()).video;

    const clipResponse = await fetch(`${ctx.base}/api/clips`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        videoId: video.id,
        title: "Render smoke clip",
        start: 0,
        end: 20,
        format: "9:16",
        captions: false,
      }),
    });
    assert.equal(clipResponse.status, 202);
    const queued = await clipResponse.json();
    assert.equal(queued.clip.status, "queued");

    let job = queued.job;
    for (let attempt = 0; attempt < 60 && !["completed", "failed"].includes(job.status); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const jobResponse = await fetch(`${ctx.base}/api/jobs/${job.id}`, {
        headers: { authorization: `Bearer ${auth.token}` },
      });
      assert.equal(jobResponse.status, 200);
      job = (await jobResponse.json()).job;
    }

    assert.equal(job.status, "completed", job.error || "Render job did not complete.");
    assert.ok(job.progress >= 100);

    const clipsResponse = await fetch(`${ctx.base}/api/clips`, {
      headers: { authorization: `Bearer ${auth.token}` },
    });
    assert.equal(clipsResponse.status, 200);
    const clips = (await clipsResponse.json()).clips;
    const rendered = clips.find((clip) => clip.id === queued.clip.id);
    assert.equal(rendered.status, "ready");
    assert.ok(rendered.downloadUrl);

    const download = await fetch(`${ctx.base}/api/clips/${rendered.id}/download`, {
      headers: { authorization: `Bearer ${auth.token}` },
    });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "video/mp4");
    const downloaded = Buffer.from(await download.arrayBuffer());
    assert.ok(downloaded.length > 0);

    const exportPath = join(ctx.storageDir, rendered.downloadUrl.slice("/storage/".length));
    const exportInfo = await stat(exportPath);
    assert.ok(exportInfo.isFile());
    assert.ok(exportInfo.size > 0);
  } finally {
    await stopTestApp(ctx);
    await rm(fixtureDir, { recursive: true, force: true });
  }
});