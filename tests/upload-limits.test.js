import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-upload-limits-"));
  const server = createApp({
    root: process.cwd(),
    dbFile: join(dir, "db.json"),
    storageDir: join(dir, "storage")
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function request(base, path, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body && JSON.stringify(body)
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json()
  };
}



test("uploads reject non-video content and oversized declared bodies", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", {
    email: "upload-limits@example.com",
    password: "password-123"
  });

  const badType = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: {
      authorization: `Bearer ${user.body.token}`,
      "content-type": "text/plain",
      "content-length": "4"
    },
    body: "test"
  });
  assert.equal(badType.status, 415);

  const oversized = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: {
      authorization: `Bearer ${user.body.token}`,
      "content-type": "video/mp4",
      "content-length": String(250 * 1024 * 1024 + 1)
    }
  });
  assert.equal(oversized.status, 413);
});

test("uploads sanitize filenames and retry IDs into a safe storage path", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", {
    email: "upload-names@example.com",
    password: "password-123"
  });

  const response = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: {
      authorization: `Bearer ${user.body.token}`,
      "content-type": "video/mp4",
      "x-filename": "../unsafe name?.mp4",
      "x-upload-id": "../retry/path"
    },
    body: Buffer.from("video")
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.url, /^\/storage\/uploads\/[^/]+$/);
  assert.doesNotMatch(body.url, /\.\.|[/]unsafe name/);
});
