import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, realpath, stat, unlink } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";
import { pipeline } from "node:stream/promises";
import { JsonDatabase, id, now } from "./database.js";
import { login, logout, publicUser, register, requireUser } from "./auth.js";
const sessionCookie = (token, maxAge = 60 * 60 * 24 * 14) => `clipforge_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
import { ClipQueue } from "./queue.js";
import { rankHighlights, rankHighlightsWithAI } from "./highlights.js";
import { parseTimestampedTranscript, normalizeTranscript } from "./transcript.js";
import { transcribeVideo } from "./stt.js";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".m4v": "video/x-m4v", ".ogv": "video/ogg" };
const json = (res, status, value) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(JSON.stringify(value)); };
async function body(req) {
  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > 25_000_000) {
    throw Object.assign(new Error("Request body too large."), { status: 413 });
  }
  let raw = "";
  for await (const part of req) {
    raw += part;
    if (raw.length > 25_000_000) throw Object.assign(new Error("Request body too large."), { status: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("Malformed JSON body."), { status: 400 });
  }
}
const own = (items, user) => items.filter((item) => item.userId === user.id);
const requireRelative = (base, target) => relative(base, target);
export function createApp({ root = process.cwd(), dbFile = join(process.cwd(), "data", "clipforge.json"), storageDir = join(process.cwd(), "storage") } = {}) {
  const db = new JsonDatabase(dbFile); const queue = new ClipQueue(db, storageDir);
  const autoClipInFlight = new Set();
  async function api(req, res, pathname) {
    const payload = ["POST", "PATCH"].includes(req.method) && pathname !== "/api/uploads" ? await body(req) : {};
    if (req.method === "GET" && pathname === "/api/ready") {
      await db.load();
      const mediaPersistent = String(process.env.MEDIA_STORAGE_PERSISTENT || "").toLowerCase() === "true";
      return json(res, 200, { ok: true, service: "clipforge", mediaStorage: { mode: "local", persistent: mediaPersistent } });
    }
    if (req.method === "POST" && pathname === "/api/auth/register") { const user = await register(db, payload.email, payload.password); const session = await login(db, payload.email, payload.password); res.setHeader("set-cookie", sessionCookie(session.token)); return json(res, 201, { token: session.token, user: publicUser(user) }); }
    if (req.method === "POST" && pathname === "/api/auth/login") { const session = await login(db, payload.email, payload.password); res.setHeader("set-cookie", sessionCookie(session.token)); return json(res, 200, { token: session.token, user: publicUser(session.user) }); }
    if (req.method === "POST" && pathname === "/api/auth/logout") { await logout(req, db); res.setHeader("set-cookie", sessionCookie("", 0)); res.writeHead(204); res.end(); return; }
    const user = await requireUser(req, db);
    const bearerToken = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
    if (!req.headers.cookie && bearerToken) res.setHeader("set-cookie", sessionCookie(bearerToken));
    if (req.method === "GET" && pathname === "/api/me") return json(res, 200, { user: publicUser(user) });
    const videoStreamMatch = pathname.match(/^\/api\/videos\/([^/]+)\/stream$/);
    if (videoStreamMatch && req.method === "GET") {
      const video = await db.read((d) => d.videos.find((item) => item.id === videoStreamMatch[1] && item.userId === user.id));
      if (!video?.sourceUrl) throw Object.assign(new Error("Video not found."), { status: 404 });
      const relativePath = video.sourceUrl.slice("/storage/".length);
      const file = normalize(join(storageDir, relativePath));
      const storageRoot = normalize(storageDir).replace(/[\/]$/, "");
      if (!file.startsWith(storageRoot + "/") && !file.startsWith(storageRoot + "\\")) throw Object.assign(new Error("Invalid video path."), { status: 403 });
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) throw Object.assign(new Error("Video file is unavailable."), { status: 404 });
      const resolvedFile = await realpath(file).catch(() => null);
      const resolvedStorageRoot = await realpath(storageDir).catch(() => null);
      if (!resolvedFile || !resolvedStorageRoot) throw Object.assign(new Error("Video file is unavailable."), { status: 404 });
      const relativeResolved = requireRelative(resolvedStorageRoot, resolvedFile);
      if (relativeResolved.startsWith("..") || relativeResolved.startsWith("/") || relativeResolved.startsWith("\\")) throw Object.assign(new Error("Invalid video path."), { status: 403 });
      const total = info.size;
      const rangeHeader = String(req.headers.range || "");
      if (!rangeHeader) {
        res.writeHead(200, { "content-type": mime[extname(file).toLowerCase()] || "application/octet-stream", "content-length": total, "accept-ranges": "bytes" });
        createReadStream(file).pipe(res);
        return;
      }
      const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
      if (!match) throw Object.assign(new Error("Invalid range."), { status: 416 });
      const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
      const end = match[2] ? Number(match[2]) : total - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= total) {
        res.writeHead(416, { "content-range": `bytes */${total}` });
        res.end();
        return;
      }
      const boundedEnd = Math.min(end, total - 1);
      res.writeHead(206, { "content-type": mime[extname(file).toLowerCase()] || "application/octet-stream", "content-length": boundedEnd - start + 1, "content-range": `bytes ${start}-${boundedEnd}/${total}`, "accept-ranges": "bytes" });
      createReadStream(file, { start, end: boundedEnd }).pipe(res);
      return;
    }

    if (req.method === "GET" && pathname === "/api/projects") return json(res, 200, { projects: await db.read((d) => own(d.projects, user)) });
    const videosQuery = pathname.match(/^\/api\/videos$/);
    if (videosQuery && req.method === "GET") {
      const projectId = new URL(req.url, "http://clipforge.local").searchParams.get("projectId");
      return json(res, 200, { videos: await db.read((d) => own(d.videos, user).filter((video) => !projectId || video.projectId === projectId)) });
    }

    const autoTranscriptMatch = pathname.match(/^\/api\/videos\/([^/]+)\/transcribe$/);
    if (req.method === "POST" && autoTranscriptMatch) {
      const video = await db.read((d) => d.videos.find((item) => item.id === autoTranscriptMatch[1] && item.userId === user.id));
      if (!video) throw Object.assign(new Error("Video not found."), { status: 404 });
      if (!video.sourceUrl) throw Object.assign(new Error("Video has no uploaded source file."), { status: 422 });
      const source = normalize(join(storageDir, video.sourceUrl.slice("/storage/".length)));
      const storageRoot = normalize(storageDir).replace(/[\\/]$/, "");
      if (!source.startsWith(storageRoot + "/") && !source.startsWith(storageRoot + "\\")) throw Object.assign(new Error("Invalid video path."), { status: 403 });
      const resolvedSource = await realpath(source).catch(() => null);
      const resolvedStorageRoot = await realpath(storageDir).catch(() => null);
      if (!resolvedSource || !resolvedStorageRoot) throw Object.assign(new Error("Video file is unavailable."), { status: 404 });
      const relativeResolved = requireRelative(resolvedStorageRoot, resolvedSource);
      if (relativeResolved.startsWith("..") || relativeResolved.startsWith("/") || relativeResolved.startsWith("\\")) throw Object.assign(new Error("Invalid video path."), { status: 403 });
      const transcript = await transcribeVideo({ source, ffmpegPath: queue.ffmpegPath });
      if (!transcript.length) throw Object.assign(new Error("No speech was detected in the video."), { status: 422 });
      await db.transaction((d) => {
        const item = d.videos.find((entry) => entry.id === video.id && entry.userId === user.id);
        item.transcript = transcript;
        item.transcriptFormat = "auto-stt";
        item.transcriptUpdatedAt = now();
      });
      return json(res, 200, { videoId: video.id, count: transcript.length, transcript, provider: "openai" });
    }

    const transcriptMatch = pathname.match(/^\/api\/videos\/([^/]+)\/transcript$/);
    if (req.method === "POST" && transcriptMatch) {
      const video = await db.read((d) => d.videos.find((item) => item.id === transcriptMatch[1] && item.userId === user.id));
      if (!video) throw Object.assign(new Error("Video not found."), { status: 404 });
      const format = ["auto", "srt", "vtt", "plain"].includes(payload.format) ? payload.format : "auto";
      const segments = normalizeTranscript(Array.isArray(payload.segments) ? payload.segments : parseTimestampedTranscript(payload.text || "", format));
      if (!segments.length) throw Object.assign(new Error("No valid transcript cues were found."), { status: 422 });
      await db.transaction((d) => {
        const item = d.videos.find((entry) => entry.id === video.id && entry.userId === user.id);
        item.transcript = segments;
        item.transcriptFormat = format;
        item.transcriptUpdatedAt = now();
      });
      return json(res, 200, { videoId: video.id, count: segments.length, transcript: segments });
    }

    const autoClipStatusMatch = pathname.match(/^\/api\/videos\/([^/]+)\/auto-clip-status$/);
    if (req.method === "GET" && autoClipStatusMatch) {
      const video = await db.read((d) => d.videos.find((item) => item.id === autoClipStatusMatch[1] && item.userId === user.id));
      if (!video) throw Object.assign(new Error("Video not found."), { status: 404 });
      const result = await db.read((d) => {
        const clips = d.clips.filter((item) => item.videoId === video.id && item.userId === user.id && item.generation === "auto-ai");
        const jobs = d.jobs.filter((job) => clips.some((clip) => clip.id === job.clipId));
        return { clips, jobs };
      });
      const counts = result.clips.reduce((acc, clip) => { acc[clip.status] = (acc[clip.status] || 0) + 1; return acc; }, {});
      const jobsByClip = new Map(result.jobs.map((job) => [job.clipId, job]));
      const clips = result.clips.map((clip) => {
        const job = jobsByClip.get(clip.id);
        return job ? { ...clip, renderProgress: Number(job.progress) || 0, renderJobStatus: job.status } : clip;
      });
      return json(res, 200, {
        videoId: video.id,
        analysisInProgress: autoClipInFlight.has(video.id),
        transcriptReady: Array.isArray(video.transcript) && video.transcript.length > 0,
        total: clips.length,
        ready: counts.ready || 0,
        processing: (counts.processing || 0) + (counts.queued || 0),
        failed: counts.failed || 0,
        clips,
        jobs: result.jobs,
      });
    }

    const autoClipMatch = pathname.match(/^\/api\/videos\/([^/]+)\/auto-clip$/);
    if (req.method === "POST" && autoClipMatch) {
      const video = await db.read((d) => d.videos.find((item) => item.id === autoClipMatch[1] && item.userId === user.id));
      if (!video) throw Object.assign(new Error("Video not found."), { status: 404 });
      if (!video.sourceUrl) throw Object.assign(new Error("Video has no uploaded source file."), { status: 422 });

      const limit = Math.max(1, Math.min(20, Number(payload.limit) || 12));
      const format = ["9:16", "1:1", "16:9"].includes(payload.format) ? payload.format : "9:16";
      if (autoClipInFlight.has(video.id)) {
        throw Object.assign(new Error("Automatic clipping is already running for this video."), { status: 409 });
      }
      autoClipInFlight.add(video.id);
      try {
        const existingAutoClipsBeforeAnalysis = await db.read((d) => d.clips.filter((clip) =>
          clip.videoId === video.id &&
          clip.userId === user.id &&
          clip.generation === "auto-ai"
        ));
        const activeAutoClipsBeforeAnalysis = existingAutoClipsBeforeAnalysis.filter((clip) => clip.status !== "failed");
        if (activeAutoClipsBeforeAnalysis.length > 0) {
          if (existingAutoClipsBeforeAnalysis.some((clip) => clip.status === "failed")) {
            const failedIds = new Set(existingAutoClipsBeforeAnalysis.filter((clip) => clip.status === "failed").map((clip) => clip.id));
            await db.transaction((d) => {
              d.clips = d.clips.filter((clip) => !failedIds.has(clip.id));
              d.jobs = d.jobs.filter((job) => !failedIds.has(job.clipId));
            });
          }
          const existingJobMap = new Map(await db.read((d) => d.jobs.filter((job) => activeAutoClipsBeforeAnalysis.some((clip) => clip.id === job.clipId)).map((job) => [job.clipId, job])));
          return json(res, 200, {
            videoId: video.id,
            engine: "clipforge-auto-existing",
            aiEngine: activeAutoClipsBeforeAnalysis[0].aiEngine || null,
            aiFallback: activeAutoClipsBeforeAnalysis[0].aiFallback === true,
            aiError: activeAutoClipsBeforeAnalysis[0].aiError || null,
            transcribed: false,
            transcriptCount: Array.isArray(video.transcript) ? video.transcript.length : 0,
            requested: limit,
            generated: activeAutoClipsBeforeAnalysis.length,
            clips: activeAutoClipsBeforeAnalysis.slice(0, limit).map((clip) => ({ clip, job: existingJobMap.get(clip.id) || null })),
            reused: true,
          });
        }
        let segments = normalizeTranscript(Array.isArray(video.transcript) ? video.transcript : []);
        let transcribed = false;
        if (!segments.length) {
          const source = normalize(join(storageDir, video.sourceUrl.slice("/storage/".length)));
          const storageRoot = normalize(storageDir).replace(/[\\/]$/, "");
          if (!source.startsWith(storageRoot + "/") && !source.startsWith(storageRoot + "\\")) {
            throw Object.assign(new Error("Invalid video path."), { status: 403 });
          }
          const resolvedSource = await realpath(source).catch(() => null);
          const resolvedStorageRoot = await realpath(storageDir).catch(() => null);
          if (!resolvedSource || !resolvedStorageRoot) throw Object.assign(new Error("Video file is unavailable."), { status: 404 });
          const relativeResolved = requireRelative(resolvedStorageRoot, resolvedSource);
          if (relativeResolved.startsWith("..") || relativeResolved.startsWith("/") || relativeResolved.startsWith("\\")) throw Object.assign(new Error("Invalid video path."), { status: 403 });
          segments = await transcribeVideo({ source, ffmpegPath: queue.ffmpegPath, language: payload.language || "en" });
          if (!segments.length) throw Object.assign(new Error("No speech was detected in the video."), { status: 422 });
          transcribed = true;
          await db.transaction((d) => {
            const item = d.videos.find((entry) => entry.id === video.id && entry.userId === user.id);
            item.transcript = segments;
            item.transcriptFormat = "auto-stt";
            item.transcriptUpdatedAt = now();
          });
        }

      const existingAutoClips = await db.read((d) => d.clips.filter((clip) =>
          clip.videoId === video.id &&
          clip.userId === user.id &&
          clip.generation === "auto-ai"
        ));
        const activeAutoClips = existingAutoClips.filter((clip) => clip.status !== "failed");
        if (activeAutoClips.length > 0) {
          if (existingAutoClips.some((clip) => clip.status === "failed")) {
            await db.transaction((d) => {
              const failedIds = new Set(d.clips.filter((clip) =>
                clip.videoId === video.id &&
                clip.userId === user.id &&
                clip.generation === "auto-ai" &&
                clip.status === "failed"
              ).map((clip) => clip.id));
              d.clips = d.clips.filter((clip) => !failedIds.has(clip.id));
              d.jobs = d.jobs.filter((job) => !failedIds.has(job.clipId));
            });
          }
          const existingJobMap = new Map(await db.read((d) => d.jobs.filter((job) => activeAutoClips.some((clip) => clip.id === job.clipId)).map((job) => [job.clipId, job])));
          return json(res, 200, {
            videoId: video.id,
            engine: "clipforge-auto-existing",
            aiEngine: activeAutoClips[0].aiEngine || null,
            aiFallback: activeAutoClips[0].aiFallback === true,
            aiError: activeAutoClips[0].aiError || null,
            transcribed,
            transcriptCount: segments.length,
            requested: limit,
            generated: activeAutoClips.length,
            clips: activeAutoClips.slice(0, limit).map((clip) => ({
              clip,
              job: existingJobMap.get(clip.id) || null,
            })),
            reused: true,
          });
        }
      if (existingAutoClips.length && activeAutoClips.length === 0) {
        await db.transaction((d) => {
          const failedIds = new Set(d.clips.filter((clip) =>
            clip.videoId === video.id &&
            clip.userId === user.id &&
            clip.generation === "auto-ai" &&
            clip.status === "failed"
          ).map((clip) => clip.id));
          d.clips = d.clips.filter((clip) => !failedIds.has(clip.id));
          d.jobs = d.jobs.filter((job) => !failedIds.has(job.clipId));
        });
      }
      const videoDuration = Number(video.duration);
      const maxClipDuration = Math.min(75, Math.max(20, Number.isFinite(videoDuration) && videoDuration > 0 ? videoDuration : 75));
      const analysis = await rankHighlightsWithAI(segments, {
        limit,
        minDuration: 15,
        maxDuration: maxClipDuration,
      });
      const candidates = analysis.candidates.filter((candidate) => {
        const start = Number(candidate.start);
        const end = Number(candidate.end);
        return Number.isFinite(start) && Number.isFinite(end)
          && start >= 0
          && end > start
          && (!Number.isFinite(videoDuration) || videoDuration <= 0 || end <= videoDuration)
          && end - start >= 15
          && end - start <= maxClipDuration;
      });
      if (!candidates.length) throw Object.assign(new Error("The AI could not find enough valid moments inside this video."), { status: 422 });

      const created = [];
      for (const candidate of candidates) {
        const clip = {
          id: id("clip"),
          userId: user.id,
          videoId: video.id,
          projectId: video.projectId,
          sourceUrl: video.sourceUrl,
          title: candidate.title,
          start: candidate.start,
          end: candidate.end,
          format,
          captions: true,
          captionSegments: candidate.captionSegments,
          style: payload.style || { color: "lime", weight: "bold" },
          status: "queued",
          generation: "auto-ai",
          aiEngine: analysis.engine,
          aiFallback: analysis.engine !== "openai-highlights-v1",
          aiError: analysis.aiError || null,
          highlightRank: candidate.rank,
          highlightScore: candidate.score,
          createdAt: now(),
        };
        await db.transaction((d) => d.clips.push(clip));
        let job;
        try {
          job = await queue.enqueue(clip);
        } catch (error) {
          await db.transaction((d) => {
            d.clips = d.clips.filter((item) => item.id !== clip.id);
            d.jobs = d.jobs.filter((item) => item.clipId !== clip.id);
          });
          throw error;
        }
        created.push({ clip, job });
      }

      return json(res, 202, {
        videoId: video.id,
        engine: analysis.engine === "openai-highlights-v1" ? "clipforge-auto-v3" : "clipforge-auto-v2",
        aiEngine: analysis.engine,
        aiFallback: analysis.engine !== "openai-highlights-v1",
        aiError: analysis.aiError || null,
        transcribed,
        transcriptCount: segments.length,
        requested: limit,
        generated: created.length,
        clips: created,
      });
      } finally {
        autoClipInFlight.delete(video.id);
      }
    }

    const generateMatch = pathname.match(/^\/api\/videos\/([^/]+)\/generate-clips$/);
    if (req.method === "POST" && generateMatch) {
      const video = await db.read((d) => d.videos.find((item) => item.id === generateMatch[1] && item.userId === user.id));
      if (!video) throw Object.assign(new Error("Video not found."), { status: 404 });
      if (!video.sourceUrl) throw Object.assign(new Error("Video has no uploaded source file."), { status: 422 });
      const segments = normalizeTranscript(Array.isArray(payload.segments) && payload.segments.length ? payload.segments : video.transcript || []);
      if (!segments.length) throw Object.assign(new Error("Add or import a transcript before generating clips."), { status: 422 });
      const limit = Math.max(1, Math.min(40, Number(payload.limit) || 40));
      const format = ["9:16", "1:1", "16:9"].includes(payload.format) ? payload.format : "9:16";
      const candidates = rankHighlights(segments, {
        limit,
        minDuration: 15,
        maxDuration: Math.min(75, Math.max(20, Number(video.duration) || 75)),
      });
      const created = [];
      for (const candidate of candidates) {
        const clip = {
          id: id("clip"),
          userId: user.id,
          videoId: video.id,
          projectId: video.projectId,
          sourceUrl: video.sourceUrl,
          title: candidate.title,
          start: candidate.start,
          end: candidate.end,
          format,
          captions: true,
          captionSegments: candidate.captionSegments,
          style: payload.style || { color: "lime", weight: "bold" },
          status: "queued",
          highlightRank: candidate.rank,
          highlightScore: candidate.score,
          createdAt: now(),
        };
        await db.transaction((d) => d.clips.push(clip));
        const job = await queue.enqueue(clip);
        created.push({ clip, job });
      }
      return json(res, 202, {
        videoId: video.id,
        engine: "clipforge-highlight-v1",
        requested: limit,
        generated: created.length,
        clips: created,
      });
    }

    const analyzeMatch = pathname.match(/^\/api\/videos\/([^/]+)\/analyze$/);
    if (req.method === "POST" && analyzeMatch) {
      const video = await db.read((d) => d.videos.find((item) => item.id === analyzeMatch[1] && item.userId === user.id));
      if (!video) throw Object.assign(new Error("Video not found."), { status: 404 });
      const segments = Array.isArray(payload.segments) ? payload.segments : [];
      if (!segments.length) throw Object.assign(new Error("Transcript segments are required for highlight analysis."), { status: 422 });
      const limit = Math.max(1, Math.min(40, Number(payload.limit) || 40));
      const candidates = rankHighlights(segments, { limit, minDuration: 15, maxDuration: Math.min(75, Math.max(20, Number(video.duration) || 75)) });
      return json(res, 200, { videoId: video.id, engine: "clipforge-highlight-v1", candidates, count: candidates.length });
    }

    if (req.method === "POST" && pathname === "/api/projects") { const name = String(payload.name || "").trim(); if (!name) throw Object.assign(new Error("A project name is required."), { status: 422 }); if (name.length > 120) throw Object.assign(new Error("Project name must be 120 characters or fewer."), { status: 422 }); const project = { id: id("prj"), userId: user.id, name, createdAt: now(), updatedAt: now() }; await db.transaction((d) => d.projects.push(project)); return json(res, 201, { project }); }
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && req.method === "DELETE") {
      const removed = await db.transaction((d) => {
        const project = d.projects.find((item) => item.id === projectMatch[1] && item.userId === user.id);
        if (!project) throw Object.assign(new Error("Project not found."), { status: 404 });
        if (d.projects.filter((item) => item.userId === user.id).length <= 1) throw Object.assign(new Error("At least one project must remain."), { status: 409 });
        const videos = d.videos.filter((item) => item.projectId === project.id && item.userId === user.id);
        const videoIds = new Set(videos.map((item) => item.id));
        if (videos.some((item) => autoClipInFlight.has(item.id))) throw Object.assign(new Error("A video in this project is still being processed."), { status: 409 });
        const clips = d.clips.filter((item) => videoIds.has(item.videoId) && item.userId === user.id);
        if (clips.some((clip) => d.jobs.some((job) => job.clipId === clip.id && ["queued", "processing"].includes(job.status)))) throw Object.assign(new Error("A clip in this project is currently rendering."), { status: 409 });
        d.projects = d.projects.filter((item) => item.id !== project.id);
        d.videos = d.videos.filter((item) => !videoIds.has(item.id));
        d.clips = d.clips.filter((item) => !clips.some((clip) => clip.id === item.id));
        d.jobs = d.jobs.filter((job) => !clips.some((clip) => clip.id === job.clipId));
        return { videos, clips };
      });
      for (const clip of removed.clips) await queue.removeExport(clip.downloadUrl);
      for (const video of removed.videos) {
        if (!video.sourceUrl) continue;
        const source = normalize(join(storageDir, video.sourceUrl.slice("/storage/".length)));
        const storageRoot = normalize(storageDir).replace(/[\\/]$/, "");
        const stillReferenced = await db.read((d) => d.videos.some((item) => item.sourceUrl === video.sourceUrl));
        const relativeSource = requireRelative(storageRoot, source); if (!stillReferenced && !relativeSource.startsWith("..") && !relativeSource.startsWith("/") && !relativeSource.startsWith("\\")) await unlink(source).catch(() => {});
      }
      res.writeHead(204); res.end(); return;
    }

    if (projectMatch && req.method === "PATCH") { const project = await db.transaction((d) => { const p = d.projects.find((x) => x.id === projectMatch[1] && x.userId === user.id); if (!p) throw Object.assign(new Error("Project not found."), { status: 404 }); const name = String(payload.name ?? "").trim(); if (!name) throw Object.assign(new Error("A project name is required."), { status: 422 }); if (name.length > 120) throw Object.assign(new Error("Project name must be 120 characters or fewer."), { status: 422 }); p.name = name; p.updatedAt = now(); return p; }); return json(res, 200, { project }); }
    const videoDeleteMatch = pathname.match(/^\/api\/videos\/([^/]+)$/);
    if (videoDeleteMatch && req.method === "DELETE") {
      const removed = await db.transaction((d) => {
        const video = d.videos.find((item) => item.id === videoDeleteMatch[1] && item.userId === user.id);
        if (!video) throw Object.assign(new Error("Video not found."), { status: 404 });
        if (autoClipInFlight.has(video.id)) throw Object.assign(new Error("Automatic clipping is still running for this video."), { status: 409 });
        const clips = d.clips.filter((item) => item.videoId === video.id && item.userId === user.id);
        if (clips.some((clip) => d.jobs.some((job) => job.clipId === clip.id && ["queued", "processing"].includes(job.status)))) throw Object.assign(new Error("A clip in this video is currently rendering."), { status: 409 });
        d.videos = d.videos.filter((item) => item.id !== video.id);
        d.clips = d.clips.filter((item) => item.videoId !== video.id || item.userId !== user.id);
        d.jobs = d.jobs.filter((job) => !clips.some((clip) => clip.id === job.clipId));
        return { video, clips };
      });
      for (const clip of removed.clips) await queue.removeExport(clip.downloadUrl);
      if (removed.video.sourceUrl) {
        const source = normalize(join(storageDir, removed.video.sourceUrl.slice("/storage/".length)));
        const storageRoot = normalize(storageDir).replace(/[\\/]$/, "");
        const stillReferenced = await db.read((d) => d.videos.some((item) => item.sourceUrl === removed.video.sourceUrl));
        const relativeSource = requireRelative(storageRoot, source); if (!stillReferenced && !relativeSource.startsWith("..") && !relativeSource.startsWith("/") && !relativeSource.startsWith("\\")) await unlink(source).catch(() => {});
      }
      res.writeHead(204); res.end(); return;
    }

    if (req.method === "POST" && pathname === "/api/videos") { const project = await db.read((d) => d.projects.find((p) => p.id === payload.projectId && p.userId === user.id)); if (!project) throw Object.assign(new Error("Project not found."), { status: 404 }); const sourceUrl = payload.sourceUrl || null; let source; if (sourceUrl && (typeof sourceUrl !== "string" || !sourceUrl.startsWith("/storage/uploads/"))) throw Object.assign(new Error("Source video must reference an uploaded file."), { status: 422 }); if (sourceUrl) { const uploadName = sourceUrl.slice("/storage/uploads/".length); source = normalize(join(storageDir, "uploads", uploadName)); const uploadsRoot = normalize(join(storageDir, "uploads")).replace(/[\\/]$/, ""); if (!source.startsWith(uploadsRoot + "/") && !source.startsWith(uploadsRoot + "\\")) throw Object.assign(new Error("Invalid uploaded video path."), { status: 403 }); const info = await stat(source).catch(() => null); if (info?.isFile()) { const resolvedSource = await realpath(source).catch(() => null); const resolvedUploadsRoot = await realpath(join(storageDir, "uploads")).catch(() => null); if (!resolvedSource || !resolvedUploadsRoot) throw Object.assign(new Error("Invalid uploaded video path."), { status: 403 }); const relativeResolved = requireRelative(resolvedUploadsRoot, resolvedSource); if (relativeResolved.startsWith("..") || relativeResolved.startsWith("/") || relativeResolved.startsWith("\\")) throw Object.assign(new Error("Invalid uploaded video path."), { status: 403 }); if (!uploadName.startsWith(user.id + "-")) throw Object.assign(new Error("You can only attach your own uploaded video."), { status: 403 }); } } const duration = Number(payload.duration); if (!Number.isFinite(duration) || duration <= 0) throw Object.assign(new Error("A valid video duration is required."), { status: 422 }); const video = { id: id("vid"), userId: user.id, projectId: project.id, name: String(payload.name || "Untitled video"), duration, sourceUrl, createdAt: now() }; try { await db.transaction((d) => d.videos.push(video)); } catch (error) { if (source) { const stillReferenced = await db.read((d) => d.videos.some((item) => item.sourceUrl === sourceUrl)); if (!stillReferenced) await unlink(source).catch(() => {}); } throw error; } return json(res, 201, { video }); }
if (req.method === "POST" && pathname === "/api/uploads") {
      const user = await requireUser(req, db);
      const filename = String(req.headers["x-filename"] || "video.mp4").slice(0, 120).replace(/[^a-zA-Z0-9._-]/g, "_");
      const rawContentLength = req.headers["content-length"];
      const contentLength = rawContentLength === undefined ? null : Number(rawContentLength);
      const maxUploadBytes = 250 * 1024 * 1024;
      const contentType = String(req.headers["content-type"] || "").toLowerCase();
      if (!contentType.startsWith("video/")) throw Object.assign(new Error("Upload must be a video file."), { status: 415 });
      if (contentLength !== null && (!Number.isFinite(contentLength) || contentLength < 0)) throw Object.assign(new Error("Invalid content length."), { status: 400 });
      if (contentLength === 0) throw Object.assign(new Error("Upload body is empty."), { status: 400 });
      if (contentLength !== null && contentLength > maxUploadBytes) throw Object.assign(new Error("Upload is too large. Maximum size is 250 MB."), { status: 413 });
      await mkdir(join(storageDir, "uploads"), { recursive: true });
      const requestedUploadId = String(req.headers["x-upload-id"] || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
      const uploadId = requestedUploadId || id("upload");
      const safe = `${user.id}-${uploadId}-${filename}`;
      const target = join(storageDir, "uploads", safe);
      const existing = await stat(target).catch(() => null);
      if (existing?.isFile() && contentLength !== null && existing.size === contentLength) {
        return json(res, 200, { url: `/storage/uploads/${safe}`, reused: true });
      }
      let bytes = 0;
      const limited = async function* () { for await (const chunk of req) { bytes += chunk.length; if (bytes > maxUploadBytes) throw Object.assign(new Error("Upload is too large. Maximum size is 250 MB."), { status: 413 }); yield chunk; } if (bytes === 0) throw Object.assign(new Error("Upload body is empty."), { status: 400 }); };
      try {
        await pipeline(limited(), createWriteStream(target, { flags: "wx" }));
      } catch (error) {
        if (error?.code === "EEXIST") {
          const concurrent = await stat(target).catch(() => null);
          if (concurrent?.isFile() && contentLength !== null && concurrent.size === contentLength) {
            return json(res, 200, { url: `/storage/uploads/${safe}`, reused: true });
          }
          throw Object.assign(new Error("An upload with this retry ID is already in progress or conflicts with different content."), { status: 409 });
        }
        await unlink(target).catch(() => {});
        throw error;
      }
      return json(res, 201, { url: `/storage/uploads/${safe}` });
    }
    const downloadMatch = pathname.match(/^\/api\/clips\/([^/]+)\/download$/);
    if (downloadMatch && req.method === "GET") {
      const clip = await db.read((d) => d.clips.find((c) => c.id === downloadMatch[1] && c.userId === user.id));
      if (!clip || !clip.downloadUrl) throw Object.assign(new Error("Clip export not found."), { status: 404 });
      const candidate = normalize(join(storageDir, clip.downloadUrl.slice("/storage/".length)));
      const exportDir = normalize(join(storageDir, "exports"));
      const relativeExport = requireRelative(exportDir, candidate);
      if (relativeExport.startsWith("..") || relativeExport.startsWith("/") || relativeExport.startsWith("\\")) throw Object.assign(new Error("Invalid export path."), { status: 403 });
      try {
        await access(candidate);
        const resolvedCandidate = await realpath(candidate);
        const resolvedExportDir = await realpath(exportDir);
        const relativeResolved = requireRelative(resolvedExportDir, resolvedCandidate);
        if (relativeResolved.startsWith("..") || relativeResolved.startsWith("/") || relativeResolved.startsWith("\\")) throw Object.assign(new Error("Invalid export path."), { status: 403 });
        const downloadName = String(clip.title || "ClipForge clip").replace(/[<>:"/\|?* -]/g, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 100) || "ClipForge clip";
        res.writeHead(200, { "content-type": "video/mp4", "content-disposition": `attachment; filename="${downloadName}.mp4"` });
        return createReadStream(candidate).pipe(res);
      } catch (error) {
        if (error?.status === 403) throw error;
        throw Object.assign(new Error("Clip export is no longer available on this server."), { status: 404 });
      }
    }
    if (req.method === "GET" && pathname === "/api/clips") { const clips = await db.read((d) => own(d.clips, user)); return json(res, 200, { clips: clips.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }); }
    if (req.method === "POST" && pathname === "/api/clips") { const video = await db.read((d) => d.videos.find((v) => v.id === payload.videoId && v.userId === user.id)); if (!video) throw Object.assign(new Error("Video not found. Create or upload a source video first."), { status: 404 }); if (!video.sourceUrl) throw Object.assign(new Error("Video has no uploaded source file."), { status: 422 }); const start = Number(payload.start), end = Number(payload.end); if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > video.duration) throw Object.assign(new Error("Clip range must be inside the source video."), { status: 422 }); const clip = { id: id("clip"), userId: user.id, videoId: video.id, projectId: video.projectId, sourceUrl: video.sourceUrl, title: String(payload.title || `${video.name} clip`), start, end, format: ["9:16", "1:1", "16:9"].includes(payload.format) ? payload.format : "9:16", captions: Boolean(payload.captions), captionSegments: Array.isArray(payload.captionSegments) ? payload.captionSegments : [], style: payload.style || { color: "lime", weight: "bold" }, status: "queued", createdAt: now() }; await db.transaction((d) => d.clips.push(clip)); const job = await queue.enqueue(clip); return json(res, 202, { clip, job }); }
    const retryMatch = pathname.match(/^\/api\/clips\/([^/]+)\/retry$/);
    if (retryMatch && req.method === "POST") {
      const { clip, previousDownloadUrl } = await db.transaction((d) => {
        const item = d.clips.find((x) => x.id === retryMatch[1] && x.userId === user.id);
        if (!item) throw Object.assign(new Error("Clip not found."), { status: 404 });
        if (item.status !== "failed") throw Object.assign(new Error("Only failed clips can be retried."), { status: 409 });
        const activeJob = d.jobs.find((job) => job.clipId === item.id && ["queued", "processing"].includes(job.status));
        if (activeJob) throw Object.assign(new Error("This clip is already being rendered."), { status: 409 });
        d.jobs = d.jobs.filter((job) => job.clipId !== item.id);
        const previousDownloadUrl = item.downloadUrl;
        item.status = "queued"; item.updatedAt = now(); delete item.downloadUrl; delete item.error;
        return { clip: { ...item }, previousDownloadUrl };
      });
      await queue.removeExport(previousDownloadUrl);
      const job = await queue.enqueue(clip);
      return json(res, 202, { clip, job });
    }
    const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/); if (jobMatch && req.method === "GET") { const job = await db.read((d) => d.jobs.find((j) => j.id === jobMatch[1] && d.clips.some((c) => c.id === j.clipId && c.userId === user.id))); if (!job) throw Object.assign(new Error("Job not found."), { status: 404 }); return json(res, 200, { job }); }
    const clipMatch = pathname.match(/^\/api\/clips\/([^/]+)$/); if (clipMatch && req.method === "PATCH") { const clip = await db.transaction((d) => { const item = d.clips.find((c) => c.id === clipMatch[1] && c.userId === user.id); if (!item) throw Object.assign(new Error("Clip not found."), { status: 404 }); if (["queued", "processing"].includes(item.status)) throw Object.assign(new Error("Wait for rendering to finish before renaming this clip."), { status: 409 }); const title = String(payload.title ?? "").trim(); if (!title) throw Object.assign(new Error("A clip title is required."), { status: 422 }); if (title.length > 160) throw Object.assign(new Error("Clip title must be 160 characters or fewer."), { status: 422 }); item.title = title; item.updatedAt = now(); return item; }); return json(res, 200, { clip }); } if (clipMatch && req.method === "DELETE") { const clip = await db.transaction((d) => { const item = d.clips.find((c) => c.id === clipMatch[1] && c.userId === user.id); if (!item) throw Object.assign(new Error("Clip not found."), { status: 404 }); if (d.jobs.some((job) => job.clipId === item.id && ["queued", "processing"].includes(job.status))) throw Object.assign(new Error("Clip is still rendering."), { status: 409 }); d.clips = d.clips.filter((c) => c.id !== item.id); d.jobs = d.jobs.filter((j) => j.clipId !== item.id); return item; }); await queue.removeExport(clip.downloadUrl); res.writeHead(204); res.end(); return; }
    throw Object.assign(new Error("API route not found."), { status: 404 });
  }
  const server = createServer(async (req, res) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader("x-frame-options", "SAMEORIGIN");
    try {
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
      res.setHeader("x-frame-options", "SAMEORIGIN");
      const url = new URL(req.url, "http://localhost"); if (url.pathname.startsWith("/api/")) return await api(req, res, url.pathname); const isStorage = url.pathname.startsWith("/storage/"); if (isStorage) return json(res, 404, { error: "Not found" }); const baseDir = root;
      const candidate = normalize(join(baseDir, url.pathname === "/" ? "index.html" : url.pathname));
      const relativeCandidate = requireRelative(baseDir, candidate);
      if (relativeCandidate.startsWith("..") || relativeCandidate.startsWith("/") || relativeCandidate.startsWith("\\")) return json(res, 403, { error: "Forbidden" }); try { await access(candidate); res.writeHead(200, { "content-type": mime[extname(candidate)] || "application/octet-stream" }); createReadStream(candidate).pipe(res); } catch { if (!isStorage) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); createReadStream(join(root, "index.html")).pipe(res); } } } catch (error) { json(res, error.status || 500, { error: error.message || "Internal server error" }); } });
  server.clipQueue = queue;
  server.database = db;
  return server;
}
