import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-video-source-"));
  const server = createApp({
    root: process.cwd(),
    dbFile: join(dir, "db.json"),
    storageDir: join(dir, "storage")
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function request(base, path, method, body, token) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

test("video creation rejects another user's missing upload path while preserving deferred own sources", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const owner = await request(base, "/api/auth/register", "POST", {
    email: "source-owner@example.com",
    password: "password-123"
  });
  const other = await request(base, "/api/auth/register", "POST", {
    email: "source-other@example.com",
    password: "password-123"
  });

  const ownerProject = await request(base, "/api/projects", "POST", { name: "Owner" }, owner.body.token);
  const otherProject = await request(base, "/api/projects", "POST", { name: "Other" }, other.body.token);

  const ownDeferred = await request(base, "/api/videos", "POST", {
    projectId: ownerProject.body.project.id,
    name: "Deferred source",
    duration: 10,
    sourceUrl: "/storage/uploads/" + owner.body.user.id + "-future.mp4"
  }, owner.body.token);
  assert.equal(ownDeferred.status, 201);

  const foreignDeferred = await request(base, "/api/videos", "POST", {
    projectId: otherProject.body.project.id,
    name: "Foreign source",
    duration: 10,
    sourceUrl: "/storage/uploads/" + owner.body.user.id + "-future.mp4"
  }, other.body.token);
  assert.equal(foreignDeferred.status, 403);
});
