import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-project-rename-"));
  const server = createApp({
    root: process.cwd(),
    dbFile: join(dir, "db.json"),
    storageDir: join(dir, "storage")
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function request(base, path, method = "GET", body = undefined, token = undefined) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await response.text();
  let parsed = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
  return { status: response.status, body: parsed };
}

async function workspace() {
  const state = await app();
  const email = `project-${crypto.randomUUID()}@clipforge.local`;
  const auth = await request(state.base, "/api/auth/register", "POST", {
    email,
    password: "correct-horse-battery-staple"
  });
  assert.equal(auth.status, 201);
  const project = await request(state.base, "/api/projects", "POST", { name: "Original project" }, auth.body.token);
  assert.equal(project.status, 201);
  return { ...state, token: auth.body.token, project: project.body.project };
}

test("project rename trims surrounding whitespace", async (t) => {
  const state = await workspace();
  t.after(() => state.server.close());

  const renamed = await request(
    state.base,
    `/api/projects/${state.project.id}`,
    "PATCH",
    { name: "   Clean project name   " },
    state.token
  );

  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.project.name, "Clean project name");
});

test("project rename rejects empty and oversized names", async (t) => {
  const state = await workspace();
  t.after(() => state.server.close());

  const empty = await request(
    state.base,
    `/api/projects/${state.project.id}`,
    "PATCH",
    { name: "   " },
    state.token
  );
  assert.equal(empty.status, 422);

  const oversized = await request(
    state.base,
    `/api/projects/${state.project.id}`,
    "PATCH",
    { name: "x".repeat(121) },
    state.token
  );
  assert.equal(oversized.status, 422);
});

test("project rename cannot modify another user's project", async (t) => {
  const first = await workspace();
  const second = await workspace();
  t.after(() => {
    first.server.close();
    second.server.close();
  });

  const attempt = await request(
    first.base,
    `/api/projects/${second.project.id}`,
    "PATCH",
    { name: "Unauthorized rename" },
    first.token
  );

  assert.equal(attempt.status, 404);
});
