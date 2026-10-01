import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { createApp } from "../server/app.js";

const hasFfmpeg = spawnSync(ffmpegStatic, ["-version"], { stdio: "ignore" }).status === 0;
function command(binary, args) { return new Promise((resolve, reject) => { const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = ""; child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${binary} exited with ${code}: ${stderr}`))); }); }
async function app() { const dir = await mkdtemp(join(tmpdir(), "clipforge-")); const server = createApp({ root: process.cwd(), dbFile: join(dir, "db.json"), storageDir: join(dir, "storage") }); await new Promise((resolve) => server.listen(0, resolve)); return { dir, server, base: `http://127.0.0.1:${server.address().port}` }; }
  const response = await fetch(`${base}/api/ready`);
async function waitForClip(base, token) { for (let i = 0; i < 100; i += 1) { const result = await request(base, "/api/clips", "GET", undefined, token); const clip = result.body.clips[0]; if (clip?.status !== "queued" && clip?.status !== "processing") return clip; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("Timed out waiting for render"); }
  const response = await fetch(`${base}/api/ready`);
  const response = await fetch(`${base}/api/ready`);


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

test("project videos endpoint returns only the owner project videos", async (t) => {
  const { dir, server, base } = await app(); t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "videos@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Videos" }, user.body.token);
  const sourceUrl = await uploadPlaceholder(base, user.body.token);
  await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Episode", duration: 3, sourceUrl }, user.body.token);
  const listed = await request(base, `/api/videos?projectId=${project.body.project.id}`, "GET", undefined, user.body.token);
  assert.equal(listed.status, 200); assert.equal(listed.body.videos.length, 1); assert.equal(listed.body.videos[0].name, "Episode");
});

test("uploaded videos can be streamed only by their owner", async (t) => {
  const { dir, server, base } = await app(); t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", { email: "stream@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Stream" }, user.body.token);
  const sourceUrl = await uploadPlaceholder(base, user.body.token);
  const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Episode", duration: 3, sourceUrl }, user.body.token);
  const response = await fetch(`${base}/api/ready`);
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
  const response = await fetch(`${base}/api/ready`);
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
  const response = await fetch(`${base}/api/ready`);
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
  const response = await fetch(`${base}/api/ready`);
    method: "POST",
    headers: { "content-type": "video/mp4", "x-filename": "source.mp4", authorization: `Bearer ${user.body.token}` },
    body: Buffer.from("video-placeholder")
  });
  assert.equal(response.status, 201);
  const media = await fetch(`${base}${(await response.json()).url}`);
  assert.equal(media.status, 404);
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

test("clip validation rejects ranges outside the source duration", async (t) => { const { server, base } = await app(); t.after(() => server.close()); const user = await request(base, "/api/auth/register", "POST", { email: "range@example.com", password: "password-123" }); const project = await request(base, "/api/projects", "POST", { name: "P" }, user.body.token); const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, duration: 10, sourceUrl: "/storage/uploads/example.mp4" }, user.body.token); const bad = await request(base, "/api/clips", "POST", { videoId: video.body.video.id, start: 0, end: 11 }, user.body.token); assert.equal(bad.status, 422); });
