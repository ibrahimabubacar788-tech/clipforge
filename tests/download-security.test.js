import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-download-security-"));
  const server = createApp({ root: process.cwd(), dbFile: join(dir, "db.json"), storageDir: join(dir, "storage") });
  await new Promise((resolve) => server.listen(0, resolve));
  return { dir, server, base: `http://127.0.0.1:${server.address().port}` };
}

async function request(base, path, method, body, token) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = response.status === 204 ? null : await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test("clip downloads reject a symlinked export directory", async (t) => {
  const { dir, server, base } = await app();
  t.after(() => server.close());

  const user = await request(base, "/api/auth/register", "POST", {
    email: "download-export-symlink@example.com",
    password: "password-123"
  });

  const storage = server.clipQueue.storageDir;
  const exportsDir = join(storage, "exports");
  await mkdir(storage, { recursive: true });
  const outside = join(dir, "outside-exports");
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "clip-safe.mp4"), "protected");
  await rm(exportsDir, { recursive: true, force: true });
  await symlink(outside, exportsDir);

  await server.database.transaction((d) => d.clips.push({
    id: "clip-download-symlink",
    userId: user.body.user.id,
    videoId: "vid-download-symlink",
    projectId: "prj-download-symlink",
    sourceUrl: null,
    title: "Safe clip",
    status: "completed",
    downloadUrl: "/storage/exports/clip-safe.mp4",
    createdAt: new Date().toISOString()
  }));

  const response = await request(base, "/api/clips/clip-download-symlink/download", "GET", undefined, user.body.token);
  assert.equal(response.status, 403);
  assert.equal(await readFile(join(outside, "clip-safe.mp4"), "utf8"), "protected");
});
