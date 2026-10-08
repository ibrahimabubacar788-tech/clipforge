import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { JsonDatabase } from "../server/database.js";
import { createSession, login, logout, publicUser, register, requireUser, verifyEmail } from "../server/auth.js";

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

test("email verification marks an unverified account verified and creates a session", async () => {
  const db = await setup();
  const user = await register(db, "verify@example.com", "correct horse battery");
  const code = "123456";
  const previousSecret = process.env.APP_SECRET;
  process.env.APP_SECRET = "test-secret";
  await db.transaction((data) => {
    const item = data.users.find((entry) => entry.id === user.id);
    item.emailVerified = false;
    item.verificationCodeHash = createHash("sha256")
      .update(item.email + ":" + code + ":test-secret")
      .digest("hex");
    item.verificationExpiresAt = new Date(Date.now() + 60_000).toISOString();
    item.verificationAttempts = 0;
  });

  const verified = await verifyEmail(db, user.email, code);
  assert.equal(verified.emailVerified, true);
  assert.equal(verified.verificationCodeHash, null);

  const session = await createSession(db, verified);
  assert.equal(session.token.length > 20, true);
  assert.equal((await requireUser({ headers: { authorization: "Bearer " + session.token } }, db)).id, user.id);

  if (previousSecret === undefined) delete process.env.APP_SECRET;
  else process.env.APP_SECRET = previousSecret;
  await db.close();
});

test("expired verification codes are rejected", async () => {
  const db = await setup();
  const user = await register(db, "expired@example.com", "correct horse battery");
  await db.transaction((data) => {
    const item = data.users.find((entry) => entry.id === user.id);
    item.emailVerified = false;
    item.verificationCodeHash = "00".repeat(32);
    item.verificationExpiresAt = new Date(Date.now() - 1_000).toISOString();
    item.verificationAttempts = 0;
  });

  await assert.rejects(
    verifyEmail(db, user.email, "123456"),
    (error) => error?.status === 410
  );

  await db.close();
});
