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
export function publicUser(user) { return { id: user.id, email: user.email, createdAt: user.createdAt, emailVerified: user.emailVerified !== false }; }
const verificationDigest = (email, code) => createHash("sha256").update(`${email}:${code}:${process.env.APP_SECRET || "clipforge-verification"}`).digest("hex");
const verificationCode = () => String(100000 + (randomBytes(4).readUInt32BE(0) % 900000));
export async function sendVerificationCode(db, user, { force = false } = {}) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM || "").trim();
  if (!apiKey || !from) throw Object.assign(new Error("Email verification is not configured yet."), { status: 503 });
  const current = await db.read((data) => data.users.find((item) => item.id === user.id));
  if (!current) throw Object.assign(new Error("Account not found."), { status: 404 });
  const sentAt = Date.parse(current.verificationSentAt || "");
  if (!force && Number.isFinite(sentAt) && Date.now() - sentAt < 60_000) {
    throw Object.assign(new Error("Please wait a minute before requesting another code."), { status: 429 });
  }
  const code = verificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await db.transaction((data) => {
    const item = data.users.find((entry) => entry.id === user.id);
    if (!item) throw Object.assign(new Error("Account not found."), { status: 404 });
    item.emailVerified = false;
    item.verificationCodeHash = verificationDigest(item.email, code);
    item.verificationExpiresAt = expiresAt;
    item.verificationAttempts = 0;
    item.verificationSentAt = now();
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: [current.email],
      subject: "Your ClipForge verification code",
      text: `Your ClipForge verification code is ${code}. It expires in 10 minutes. If you did not create this account, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#171827"><h1>ClipForge</h1><p>Verify your email to finish creating your account.</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px 20px;background:#f4f2ff;border-radius:12px;text-align:center">${code}</div><p>This code expires in 10 minutes. If you did not create this account, ignore this email.</p></div>`
    })
  });
  if (!response.ok) {
    await db.transaction((data) => {
      const item = data.users.find((entry) => entry.id === user.id);
      if (item) {
        item.verificationCodeHash = null;
        item.verificationExpiresAt = null;
      }
    });
    throw Object.assign(new Error("We could not send the verification email. Please try again."), { status: 502 });
  }
  return { expiresAt };
}
export async function verifyEmail(db, email, code) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const cleanCode = String(code || "").trim();
  const user = await db.read((data) => data.users.find((item) => item.email === normalizedEmail));
  if (!user) throw Object.assign(new Error("Verification request not found."), { status: 404 });
  if (user.emailVerified !== false) return user;
  if (!/^\d{6}$/.test(cleanCode)) throw Object.assign(new Error("Enter the 6-digit verification code."), { status: 422 });
  if (!user.verificationExpiresAt || Date.parse(user.verificationExpiresAt) <= Date.now()) throw Object.assign(new Error("That verification code has expired. Request a new one."), { status: 410 });
  if ((Number(user.verificationAttempts) || 0) >= 5) throw Object.assign(new Error("Too many incorrect codes. Request a new code."), { status: 429 });
  const expected = verificationDigest(normalizedEmail, cleanCode);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(String(user.verificationCodeHash || ""), "hex");
  const valid = a.length === b.length && timingSafeEqual(a, b);
  if (!valid) {
    await db.transaction((data) => {
      const item = data.users.find((entry) => entry.id === user.id);
      if (item) item.verificationAttempts = (Number(item.verificationAttempts) || 0) + 1;
    });
    throw Object.assign(new Error("That verification code is incorrect."), { status: 422 });
  }
  return db.transaction((data) => {
    const item = data.users.find((entry) => entry.id === user.id);
    if (!item) throw Object.assign(new Error("Account not found."), { status: 404 });
    item.emailVerified = true;
    item.emailVerifiedAt = now();
    item.verificationCodeHash = null;
    item.verificationExpiresAt = null;
    item.verificationAttempts = 0;
    item.verificationSentAt = null;
    return item;
  });
}
export async function deleteUnverifiedUser(db, userId) {
  await db.transaction((data) => {
    data.users = data.users.filter((item) => item.id !== userId || item.emailVerified !== false);
  });
}
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
  if (user.emailVerified === false) throw Object.assign(new Error("Please verify your email before logging in."), { status: 403 });
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
