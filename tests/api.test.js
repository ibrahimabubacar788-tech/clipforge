import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0 && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;
function command(binary, args) { return new Promise((resolve, reject) => { const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = ""; child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${binary} exited with ${code}: ${stderr}`))); }); }
async function app() { const dir = await mkdtemp(join(tmpdir(), "clipforge-")); const server = createApp({ root: process.cwd(), dbFile: join(dir, "db.json"), storageDir: join(dir, "storage") }); await new Promise((resolve) => server.listen(0, resolve)); return { dir, server, base: `http://127.0.0.1:${server.address().port}` }; }
async function request(base, path, method = "GET", body, token) { const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) }); return { status: response.status, body: response.status === 204 ? null : await response.json() }; }
async function waitForClip(base, token) { for (let i = 0; i < 100; i += 1) { const result = await request(base, "/api/clips", "GET", undefined, token); const clip = result.body.clips[0]; if (clip?.status !== "queued" && clip?.status !== "processing") return clip; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("Timed out waiting for render"); }
async function uploadFixture(base, token, dir) { const source = join(dir, "source.mp4"); await command("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100", "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source]); const data = (await readFile(source)).toString("base64"); const upload = await request(base, "/api/uploads", "POST", { filename: "source.mp4", data }, token); assert.equal(upload.status, 201); return upload.body.url; }

test("FFmpeg renders an uploaded video into a downloadable MP4 clip", { skip: hasFfmpeg ? false : "FFmpeg and ffprobe are required for media integration tests" }, async (t) => {
  const { dir, server, base } = await app(); t.after(() => server.close());
  const registered = await request(base, "/api/auth/register", "POST", { email: "creator@example.com", password: "password-123" });
  const token = registered.body.token;
  const project = await request(base, "/api/projects", "POST", { name: "Show" }, token);
  const sourceUrl = await uploadFixture(base, token, dir);
  const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Episode", duration: 3, sourceUrl }, token);
  const clip = await request(base, "/api/clips", "POST", { videoId: video.body.video.id, start: 0, end: 2, format: "9:16", captions: true, style: { color: "pink", weight: "bold" } }, token);
  assert.equal(clip.status, 202); assert.equal(clip.body.job.status, "queued");
  const rendered = await waitForClip(base, token);
  assert.equal(rendered.status, "ready"); assert.match(rendered.downloadUrl, /^\/storage\/exports\/.*\.mp4$/);
  const download = await fetch(`${base}${rendered.downloadUrl}`);
  assert.equal(download.status, 200); assert.equal(download.headers.get("content-type"), "video/mp4");
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.ok(bytes.length > 1_000); assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
  const dimensions = await command("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", join(dir, "storage", rendered.downloadUrl.slice(1))]);
  assert.equal(dimensions.trim(), "720x1280");
});

test("clip validation rejects ranges outside the source duration", async (t) => { const { server, base } = await app(); t.after(() => server.close()); const user = await request(base, "/api/auth/register", "POST", { email: "range@example.com", password: "password-123" }); const project = await request(base, "/api/projects", "POST", { name: "P" }, user.body.token); const video = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, duration: 10, sourceUrl: "/storage/uploads/example.mp4" }, user.body.token); const bad = await request(base, "/api/clips", "POST", { videoId: video.body.video.id, start: 0, end: 11 }, user.body.token); assert.equal(bad.status, 422); });
