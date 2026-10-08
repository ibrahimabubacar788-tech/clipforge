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
export async function register(db, firstName, lastName, email, password) {
  // Backward-compatible API: register(db, email, password). The current UI
  // sends the full first/last-name profile explicitly.
  if (email === undefined && password === undefined) {
    password = lastName;
    email = firstName;
  }
  if ((!firstName || !lastName) && email) {
    const localPart = String(email).split("@")[0].replace(/[^a-zA-Z0-9]+/g, " ").trim();
    firstName = firstName || localPart.split(/\s+/)[0] || "ClipForge";
    lastName = lastName || localPart.split(/\s+/).slice(1).join(" ") || "Creator";
  }
  const cleanFirstName = String(firstName || "").trim().replace(/\s+/g, " ");
  const cleanLastName = String(lastName || "").trim().replace(/\s+/g, " ");
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!cleanFirstName || cleanFirstName.length > 80 || !cleanLastName || cleanLastName.length > 80 || !/^\S+@\S+\.\S+$/.test(normalizedEmail) || typeof password !== "string" || password.length < 8 || password.length > 256) throw Object.assign(new Error("Use a valid email and a password with 8 to 256 characters."), { status: 422 });
  return db.transaction((data) => {
    if (data.users.some((u) => u.email === normalizedEmail)) throw Object.assign(new Error("That email is already registered."), { status: 409 });
    const salt = randomBytes(16).toString("hex"); const user = { id: id("usr"), email: normalizedEmail, firstName: cleanFirstName, lastName: cleanLastName, name: `${cleanFirstName} ${cleanLastName}`, salt, passwordHash: digest(password, salt), createdAt: now() };
    data.users.push(user); return user;
  });
}
export async function updateAccount(db, currentUser, email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || typeof password !== "string" || password.length < 8 || password.length > 256) throw Object.assign(new Error("Use a valid email and a password with 8 to 256 characters."), { status: 422 });
  return db.transaction((data) => {
    const user = data.users.find((item) => item.id === currentUser.id);
    if (!user) throw Object.assign(new Error("Authentication required."), { status: 401 });
    if (data.users.some((item) => item.id !== user.id && item.email === normalizedEmail)) throw Object.assign(new Error("That email is already registered."), { status: 409 });
    const salt = randomBytes(16).toString("hex");
    user.email = normalizedEmail;
    user.salt = salt;
    user.passwordHash = digest(password, salt);
    user.updatedAt = now();
    return user;
  });
}
export async function loginWithGoogle(db, credential) {
  const token = String(credential || "").trim();
  if (!token || token.length > 4096) throw Object.assign(new Error("Google sign-in could not be verified."), { status: 401 });
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (!response.ok) throw Object.assign(new Error("Google sign-in could not be verified."), { status: 401 });
  const profile = await response.json();
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) throw Object.assign(new Error("Google sign-in is not configured yet."), { status: 503 });
  if (profile.aud !== clientId || profile.email_verified !== "true" || !profile.sub || !profile.email) {
    throw Object.assign(new Error("Google sign-in could not be verified."), { status: 401 });
  }
  const normalizedEmail = String(profile.email).trim().toLowerCase();
  const user = await db.transaction((data) => {
    let existing = data.users.find((item) => item.email === normalizedEmail);
    if (!existing) {
      existing = { id: id("usr"), email: normalizedEmail, firstName: String(profile.given_name || "").trim().slice(0, 80), lastName: String(profile.family_name || "").trim().slice(0, 80), name: String(profile.name || normalizedEmail.split("@")[0]).trim().slice(0, 160), salt: "", passwordHash: "", createdAt: now(), authProvider: "google", googleSubject: profile.sub };
      data.users.push(existing);
    } else {
      existing.authProvider = existing.authProvider || "google";
      existing.googleSubject = existing.googleSubject || profile.sub;
      if (!existing.name && profile.name) existing.name = String(profile.name).trim().slice(0, 160);
      if (!existing.firstName && profile.given_name) existing.firstName = String(profile.given_name).trim().slice(0, 80);
      if (!existing.lastName && profile.family_name) existing.lastName = String(profile.family_name).trim().slice(0, 80);
    }
    return existing;
  });
  const sessionToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  await db.transaction((data) => {
    data.sessions = data.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
    data.sessions.push({ id: id("ses"), token: sessionToken, userId: user.id, expiresAt });
  });
  return { token: sessionToken, user };
}

export async function login(db, email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await db.read((d) => d.users.find((u) => u.email === normalizedEmail));
  if (!user || typeof password !== "string" || !matchesDigest(password, user.salt, user.passwordHash)) throw Object.assign(new Error("Invalid email or password."), { status: 401 });
  if (user.passwordHash.length !== 128) {
    await db.transaction((d) => {
      const current = d.users.find((u) => u.id === user.id);
      if (current && current.passwordHash.length !== 128) current.passwordHash = digest(password, current.salt);
    });
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  await db.transaction((d) => {
    d.sessions = d.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
    d.sessions.push({ id: id("ses"), token, userId: user.id, expiresAt });
  });
  return { token, user };
}
function sessionToken(req) {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (bearer) return bearer.length <= 256 ? bearer : "";
  const cookie = String(req.headers.cookie || "");
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("clipforge_session="));
  if (!match) return "";
  try {
    const token = decodeURIComponent(match.slice("clipforge_session=".length));
    return token.length <= 256 ? token : "";
  } catch {
    return "";
  }
}
export async function requireUser(req, db) {
  const token = sessionToken(req);
  const session = await db.read((d) => d.sessions.find((s) => s.token === token && Date.parse(s.expiresAt) > Date.now()));
  if (!session) throw Object.assign(new Error("Authentication required."), { status: 401 });
  const user = await db.read((d) => d.users.find((u) => u.id === session.userId));
  if (!user) throw Object.assign(new Error("Authentication required."), { status: 401 });
  return user;
}
export async function logout(req, db) { const token = sessionToken(req); await db.transaction((d) => { d.sessions = d.sessions.filter((s) => s.token !== token); }); }
