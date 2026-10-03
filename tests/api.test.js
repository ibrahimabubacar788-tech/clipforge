import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, symlink, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { createApp } from "../server/app.js";
import { rankHighlightsWithAI } from "../server/highlights.js";

const hasFfmpeg = spawnSync(ffmpegStatic, ["-version"], { stdio: "ignore" }).status === 0;
function command(binary, args) { return new Promise((resolve, reject) => { const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = ""; child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${binary} exited with ${code}: ${stderr}`))); }); }
async function app() { const dir = await mkdtemp(join(tmpdir(), "clipforge-")); const server = createApp({ root: process.cwd(), dbFile: join(dir, "db.json"), storageDir: join(dir, "storage") }); await new Promise((resolve) => server.listen(0, resolve)); return { dir, server, base: `http://127.0.0.1:${server.address().port}` }; }
async function request(base, path, method = "GET", body, token) { const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) }); return { status: response.status, body: response.status === 204 ? null : await response.json() }; }
async function waitForClip(base, token) { for (let i = 0; i < 100; i += 1) { const result = await request(base, "/api/clips", "GET", undefined, token); const clip = result.body.clips[0]; if (clip?.status !== "queued" && clip?.status !== "processing") return clip; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("Timed out waiting for render"); }
async function uploadFixture(base, token, dir) { const source = join(dir, "source.mp4"); await command(ffmpegStatic, ["-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100", "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source]); const data = await readFile(source); const response = await fetch(`${base}/api/uploads`, { method: "POST", headers: { "content-type": "video/mp4", "x-filename": "source.mp4", authorization: `Bearer ${token}` }, body: data }); const upload = { status: response.status, body: await response.json() }; assert.equal(upload.status, 201); return upload.body.url; }
async function uploadPlaceholder(base, token) { const response = await fetch(`${base}/api/uploads`, { method: "POST", headers: { "content-type": "video/mp4", "x-filename": "placeholder.mp4", authorization: `Bearer ${token}` }, body: Buffer.alloc(64, 0) }); const upload = { status: response.status, body: await response.json() }; assert.equal(upload.status, 201); return upload.body.url; }


test("registration normalizes email and rejects oversized passwords", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const created = await request(base, "/api/auth/register", "POST", { email: "  MixedCase@example.com  ", password: "password-123" });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.email, "mixedcase@example.com");
  const duplicate = await request(base, "/api/auth/register", "POST", { email: "mixedcase@example.com", password: "password-123" });
  assert.equal(duplicate.status, 409);
  const oversized = await request(base, "/api/auth/register", "POST", { email: "large@example.com", password: "x".repeat(257) });
  assert.equal(oversized.status, 422);
});

test("authentication sessions enforce credentials and logout", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const registered = await request(base, "/api/auth/register", "POST", {
    email: "auth@example.com",
    password: "correct-password"
  });
  assert.equal(registered.status, 201);
  assert.ok(registered.body.token);

  const me = await request(base, "/api/me", "GET", undefined, registered.body.token);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, "auth@example.com");

  const wrong = await request(base, "/api/auth/login", "POST", {
    email: "auth@example.com",
    password: "wrong-password"
  });
  assert.equal(wrong.status, 401);

  const login = await request(base, "/api/auth/login", "POST", {
    email: "auth@example.com",
    password: "correct-password"
  });
  assert.equal(login.status, 200);
  assert.notEqual(login.body.token, registered.body.token);

  const logout = await request(base, "/api/auth/logout", "POST", undefined, login.body.token);
  assert.equal(logout.status, 204);

  const afterLogout = await request(base, "/api/me", "GET", undefined, login.body.token);
  assert.equal(afterLogout.status, 401);
});

test("login rejects malformed password values without a server error", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const registered = await request(base, "/api/auth/register", "POST", { email: "malformed-login@example.com", password: "correct-password" });
  assert.equal(registered.status, 201);
  const malformed = await request(base, "/api/auth/login", "POST", { email: "malformed-login@example.com", password: { nested: true } });
  assert.equal(malformed.status, 401);
  assert.equal(malformed.body.error, "Invalid email or password.");
});

test("authentication rejects malformed and oversized session tokens", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const registered = await request(base, "/api/auth/register", "POST", {
    email: "auth-token-hardening@example.com",
    password: "correct-password"
  });
  assert.equal(registered.status, 201);

  const malformedCookie = await fetch(base + "/api/me", {
    headers: { cookie: "clipforge_session=%E0%A4%A" }
  });
  assert.equal(malformedCookie.status, 401);

  const oversizedBearer = await fetch(base + "/api/me", {
    headers: { authorization: "Bearer " + "x".repeat(257) }
  });
  assert.equal(oversizedBearer.status, 401);

  const valid = await fetch(base + "/api/me", {
    headers: { authorization: "Bearer " + registered.body.token }
  });
  assert.equal(valid.status, 200);
});

test("project videos endpoint returns only the owner project videos", async (t) => {
  const { dir, server, base } = await app(); t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "videos@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Videos" }, user.body.token);
  const sourceUrl = await uploadPlaceholder(base, user.body.token);
  await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Episode", duration: 3, sourceUrl }, user.body.token);
  const listed = await request(base, `/api/videos?projectId=${project.body.project.id}`, "GET", undefined, user.body.token);
  assert.equal(listed.status, 200); assert.equal(listed.body.videos.length, 1); assert.equal(listed.body.videos[0].name, "Episode");
});

test("video creation validates unsafe and directory-backed upload sources", async (t) => {
  const { dir, server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "video-source-validation@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Sources" }, user.body.token);
  const traversal = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Traversal", duration: 3, sourceUrl: "/storage/uploads/../outside.mp4" }, user.body.token);
  assert.equal(traversal.status, 403);
  const { mkdir, symlink } = await import("node:fs/promises");
  const uploads = join(server.clipQueue.storageDir, "uploads");
  const outsideDir = join(dir, "outside-video-source");
  const target = join(uploads, user.body.user.id + "-directory.mp4");
  await mkdir(outsideDir, { recursive: true });
  await mkdir(uploads, { recursive: true });
  await symlink(outsideDir, target);
  const directory = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Directory", duration: 3, sourceUrl: "/storage/uploads/" + user.body.user.id + "-directory.mp4" }, user.body.token);
  assert.equal(directory.status, 422);
});

test("uploaded videos can be streamed only by their owner", async (t) => {
  const { dir, server, base } = await app(); t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "stream@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Stream" }, user.body.token);
  const sourceUrl = await uploadPlaceholder(base, user.body.token);
  const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Episode", duration: 3, sourceUrl }, user.body.token);
  const response = await fetch(`${base}/api/videos/${video.body.video.id}/stream`, { headers: { authorization: `Bearer ${user.body.token}`, range: "bytes=0-31" } });
  assert.equal(response.status, 206); assert.equal(response.headers.get("accept-ranges"), "bytes"); assert.match(response.headers.get("content-range"), /^bytes 0-31\/\d+$/); assert.equal((await response.arrayBuffer()).byteLength, 32);
  const other = await request(base, "/api/auth/register", "POST", { email: "other-stream@example.com", password: "password-123" });
  const denied = await fetch(`${base}/api/videos/${video.body.video.id}/stream`, { headers: { authorization: `Bearer ${other.body.token}` } });
  assert.equal(denied.status, 404);
});

test("FFmpeg renders an uploaded video into a downloadable MP4 clip with bitmap captions", { skip: hasFfmpeg ? false : "ffmpeg-static is required for media integration tests" }, async (t) => {
  const { dir, server, base } = await app(); t.after(() => server.close());
  const registered = await request(base, "/api/auth/register", "POST", { email: "creator@example.com", password: "password-123" });
  const token = registered.body.token;
  const project = await request(base, "/api/projects", "POST", { name: "Show" }, token);
  const sourceUrl = await uploadFixture(base, token, dir);
  const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Episode", duration: 3, sourceUrl }, token);
  const clip = await request(base, "/api/clips", "POST", { videoId: video.body.video.id, start: 0, end: 2, format: "9:16", captions: true, captionSegments: [{ start: 0, end: 1, text: "THIS IS A TEST CAPTION", speaker: "SPEAKER A" }], style: { color: "pink", weight: "bold" } }, token);
  assert.equal(clip.status, 202); assert.equal(clip.body.job.status, "queued");
  const rendered = await waitForClip(base, token);
  assert.equal(rendered.status, "ready"); assert.match(rendered.downloadUrl, /^\/storage\/exports\/.*\.mp4$/);
  const download = await fetch(`${base}/api/clips/${rendered.id}/download`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(download.status, 200); assert.equal(download.headers.get("content-type"), "video/mp4");
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.ok(bytes.length > 1_000); assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
  const mediaPath = join(dir, rendered.downloadUrl.slice(1));
  await command(ffmpegStatic, ["-v", "error", "-i", mediaPath, "-f", "null", "-"]);
  assert.equal(rendered.captionSegments.length, 1); assert.equal(rendered.captionSegments[0].speaker, "SPEAKER A"); const unauthorized = await fetch(`${base}/api/clips/${rendered.id}/download`); assert.equal(unauthorized.status, 401); const publicMedia = await fetch(`${base}${rendered.downloadUrl}`); assert.equal(publicMedia.status, 404);
});

test("failed clips can be retried", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "retry@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Retry" }, user.body.token);
  const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Broken source", duration: 3, sourceUrl: "/storage/uploads/missing.mp4" }, user.body.token);
  const created = await request(base, "/api/clips", "POST", { videoId: video.body.video.id, start: 0, end: 2 }, user.body.token);
  assert.equal(created.status, 202);
  const failed = await waitForClip(base, user.body.token);
  assert.equal(failed.status, "failed");
  const retried = await request(base, `/api/clips/${failed.id}/retry`, "POST", undefined, user.body.token);
  assert.equal(retried.status, 202);
  assert.equal(retried.body.clip.status, "queued");
  assert.notEqual(retried.body.job.id, created.body.job.id);
});

test("clip retry rejects non-failed clips", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "retry-state@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Retry state" }, user.body.token);
  const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Video", duration: 3, sourceUrl: "/storage/uploads/missing.mp4" }, user.body.token);
  const created = await request(base, "/api/clips", "POST", { videoId: video.body.video.id, start: 0, end: 2 }, user.body.token);
  const immediate = await request(base, `/api/clips/${created.body.clip.id}/retry`, "POST", undefined, user.body.token);
  assert.equal(immediate.status, 409);
  assert.match(immediate.body.error, /Only failed clips/);
});

test("clip retry is protected by clip ownership", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const owner = await request(base, "/api/auth/register", "POST", { email: "retry-owner@example.com", password: "password-123" });
  const other = await request(base, "/api/auth/register", "POST", { email: "retry-other@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Private retry" }, owner.body.token);
  const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Broken source", duration: 3, sourceUrl: "/storage/uploads/missing.mp4" }, owner.body.token);
  const created = await request(base, "/api/clips", "POST", { videoId: video.body.video.id, start: 0, end: 2 }, owner.body.token);
  const denied = await request(base, `/api/clips/${created.body.clip.id}/retry`, "POST", undefined, other.body.token);
  assert.equal(denied.status, 404);
});

test("responses include baseline security headers", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const response = await fetch(`${base}/api/ready`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
});

test("readiness verifies database availability", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const response = await fetch(`${base}/api/ready`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { ok: true, service: "clipforge", mediaStorage: { mode: "local", persistent: false } });
});

test("chunked video uploads are accepted without content length", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "chunked-upload@example.com", password: "password-123" });
  const response = await fetch(`${base}/api/uploads`, {
    method: "POST",
    headers: { "content-type": "video/mp4", "x-filename": "chunked.mp4", authorization: `Bearer ${user.body.token}` },
    duplex: "half",
    body: ReadableStream.from([Buffer.from("video-"), Buffer.from("placeholder")])
  });
  assert.equal(response.status, 201);
});

test("uploads reject non-video content types", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "upload-check@example.com", password: "password-123" });
  const response = await fetch(`${base}/api/uploads`, {
    method: "POST",
    headers: { "content-type": "text/plain", "x-filename": "source.mp4", authorization: `Bearer ${user.body.token}` },
    body: Buffer.from("not a video")
  });
  assert.equal(response.status, 415);
});

test("public source uploads are not directly accessible", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "private-media@example.com", password: "password-123" });
  const response = await fetch(`${base}/api/uploads`, {
    method: "POST",
    headers: { "content-type": "video/mp4", "x-filename": "source.mp4", authorization: `Bearer ${user.body.token}` },
    body: Buffer.from("video-placeholder")
  });
  assert.equal(response.status, 201);
  const media = await fetch(`${base}${(await response.json()).url}`);
  assert.equal(media.status, 404);
});

test("clip downloads reject export symlinks that escape storage", async (t) => {
  const { dir, server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "download-symlink@example.com", password: "password-123" });
  const exportsDir = join(server.clipQueue.storageDir, "exports");
  await mkdir(exportsDir, { recursive: true });
  const outside = join(dir, "outside-export.mp4");
  const target = join(exportsDir, "unsafe.mp4");
  await writeFile(outside, Buffer.from("not-a-video"));
  await symlink(outside, target);
  await server.database.transaction((d) => d.clips.push({
    id: "clip-download-symlink",
    userId: user.body.user.id,
    title: "Unsafe export",
    status: "ready",
    downloadUrl: "/storage/exports/unsafe.mp4",
    createdAt: new Date().toISOString()
  }));
  const response = await fetch(base + "/api/clips/clip-download-symlink/download", {
    headers: { authorization: "Bearer " + user.body.token }
  });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /invalid export path/i);
});

test("clip downloads are protected by ownership", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const owner = await request(base, "/api/auth/register", "POST", { email: "download-owner@example.com", password: "password-123" });
  const other = await request(base, "/api/auth/register", "POST", { email: "download-other@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Owner project" }, owner.body.token);
  const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Owner video", duration: 3, sourceUrl: "/storage/uploads/example.mp4" }, owner.body.token);
  const clip = await request(base, "/api/clips", "POST", { videoId: video.body.video.id, start: 0, end: 2 }, owner.body.token);
  const denied = await fetch(`${base}/api/clips/${clip.body.clip.id}/download`, { headers: { authorization: `Bearer ${other.body.token}` } });
  assert.equal(denied.status, 404);
});

test("clips cannot be created from another user's video", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const owner = await request(base, "/api/auth/register", "POST", { email: "clip-owner@example.com", password: "password-123" });
  const other = await request(base, "/api/auth/register", "POST", { email: "clip-other@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Owner project" }, owner.body.token);
  const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Owner video", duration: 3, sourceUrl: "/storage/uploads/example.mp4" }, owner.body.token);
  const denied = await request(base, "/api/clips", "POST", { videoId: video.body.video.id, start: 0, end: 2 }, other.body.token);
  assert.equal(denied.status, 404);
});

test("videos cannot be created in another user's project", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const owner = await request(base, "/api/auth/register", "POST", { email: "video-owner@example.com", password: "password-123" });
  const other = await request(base, "/api/auth/register", "POST", { email: "video-other@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Owner project" }, owner.body.token);
  const denied = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Unauthorized", duration: 3, sourceUrl: "/storage/uploads/example.mp4" }, other.body.token);
  assert.equal(denied.status, 404);
});

test("projects are isolated by user", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const owner = await request(base, "/api/auth/register", "POST", { email: "project-owner@example.com", password: "password-123" });
  const other = await request(base, "/api/auth/register", "POST", { email: "project-other@example.com", password: "password-123" });
  const created = await request(base, "/api/projects", "POST", { name: "Owner project" }, owner.body.token);
  const listed = await request(base, "/api/projects", "GET", undefined, other.body.token);
  assert.deepEqual(listed.body.projects, []);
  const update = await request(base, `/api/projects/${created.body.project.id}`, "PATCH", { name: "Changed" }, other.body.token);
  assert.equal(update.status, 404);
});



test("queue recovery requeues interrupted processing jobs and clips", async (t) => {
  const { server } = await app();
  t.after(() => server.close());
  await server.database.transaction((d) => {
    d.clips.push({ id: "clip-recovery", userId: "user-recovery", status: "processing", start: 0, end: 2, sourceUrl: "/storage/uploads/example.mp4" });
    d.jobs.push({ id: "job-recovery", clipId: "clip-recovery", status: "processing", progress: 62, startedAt: "2026-10-01T00:00:00.000Z" });
  });
  server.clipQueue.running = true;
  await server.clipQueue.recover();
  const state = await server.database.read((d) => ({
    job: d.jobs.find((item) => item.id === "job-recovery"),
    clip: d.clips.find((item) => item.id === "clip-recovery")
  }));
  assert.equal(state.job.status, "queued");
  assert.equal(state.job.progress, 0);
  assert.equal(state.job.startedAt, undefined);
  assert.equal(state.clip.status, "queued");
  assert.ok(state.clip.updatedAt);
});
test("clip validation rejects ranges outside the source duration", async (t) => { const { server, base } = await app(); t.after(() => server.close()); const user = await request(base, "/api/auth/register", "POST", { email: "range@example.com", password: "password-123" }); const project = await request(base, "/api/projects", "POST", { name: "P" }, user.body.token); const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, duration: 10, sourceUrl: "/storage/uploads/example.mp4" }, user.body.token); const bad = await request(base, "/api/clips", "POST", { videoId: video.body.video.id, start: 0, end: 11 }, user.body.token); assert.equal(bad.status, 422); });

test("AI highlight analyzer parses a valid Responses API JSON result", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      selections: [
        { id: 0, score: 91, reason: "Strong hook and payoff", title: "The biggest lesson" },
        { id: 1, score: 84, reason: "Clear surprising insight", title: "Why it changed" }
      ]
    })
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 8, text: "Here is the biggest lesson from this story." },
      { start: 8, end: 16, text: "You need to know why this changed everything." },
      { start: 90, end: 98, text: "The truth is this was the biggest mistake." },
      { start: 98, end: 106, text: "But the result surprised everyone." }
    ], { limit: 2 });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].aiScore, 91);
    assert.equal(result.candidates[0].title, "The biggest lesson");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("AI highlight analyzer falls back safely when no API key is configured", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 8, text: "Here is the biggest lesson from this story." },
      { start: 8, end: 16, text: "You need to know why this changed everything." },
      { start: 16, end: 24, text: "The result surprised everyone." }
    ], { limit: 2 });
    assert.equal(result.engine, "heuristic-fallback");
    assert.ok(result.candidates.length >= 1);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});
test("AI highlight analyzer accepts nested Responses API output text", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          selections: [{ id: 0, score: 88, reason: "Strong payoff", title: "Nested result" }]
        })
      }]
    }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 8, text: "Here is the biggest lesson from this story." },
      { start: 8, end: 16, text: "You need to know why this changed everything." },
      { start: 90, end: 98, text: "The truth is this was the biggest mistake." },
      { start: 98, end: 106, text: "But the result surprised everyone." }
    ], { limit: 1 });
    assert.equal(result.engine, "openai-highlights-v1");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].aiScore, 88);
    assert.equal(result.candidates[0].title, "Nested result");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("AI highlight analyzer falls back when the model returns invalid JSON", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({ output_text: "{not-json" }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  try {
    const result = await rankHighlightsWithAI([
      { start: 0, end: 8, text: "Here is the biggest lesson from this story." },
      { start: 8, end: 16, text: "You need to know why this changed everything." },
      { start: 24, end: 32, text: "But the result surprised everyone." }
    ], { limit: 1 });
    assert.equal(result.engine, "heuristic-fallback");
    assert.ok(result.aiError);
    assert.ok(result.candidates.length >= 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("automatic AI clipping creates multiple ranked clips from a stored transcript", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "auto-clip@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Automatic clips" }, user.body.token);
  const video = await request(base, "/api/videos", "POST", {
    projectId: project.body.project.id,
    name: "Episode",
    duration: 150,
    sourceUrl: "/storage/uploads/example.mp4"
  }, user.body.token);

  await request(base, `/api/videos/${video.body.video.id}/transcript`, "POST", {
    format: "plain",
    segments: [
      { start: 0, end: 8, text: "Here is the biggest lesson from this story." },
      { start: 8, end: 16, text: "You need to know why this changed everything." },
      { start: 24, end: 32, text: "The truth is this was the biggest mistake." },
      { start: 32, end: 40, text: "But that means we finally found the result." },
      { start: 100, end: 108, text: "Imagine what happens when you understand the secret." },
      { start: 108, end: 116, text: "You need to know why the result surprised everyone." },
      { start: 116, end: 124, text: "The truth is this is the biggest lesson." }
    ]
  }, user.body.token);

  const generated = await request(base, `/api/videos/${video.body.video.id}/auto-clip`, "POST", {
    limit: 4,
    format: "9:16"
  }, user.body.token);

  assert.equal(generated.status, 202);
  assert.ok(["clipforge-auto-v2", "clipforge-auto-v3"].includes(generated.body.engine));
  assert.equal(generated.body.transcribed, false);
  assert.ok(generated.body.generated >= 2);
  assert.equal(generated.body.clips.length, generated.body.generated);
  assert.ok(generated.body.clips.every((item) => item.clip.videoId === video.body.video.id && item.job));
});

test("video streaming rejects uploaded source symlinks that escape storage", async (t) => {
  const { dir, server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", {
    email: "stream-symlink@example.com",
    password: "password-123"
  });
  const project = await request(base, "/api/projects", "POST", { name: "Stream security" }, user.body.token);
  const uploads = join(server.clipQueue.storageDir, "uploads");
  await mkdir(uploads, { recursive: true });
  const outside = join(dir, "outside-stream.mp4");
  const target = join(uploads, user.body.user.id + "-stream.mp4");
  await writeFile(outside, Buffer.from("not-a-video"));
  await symlink(outside, target);
  await server.database.transaction((d) => d.videos.push({
    id: "vid-stream-symlink",
    userId: user.body.user.id,
    projectId: project.body.project.id,
    name: "Unsafe source",
    sourceUrl: "/storage/uploads/" + user.body.user.id + "-stream.mp4",
    duration: 1,
    createdAt: new Date().toISOString()
  }));
  const response = await fetch(base + "/api/videos/vid-stream-symlink/stream", {
    headers: { authorization: "Bearer " + user.body.token }
  });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /invalid video path/i);
});

test("automatic AI clipping rejects concurrent runs for the same video", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "auto-concurrent@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Auto concurrent" }, user.body.token);
  const video = await request(base, "/api/videos", "POST", {
    projectId: project.body.project.id,
    name: "Episode",
    duration: 150,
    sourceUrl: "/storage/uploads/example.mp4"
  }, user.body.token);
  await request(base, `/api/videos/${video.body.video.id}/transcript`, "POST", {
    format: "plain",
    segments: [
      { start: 0, end: 8, text: "Here is the biggest lesson from this story." },
      { start: 8, end: 16, text: "You need to know why this changed everything." },
      { start: 100, end: 108, text: "Imagine what happens when you understand the secret." },
      { start: 108, end: 116, text: "But the result surprised everyone." }
    ]
  }, user.body.token);
  const [first, second] = await Promise.all([
    request(base, `/api/videos/${video.body.video.id}/auto-clip`, "POST", { limit: 2 }, user.body.token),
    request(base, `/api/videos/${video.body.video.id}/auto-clip`, "POST", { limit: 2 }, user.body.token)
  ]);
  assert.deepEqual([first.status, second.status].sort((a, b) => a - b), [202, 409]);
});

test("automatic AI clipping reuses an existing auto batch instead of duplicating clips", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "auto-dedupe@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Auto dedupe" }, user.body.token);
  const video = await request(base, "/api/videos", "POST", {
    projectId: project.body.project.id,
    name: "Episode",
    duration: 150,
    sourceUrl: "/storage/uploads/example.mp4"
  }, user.body.token);
  await request(base, `/api/videos/${video.body.video.id}/transcript`, "POST", {
    format: "plain",
    segments: [
      { start: 0, end: 8, text: "Here is the biggest lesson from this story." },
      { start: 8, end: 16, text: "You need to know why this changed everything." },
      { start: 24, end: 32, text: "The truth is this was the biggest mistake." },
      { start: 32, end: 40, text: "But that means we finally found the result." },
      { start: 100, end: 108, text: "Imagine what happens when you understand the secret." },
      { start: 108, end: 116, text: "You need to know why the result surprised everyone." }
    ]
  }, user.body.token);
  const first = await request(base, `/api/videos/${video.body.video.id}/auto-clip`, "POST", { limit: 2 }, user.body.token);
  assert.equal(first.status, 202);
  assert.equal(first.body.generated, 2);
  const second = await request(base, `/api/videos/${video.body.video.id}/auto-clip`, "POST", { limit: 2 }, user.body.token);
  assert.equal(second.status, 200);
  assert.equal(second.body.reused, true);
  assert.equal(second.body.generated, 2);
  assert.equal(second.body.clips.length, 2);
  const listed = await request(base, "/api/clips", "GET", undefined, user.body.token);
  assert.equal(listed.body.clips.filter((clip) => clip.generation === "auto-ai").length, 2);
});
