import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-rename-limits-"));
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

test("clip rename trims whitespace and rejects empty or oversized titles", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const user = await request(base, "/api/auth/register", "POST", {
    email: "clip-rename@example.com",
    password: "password-123"
  });
  const project = await request(base, "/api/projects", "POST", { name: "Rename" }, user.body.token);
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
    title: "Original"
  }, user.body.token);

  assert.equal(created.status, 202);

  const renamed = await request(base, `/api/clips/${created.body.clip.id}`, "PATCH", {
    title: "   Renamed clip   "
  }, user.body.token);
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.clip.title, "Renamed clip");

  const empty = await request(base, `/api/clips/${created.body.clip.id}`, "PATCH", {
    title: "   "
  }, user.body.token);
  assert.equal(empty.status, 422);

  const oversized = await request(base, `/api/clips/${created.body.clip.id}`, "PATCH", {
    title: "x".repeat(161)
  }, user.body.token);
  assert.equal(oversized.status, 422);
  assert.match(oversized.body.error, /160 characters or fewer/);
});

test("clip rename blocks changes while the render is active", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const user = await request(base, "/api/auth/register", "POST", {
    email: "clip-rename-active@example.com",
    password: "password-123"
  });
  const project = await request(base, "/api/projects", "POST", { name: "Active rename" }, user.body.token);
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
    title: "Original"
  }, user.body.token);

  await server.database.transaction((d) => {
    const clip = d.clips.find((item) => item.id === created.body.clip.id);
    clip.status = "processing";
  });

  const blocked = await request(base, `/api/clips/${created.body.clip.id}`, "PATCH", {
    title: "Blocked"
  }, user.body.token);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /Wait for rendering to finish/);
});
