import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonDatabase } from "../server/database.js";
import { login, logout, publicUser, register, requireUser } from "../server/auth.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-auth-"));
  const db = new JsonDatabase(join(dir, "db.json"));
  await db.load();
  return db;
}

test("register normalizes email and stores a password hash", async () => {
  const db = await setup();
  const user = await register(db, " User@Example.COM ", "correct horse battery");

  assert.equal(user.email, "user@example.com");
  assert.notEqual(user.passwordHash, "correct horse battery");
  assert.equal(user.passwordHash.length, 128);
  assert.deepEqual(publicUser(user), {
    id: user.id,
    email: "user@example.com",
    createdAt: user.createdAt,
    emailVerified: true
  });

  await db.close();
});

test("login creates a session and requireUser accepts bearer tokens", async () => {
  const db = await setup();
  const registered = await register(db, "user@example.com", "correct horse battery");
  const result = await login(db, "USER@EXAMPLE.COM", "correct horse battery");

  assert.equal(result.user.id, registered.id);
  assert.equal(result.token.length > 20, true);

  const user = await requireUser(
    { headers: { authorization: `Bearer ${result.token}` } },
    db
  );
  assert.equal(user.id, registered.id);

  await db.close();
});

test("requireUser accepts an encoded session cookie and logout revokes it", async () => {
  const db = await setup();
  await register(db, "user@example.com", "correct horse battery");
  const result = await login(db, "user@example.com", "correct horse battery");

  const request = {
    headers: {
      cookie: `theme=dark; clipforge_session=${encodeURIComponent(result.token)}`
    }
  };

  const user = await requireUser(request, db);
  assert.equal(user.email, "user@example.com");

  await logout(request, db);
  await assert.rejects(
    requireUser(request, db),
    (error) => error?.status === 401 && error?.message === "Authentication required."
  );

  await db.close();
});

test("invalid credentials and weak registration input are rejected", async () => {
  const db = await setup();

  await assert.rejects(
    register(db, "not-an-email", "short"),
    (error) => error?.status === 422
  );

  await register(db, "user@example.com", "correct horse battery");
  await assert.rejects(
    login(db, "user@example.com", "wrong password"),
    (error) => error?.status === 401
  );
  await assert.rejects(
    register(db, "USER@example.com", "another strong password"),
    (error) => error?.status === 409
  );

  await db.close();
});
