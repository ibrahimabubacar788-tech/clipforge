import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-auto-clip-"));
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
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

test("automatic clipping rejects videos without an uploaded source", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());

  const registered = await request(base, "/api/auth/register", "POST", {
    email: "auto-clip-no-source@example.com",
    password: "password-123"
  });
  assert.equal(registered.status, 201);

  await server.database.transaction((d) => {
    d.projects.push({
      id: "prj-auto-validation",
      userId: registered.body.user.id,
      name: "Validation Project",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    d.videos.push({
      id: "vid-auto-validation",
      userId: registered.body.user.id,
      projectId: "prj-auto-validation",
      name: "Unuploaded Video",
      sourceUrl: "",
      duration: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  const response = await request(
    base,
    "/api/videos/vid-auto-validation/auto-clip",
    "POST",
    { limit: 99, format: "bad-format" },
    registered.body.token
  );

  assert.equal(response.status, 422);
  assert.match(response.body.error, /uploaded source/i);
});
