import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { id, now } from "./database.js";
const legacyDigest = (password, salt) => createHash("sha256").update(`${salt}:${password}`).digest("hex");
const digest = (password, salt) => scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
const matchesDigest = (password, salt, stored) => {
  const candidate = stored.length === 128 ? digest(password, salt) : legacyDigest(password, salt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(stored, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};
export function publicUser(user) { return { id: user.id, email: user.email, createdAt: user.createdAt }; }
export async function register(db, email, password) {
  if (!/^\S+@\S+\.\S+$/.test(email || "") || typeof password !== "string" || password.length < 8) throw Object.assign(new Error("Use a valid email and a password with at least 8 characters."), { status: 422 });
  return db.transaction((data) => {
    if (data.users.some((u) => u.email === email.toLowerCase())) throw Object.assign(new Error("That email is already registered."), { status: 409 });
    const salt = randomBytes(16).toString("hex"); const user = { id: id("usr"), email: email.toLowerCase(), salt, passwordHash: digest(password, salt), createdAt: now() };
    data.users.push(user); return user;
  });
}
export async function login(db, email, password) {
  const user = await db.read((d) => d.users.find((u) => u.email === String(email).toLowerCase()));
  if (!user || !matchesDigest(password || "", user.salt, user.passwordHash)) throw Object.assign(new Error("Invalid email or password."), { status: 401 });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  await db.transaction((d) => {
    d.sessions = d.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
    d.sessions.push({ id: id("ses"), token, userId: user.id, expiresAt });
  });
  return { token, user };
}
export async function requireUser(req, db) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const session = await db.read((d) => d.sessions.find((s) => s.token === token && Date.parse(s.expiresAt) > Date.now()));
  if (!session) throw Object.assign(new Error("Authentication required."), { status: 401 });
  const user = await db.read((d) => d.users.find((u) => u.id === session.userId));
  if (!user) throw Object.assign(new Error("Authentication required."), { status: 401 });
  return user;
}
export async function logout(req, db) { const token = req.headers.authorization?.replace(/^Bearer\s+/i, ""); await db.transaction((d) => { d.sessions = d.sessions.filter((s) => s.token !== token); }); }
