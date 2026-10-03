import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-upload-race-"));
  const server = createApp({
    root: process.cwd(),
    dbFile: join(dir, "db.json"),
    storageDir: join(dir, "storage")
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { dir, server, base: `http://127.0.0.1:${server.address().port}` };
}

function upload(base, token, chunks) {
  const body = new ReadableStream({
    async start(controller) {
      for (let index = 0; index < chunks.length; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, index * 5));
        controller.enqueue(Buffer.from(chunks[index]));
      }
      controller.close();
    }
  });
  return fetch(base + "/api/uploads", {
    method: "POST",
    headers: {
      "content-type": "video/mp4",
      "x-filename": "same.mp4",
      "x-upload-id": "three-way-retry",
      authorization: `Bearer ${token}`
    },
    duplex: "half",
    body
  });
}

test("three concurrent identical upload retries stay serialized and deduplicated", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const register = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "three-way-upload@example.com", password: "password-123" })
  });
  assert.equal(register.status, 201);
  const user = await register.json();

  const chunks = ["video-", "payload-", "same-content"];
  const responses = await Promise.all([
    upload(base, user.token, chunks),
    upload(base, user.token, chunks),
    upload(base, user.token, chunks)
  ]);

  const statuses = responses.map((response) => response.status).sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 200, 201]);

  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(new Set(bodies.map((body) => body.url)).size, 1);
  assert.equal(bodies.filter((body) => body.reused === true).length, 2);

  const uploaded = join(server.clipQueue.storageDir, "uploads", `${user.user.id}-three-way-retry-same.mp4`);
  assert.equal(await readFile(uploaded, "utf8"), chunks.join(""));
});
