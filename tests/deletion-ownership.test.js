import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-deletion-ownership-"));
  const server = createApp({
    root: process.cwd(),
    dbFile: join(dir, "db.json"),
    storageDir: join(dir, "storage")
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function request(base, path, method = "GET", body, token) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json()
  };
}

test("project deletion is protected by project ownership", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const owner = await request(base, "/api/auth/register", "POST", {
    email: "delete-project-owner@example.com",
    password: "password-123"
  });
  const other = await request(base, "/api/auth/register", "POST", {
    email: "delete-project-other@example.com",
    password: "password-123"
  });

  const project = await request(base, "/api/projects", "POST", { name: "Private project" }, owner.body.token);
  const denied = await request(base, `/api/projects/${project.body.project.id}`, "DELETE", undefined, other.body.token);
  assert.equal(denied.status, 404);

  const ownerProjects = await request(base, "/api/projects", "GET", undefined, owner.body.token);
  assert.equal(ownerProjects.body.projects.length, 1);
  assert.equal(ownerProjects.body.projects[0].id, project.body.project.id);
});

test("video deletion is protected by video ownership", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const owner = await request(base, "/api/auth/register", "POST", {
    email: "delete-video-owner@example.com",
    password: "password-123"
  });
  const other = await request(base, "/api/auth/register", "POST", {
    email: "delete-video-other@example.com",
    password: "password-123"
  });

  const project = await request(base, "/api/projects", "POST", { name: "Video project" }, owner.body.token);
  const video = await request(base, "/api/videos", "POST", {
    projectId: project.body.project.id,
    name: "Private video",
    duration: 30
  }, owner.body.token);

  const denied = await request(base, `/api/videos/${video.body.video.id}`, "DELETE", undefined, other.body.token);
  assert.equal(denied.status, 404);

  const ownerVideos = await request(base, `/api/videos?projectId=${project.body.project.id}`, "GET", undefined, owner.body.token);
  assert.equal(ownerVideos.body.videos.length, 1);
  assert.equal(ownerVideos.body.videos[0].id, video.body.video.id);
});

test("clip deletion is protected by clip ownership", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const owner = await request(base, "/api/auth/register", "POST", {
    email: "delete-clip-owner@example.com",
    password: "password-123"
  });
  const other = await request(base, "/api/auth/register", "POST", {
    email: "delete-clip-other@example.com",
    password: "password-123"
  });

  const project = await request(base, "/api/projects", "POST", { name: "Clip project" }, owner.body.token);
  const video = await request(base, "/api/videos", "POST", {
    projectId: project.body.project.id,
    name: "Source",
    duration: 30,
    sourceUrl: "/storage/uploads/missing.mp4"
  }, owner.body.token);
  const clip = await request(base, "/api/clips", "POST", {
    videoId: video.body.video.id,
    start: 0,
    end: 10
  }, owner.body.token);

  const denied = await request(base, `/api/clips/${clip.body.clip.id}`, "DELETE", undefined, other.body.token);
  assert.equal(denied.status, 404);

  const ownerClips = await request(base, "/api/clips", "GET", undefined, owner.body.token);
  assert.equal(ownerClips.body.clips.length, 1);
  assert.equal(ownerClips.body.clips[0].id, clip.body.clip.id);
});

test("the final project cannot be deleted", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const user = await request(base, "/api/auth/register", "POST", {
    email: "delete-final-project@example.com",
    password: "password-123"
  });

  const first = await request(
    base,
    "/api/projects",
    "POST",
    { name: "First project" },
    user.body.token
  );
  const second = await request(
    base,
    "/api/projects",
    "POST",
    { name: "Second project" },
    user.body.token
  );
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const removed = await request(
    base,
    `/api/projects/${first.body.project.id}`,
    "DELETE",
    undefined,
    user.body.token
  );
  assert.equal(removed.status, 204);

  const denied = await request(
    base,
    `/api/projects/${second.body.project.id}`,
    "DELETE",
    undefined,
    user.body.token
  );
  assert.equal(denied.status, 409);
  assert.match(denied.body.error, /At least one project must remain/);

  const remaining = await request(base, "/api/projects", "GET", undefined, user.body.token);
  assert.equal(remaining.body.projects.length, 1);
  assert.equal(remaining.body.projects[0].id, second.body.project.id);
});
