import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_URL = "";
process.env.DATABASE_SSL = "false";

const { createApp } = await import("../server/app.js");

async function startTestApp() {
  const root = await mkdtemp(join(tmpdir(), "clipforge-root-"));
  const storageDir = await mkdtemp(join(tmpdir(), "clipforge-storage-"));
  const dbFile = join(root, "clipforge.json");
  const app = createApp({ root: process.cwd(), dbFile, storageDir });
  await new Promise((resolve) => app.listen(0, resolve));
  const address = app.address();
  return {
    app,
    root,
    storageDir,
    base: `http://127.0.0.1:${address.port}`,
  };
}

async function stopTestApp(ctx) {
  await new Promise((resolve) => ctx.app.close(resolve));
  await ctx.app.database.close();
  await rm(ctx.root, { recursive: true, force: true });
  await rm(ctx.storageDir, { recursive: true, force: true });
}

test("ready endpoint reports a healthy ClipForge service", async () => {
  const ctx = await startTestApp();
  try {
    const response = await fetch(`${ctx.base}/api/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "clipforge",
      mediaStorage: { mode: "local", persistent: false },
    });
  } finally {
    await stopTestApp(ctx);
  }
});

test("authentication and project isolation work end to end", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "creator@example.com", password: "strong-pass-123" }),
    });
    assert.equal(register.status, 201);
    const auth = await register.json();
    assert.ok(auth.token);
    assert.ok(auth.user.id);

    const projects = await fetch(`${ctx.base}/api/projects`, {
      headers: { authorization: `Bearer ${auth.token}` },
    });
    assert.equal(projects.status, 200);
    assert.deepEqual((await projects.json()).projects, []);

    const created = await fetch(`${ctx.base}/api/projects`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Smoke Test Project" }),
    });
    assert.equal(created.status, 201);
    const project = (await created.json()).project;
    assert.equal(project.name, "Smoke Test Project");
    assert.equal(project.userId, auth.user.id);

    const unauthorized = await fetch(`${ctx.base}/api/projects`);
    assert.equal(unauthorized.status, 401);
  } finally {
    await stopTestApp(ctx);
  }
});

test("upload rejects non-video payloads before writing media", async () => {
  const ctx = await startTestApp();
  try {
    const register = await fetch(`${ctx.base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "uploader@example.com", password: "strong-pass-123" }),
    });
    const auth = await register.json();

    const upload = await fetch(`${ctx.base}/api/uploads`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "text/plain",
        "x-filename": "not-a-video.txt",
      },
      body: "not a video",
    });
    assert.equal(upload.status, 415);
  } finally {
    await stopTestApp(ctx);
  }
});
