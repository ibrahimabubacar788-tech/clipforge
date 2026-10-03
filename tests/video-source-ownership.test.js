import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-video-source-owner-"));
  const server = createApp({ root: process.cwd(), dbFile: join(dir, "db.json"), storageDir: join(dir, "storage") });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function request(base, path, method, body, token) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

test("video creation rejects a deferred source path owned by another user", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const first = await request(base, "/api/auth/register", "POST", { email: "source-owner-a@example.com", password: "password-123" });
  const second = await request(base, "/api/auth/register", "POST", { email: "source-owner-b@example.com", password: "password-123" });
  const project = await request(base, "/api/projects", "POST", { name: "Ownership" }, first.body.token);
  const sourceUrl = `/storage/uploads/${second.body.user.id}-future.mp4`;
  const response = await request(base, "/api/videos", "POST", { projectId: project.body.project.id, name: "Deferred foreign source", duration: 10, sourceUrl }, first.body.token);
  assert.equal(response.status, 403);
  assert.match(response.body.error, /only attach your own uploaded video/i);
});
