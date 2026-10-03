import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-source-cleanup-"));
  const server = createApp({
    root: process.cwd(),
    dbFile: join(dir, "db.json"),
    storageDir: join(dir, "storage")
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { dir, server, base: `http://127.0.0.1:${server.address().port}` };
}

test("video deletion refuses to follow a swapped source symlink", async (t) => {
  const { dir, server, base } = await app();
  t.after(() => server.close());

  const register = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "cleanup-race@example.com", password: "password-123" })
  });
  assert.equal(register.status, 201);
  const user = await register.json();

  const projectResponse = await fetch(base + "/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ name: "Cleanup race" })
  });
  assert.equal(projectResponse.status, 201);
  const project = await projectResponse.json();

  const uploadResponse = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: {
      "content-type": "video/mp4",
      "content-length": "10",
      "x-filename": "source.mp4",
      authorization: `Bearer ${user.token}`
    },
    body: Buffer.from("video-data")
  });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();

  const videoResponse = await fetch(base + "/api/videos", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
    body: JSON.stringify({
      projectId: project.project.id,
      name: "Source",
      duration: 10,
      sourceUrl: uploaded.url
    })
  });
  assert.equal(videoResponse.status, 201);
  const video = await videoResponse.json();

  const sourcePath = join(server.clipQueue.storageDir, uploaded.url.slice("/storage/".length));
  const outside = join(dir, "protected.mp4");
  await writeFile(outside, "do not delete");
  await rm(sourcePath);
  await symlink(outside, sourcePath);

  const deleteResponse = await fetch(base + "/api/videos/" + video.video.id, {
    method: "DELETE",
    headers: { authorization: `Bearer ${user.token}` }
  });
  assert.equal(deleteResponse.status, 204);
  assert.equal(await readFile(outside, "utf8"), "do not delete");
  await mkdir(join(dir, "marker"), { recursive: true });
});
