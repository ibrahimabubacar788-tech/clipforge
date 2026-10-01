import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, unlink } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { pipeline } from "node:stream/promises";
import { JsonDatabase, id, now } from "./database.js";
import { login, logout, publicUser, register, requireUser } from "./auth.js";
import { ClipQueue } from "./queue.js";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".mp4": "video/mp4" };
const json = (res, status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
async function body(req) { let raw = ""; for await (const part of req) { raw += part; if (raw.length > 25_000_000) throw Object.assign(new Error("Request body too large."), { status: 413 }); } try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error("Malformed JSON body."), { status: 400 }); } }
const own = (items, user) => items.filter((item) => item.userId === user.id);
const requireRelative = (base, target) => {
  const normalizedBase = normalize(base).replace(/[\\/]$/, "");
  const normalizedTarget = normalize(target);
  if (normalizedTarget === normalizedBase) return "";
  return normalizedTarget.slice(normalizedBase.length + 1);
};
export function createApp({ root = process.cwd(), dbFile = join(process.cwd(), "data", "clipforge.json"), storageDir = join(process.cwd(), "storage") } = {}) {
  const db = new JsonDatabase(dbFile); const queue = new ClipQueue(db, storageDir);
  async function api(req, res, pathname) {
    const payload = ["POST", "PATCH"].includes(req.method) && pathname !== "/api/uploads" ? await body(req) : {};
    if (req.method === "GET" && pathname === "/api/ready") {
      await db.load();
      return json(res, 200, { ok: true, service: "clipforge" });
    }
    if (req.method === "POST" && pathname === "/api/auth/register") { const user = await register(db, payload.email, payload.password); const session = await login(db, payload.email, payload.password); return json(res, 201, { token: session.token, user: publicUser(user) }); }
    if (req.method === "POST" && pathname === "/api/auth/login") { const session = await login(db, payload.email, payload.password); return json(res, 200, { token: session.token, user: publicUser(session.user) }); }
    if (req.method === "POST" && pathname === "/api/auth/logout") { await logout(req, db); res.writeHead(204); res.end(); return; }
    const user = await requireUser(req, db);
    if (req.method === "GET" && pathname === "/api/me") return json(res, 200, { user: publicUser(user) });
    if (req.method === "GET" && pathname === "/api/projects") return json(res, 200, { projects: await db.read((d) => own(d.projects, user)) });
    if (req.method === "POST" && pathname === "/api/projects") { if (!String(payload.name || "").trim()) throw Object.assign(new Error("A project name is required."), { status: 422 }); const project = { id: id("prj"), userId: user.id, name: payload.name.trim(), createdAt: now(), updatedAt: now() }; await db.transaction((d) => d.projects.push(project)); return json(res, 201, { project }); }
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && req.method === "PATCH") { const project = await db.transaction((d) => { const p = d.projects.find((x) => x.id === projectMatch[1] && x.userId === user.id); if (!p) throw Object.assign(new Error("Project not found."), { status: 404 }); p.name = String(payload.name || p.name).trim(); p.updatedAt = now(); return p; }); return json(res, 200, { project }); }
    if (req.method === "POST" && pathname === "/api/videos") { const project = await db.read((d) => d.projects.find((p) => p.id === payload.projectId && p.userId === user.id)); if (!project) throw Object.assign(new Error("Project not found."), { status: 404 }); const sourceUrl = payload.sourceUrl || null; if (sourceUrl && (typeof sourceUrl !== "string" || !sourceUrl.startsWith("/storage/uploads/"))) throw Object.assign(new Error("Source video must reference an uploaded file."), { status: 422 }); const duration = Number(payload.duration); if (!Number.isFinite(duration) || duration <= 0) throw Object.assign(new Error("A valid video duration is required."), { status: 422 }); const video = { id: id("vid"), userId: user.id, projectId: project.id, name: String(payload.name || "Untitled video"), duration, sourceUrl, createdAt: now() }; await db.transaction((d) => d.videos.push(video)); return json(res, 201, { video }); }
    if (req.method === "POST" && pathname === "/api/uploads") {
      const user = await requireUser(req, db);
      const filename = String(req.headers["x-filename"] || "video.mp4").slice(0, 120).replace(/[^a-zA-Z0-9._-]/g, "_");
      const rawContentLength = req.headers["content-length"];
      const contentLength = rawContentLength === undefined ? null : Number(rawContentLength);
      const maxUploadBytes = 250 * 1024 * 1024;
      const contentType = String(req.headers["content-type"] || "").toLowerCase();
      if (!contentType.startsWith("video/")) throw Object.assign(new Error("Upload must be a video file."), { status: 415 });
      if (!Number.isFinite(contentLength) || contentLength < 0) throw Object.assign(new Error("Invalid content length."), { status: 400 });
      if (contentLength === 0) throw Object.assign(new Error("Upload body is empty."), { status: 400 });
      if (contentLength > maxUploadBytes) throw Object.assign(new Error("Upload is too large. Maximum size is 250 MB."), { status: 413 });
      await mkdir(join(storageDir, "uploads"), { recursive: true });
      const safe = `${user.id}-${id("upload")}-${filename}`;
      const target = join(storageDir, "uploads", safe);
      let bytes = 0;
      const limited = async function* () { for await (const chunk of req) { bytes += chunk.length; if (bytes > maxUploadBytes) throw Object.assign(new Error("Upload is too large. Maximum size is 250 MB."), { status: 413 }); yield chunk; } if (bytes === 0) throw Object.assign(new Error("Upload body is empty."), { status: 400 }); };
      try {
        await pipeline(limited(), createWriteStream(target));
      } catch (error) {
        await unlink(target).catch(() => {});
        throw error;
      }
      return json(res, 201, { url: `/storage/uploads/${safe}` });
    }
    const downloadMatch = pathname.match(/^\\/api\\/clips\\/([^/]+)\\/download$/);
    if (downloadMatch && req.method === "GET") {
      const clip = await db.read((d) => d.clips.find((c) => c.id === downloadMatch[1] && c.userId === user.id));
      if (!clip || !clip.downloadUrl) throw Object.assign(new Error("Clip export not found."), { status: 404 });
      const candidate = normalize(join(storageDir, clip.downloadUrl.slice("/storage/".length)));
      const exportDir = normalize(join(storageDir, "exports")); const relativeExport = requireRelative(exportDir, candidate); if (relativeExport.startsWith("..") || relativeExport.startsWith("/") || relativeExport.startsWith("\\")) throw Object.assign(new Error("Invalid export path."), { status: 403 });
      try {
        await access(candidate);
        res.writeHead(200, { "content-type": "video/mp4", "content-disposition": `attachment; filename="${clip.id}.mp4"` });
        return createReadStream(candidate).pipe(res);
      } catch {
        throw Object.assign(new Error("Clip export is no longer available on this server."), { status: 404 });
      }
    }
    if (req.method === "GET" && pathname === "/api/clips") { const clips = await db.read((d) => own(d.clips, user)); return json(res, 200, { clips: clips.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }); }
    if (req.method === "POST" && pathname === "/api/clips") { const video = await db.read((d) => d.videos.find((v) => v.id === payload.videoId && v.userId === user.id)); if (!video) throw Object.assign(new Error("Video not found. Create or upload a source video first."), { status: 404 }); if (!video.sourceUrl) throw Object.assign(new Error("Video has no uploaded source file."), { status: 422 }); const start = Number(payload.start), end = Number(payload.end); if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > video.duration) throw Object.assign(new Error("Clip range must be inside the source video."), { status: 422 }); const clip = { id: id("clip"), userId: user.id, videoId: video.id, projectId: video.projectId, sourceUrl: video.sourceUrl, title: String(payload.title || `${video.name} clip`), start, end, format: ["9:16", "1:1", "16:9"].includes(payload.format) ? payload.format : "9:16", captions: Boolean(payload.captions), style: payload.style || { color: "lime", weight: "bold" }, status: "queued", createdAt: now() }; await db.transaction((d) => d.clips.push(clip)); const job = await queue.enqueue(clip); return json(res, 202, { clip, job }); }
    const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/); if (jobMatch && req.method === "GET") { const job = await db.read((d) => d.jobs.find((j) => j.id === jobMatch[1] && d.clips.some((c) => c.id === j.clipId && c.userId === user.id))); if (!job) throw Object.assign(new Error("Job not found."), { status: 404 }); return json(res, 200, { job }); }
    const clipMatch = pathname.match(/^\/api\/clips\/([^/]+)$/); if (clipMatch && req.method === "DELETE") { const clip = await db.transaction((d) => { const item = d.clips.find((c) => c.id === clipMatch[1] && c.userId === user.id); if (!item) throw Object.assign(new Error("Clip not found."), { status: 404 }); d.clips = d.clips.filter((c) => c.id !== item.id); d.jobs = d.jobs.filter((j) => j.clipId !== item.id); return item; }); await queue.removeExport(clip.downloadUrl); res.writeHead(204); res.end(); return; }
    throw Object.assign(new Error("API route not found."), { status: 404 });
  }
  const server = createServer(async (req, res) => { try { const url = new URL(req.url, "http://localhost"); if (url.pathname.startsWith("/api/")) return await api(req, res, url.pathname); const isStorage = url.pathname.startsWith("/storage/"); if (isStorage) return json(res, 404, { error: "Not found" }); const baseDir = root;
      const candidate = normalize(join(baseDir, url.pathname === "/" ? "index.html" : url.pathname));
      const relativeCandidate = requireRelative(baseDir, candidate);
      if (relativeCandidate.startsWith("..") || relativeCandidate.startsWith("/") || relativeCandidate.startsWith("\\") ) return json(res, 403, { error: "Forbidden" }); try { await access(candidate); res.writeHead(200, { "content-type": mime[extname(candidate)] || "application/octet-stream" }); createReadStream(candidate).pipe(res); } catch { if (!isStorage) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); createReadStream(join(root, "index.html")).pipe(res); } } } catch (error) { json(res, error.status || 500, { error: error.message || "Internal server error" }); } });
  server.clipQueue = queue;
  server.database = db;
  return server;
}
