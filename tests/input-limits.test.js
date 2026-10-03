import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-input-limits-"));
  const server = createApp({
    root: process.cwd(),
    dbFile: join(dir, "db.json"),
    storageDir: join(dir, "storage")
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function request(base, path, method = "GET", body, token) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body && JSON.stringify(body)
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json()
  };
}

test("video names are trimmed, bounded, and defaulted safely", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const user = await request(base, "/api/auth/register", "POST", {
    email: "video-limits@example.com",
    password: "password-123"
  });
  const project = await request(base, "/api/projects", "POST", { name: "Limits" }, user.body.token);

  const created = await request(base, "/api/videos", "POST", {
    projectId: project.body.project.id,
    name: "   Episode title   ",
    duration: 3,
    sourceUrl: "/storage/uploads/example.mp4"
  }, user.body.token);

  assert.equal(created.status, 201);
  assert.equal(created.body.video.name, "Episode title");

  const empty = await request(base, "/api/videos", "POST", {
    projectId: project.body.project.id,
    name: "   ",
    duration: 3,
    sourceUrl: "/storage/uploads/example.mp4"
  }, user.body.token);

  assert.equal(empty.status, 201);
  assert.equal(empty.body.video.name, "Untitled video");

  const oversized = await request(base, "/api/videos", "POST", {
    projectId: project.body.project.id,
    name: "x".repeat(161),
    duration: 3,
    sourceUrl: "/storage/uploads/example.mp4"
  }, user.body.token);

  assert.equal(oversized.status, 422);
  assert.match(oversized.body.error, /160 characters or fewer/);
});

test("clip titles are trimmed and bounded", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const user = await request(base, "/api/auth/register", "POST", {
    email: "clip-limits@example.com",
    password: "password-123"
  });
  const project = await request(base, "/api/projects", "POST", { name: "Clip limits" }, user.body.token);
  const video = await request(base, "/api/videos", "POST", {
    projectId: project.body.project.id,
    name: "Episode",
    duration: 10,
    sourceUrl: "/storage/uploads/example.mp4"
  }, user.body.token);

  const created = await request(base, "/api/clips", "POST", {
    videoId: video.body.video.id,
    start: 0,
    end: 2,
    title: "   My clip   "
  }, user.body.token);

  assert.equal(created.status, 202);
  assert.equal(created.body.clip.title, "My clip");

  const oversized = await request(base, "/api/clips", "POST", {
    videoId: video.body.video.id,
    start: 0,
    end: 2,
    title: "x".repeat(161)
  }, user.body.token);

  assert.equal(oversized.status, 422);
  assert.match(oversized.body.error, /160 characters or fewer/);
});
