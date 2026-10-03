import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
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
  return { dir, server, base: `http://127.0.0.1:${server.address().port}` };
}

async function request(base, path, method, body, token) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

test("deleting a deferred video cannot remove an unowned upload path", async (t) => {
  const { dir, server, base } = await app();
  t.after(() => server.close());

  const user = await request(base, "/api/auth/register", "POST", {
    email: "source-cleanup@example.com",
    password: "password-123"
  });
  const project = await request(base, "/api/projects", "POST", { name: "Cleanup" }, user.body.token);
  const storageUploads = join(server.clipQueue.storageDir, "uploads");
  await mkdir(storageUploads, { recursive: true });

  const sourceUrl = "/storage/uploads/foreign.mp4";
  const video = await request(base, "/api/videos", "POST", {
    projectId: project.body.project.id,
    name: "Deferred",
    duration: 10,
    sourceUrl
  }, user.body.token);
  assert.equal(video.status, 201);

  const sourcePath = join(dir, sourceUrl.slice(1));
  await writeFile(sourcePath, "protected upload");

  const deleted = await request(base, `/api/videos/${video.body.video.id}`, "DELETE", undefined, user.body.token);
  assert.equal(deleted.status, 204);
  assert.equal(await readFile(sourcePath, "utf8"), "protected upload");
});
