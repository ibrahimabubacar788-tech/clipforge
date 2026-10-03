import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
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

  const port = server.address().port;
  const oversized = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let data = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { data += chunk; });
    socket.on("error", reject);
    socket.on("end", () => resolve(data));
    socket.on("connect", () => {
      socket.end([
        "POST /api/uploads HTTP/1.1",
        "Host: 127.0.0.1",
        `Authorization: Bearer ${user.body.token}`,
        "Content-Type: video/mp4",
        `Content-Length: ${250 * 1024 * 1024 + 1}`,
        "Connection: close",
        "",
        ""
      ].join("\r\n"));
    });
  });
  assert.match(oversized, /^HTTP\/1\.1 413 /);
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
  assert.doesNotMatch(body.url, /[/]unsafe name/);
  assert.equal(body.url.split("/").length, 4);
});


test("uploads reuse an identical retry safely", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", {
    email: "upload-retry@example.com",
    password: "password-123"
  });
  const headers = {
    authorization: "Bearer " + user.body.token,
    "content-type": "video/mp4",
    "x-filename": "retry.mp4",
    "x-upload-id": "same-retry"
  };
  const first = await fetch(base + "/api/uploads", { method: "POST", headers, body: Buffer.from("video") });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  const second = await fetch(base + "/api/uploads", { method: "POST", headers, body: Buffer.from("video") });
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.reused, true);
  assert.equal(secondBody.url, firstBody.url);
});
