import { clipDuration, formatTimestamp, normalizeClipRange } from "./clip-utils.js";

const startInput = document.querySelector("#start-input");
const endInput = document.querySelector("#end-input");
const durationLabel = document.querySelector("#duration-label");
const toast = document.querySelector("#toast");
const range = document.querySelector("#range");
const captionToggle = document.querySelector("#caption-toggle");
const videoStage = document.querySelector(".video-stage");
const timelineTrack = document.querySelector(".timeline-track");
const playbackButton = document.querySelector("#play-button");
const playhead = document.querySelector("#playhead");
const clipCount = document.querySelector("#clip-count");
const clipLibrary = document.querySelector("#clip-library");
const clipsEmpty = document.querySelector("#clips-empty");
const styleDialog = document.querySelector("#style-dialog");
const sourceUpload = document.querySelector("#source-upload");
const clipSearch = document.querySelector("#clip-search");
const clipFilter = document.querySelector("#clip-filter");
const projectSelect = document.querySelector("#project-select");
const fullscreenButton = document.querySelector("#fullscreen-button");
const volumeInput = document.querySelector("#volume-input");
let libraryQuery = "";
let libraryFilter = "all";
let timelineMaximum = Number(endInput.max);
const storageKey = "clipforge-exports";
const sessionKey = "clipforge-session";
const styleKey = "clipforge-caption-style";
let clips = [];
let apiSession = JSON.parse(window.localStorage.getItem(sessionKey) || "null");
let sourceVideo;
let sourcePreviewUrl;
let previewElement;
let currentProject;
let captionStyle = (() => {
  try { return JSON.parse(window.localStorage.getItem(styleKey) || "{\"color\":\"lime\",\"weight\":\"bold\"}"); }
  catch { return { color: "lime", weight: "bold" }; }
})();

const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", ...(apiSession?.token ? { authorization: `Bearer ${apiSession.token}` } : {}), ...options.headers } });
  if (response.status === 204) return null;
  const raw = await response.text();
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = { error: raw || `Request failed (HTTP ${response.status}).` }; }
  if (!response.ok) { const error = new Error(result.error || `Request failed (HTTP ${response.status}).`); error.status = response.status; throw error; }
  return result;
};

function renderProjectSelector(projects = []) {
  if (!projectSelect) return;
  projectSelect.replaceChildren(...projects.map((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    option.selected = project.id === currentProject?.id;
    return option;
  }));
}

async function loadProject(projectId) {
  const { projects } = await api("/api/projects");
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project not found.");
  currentProject = project;
  document.querySelector("#workspace-title").textContent = currentProject.name;
  if (projectSelect) projectSelect.value = project.id;
  const videos = (await api(`/api/videos?projectId=${encodeURIComponent(project.id)}`)).videos;
  sourceVideo = videos[0];
  if (sourceVideo) restoreSourcePreview(sourceVideo); else clearSourcePreview();
  clips = (await api("/api/clips")).clips.filter((clip) => clip.projectId === currentProject.id);
  renderClipLibrary();
}

async function ensureWorkspace() {
  try {
    if (!apiSession) {
      const email = `creator-${crypto.randomUUID().slice(0, 8)}@clipforge.local`;
      apiSession = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password: crypto.randomUUID() }) });
      window.localStorage.setItem(sessionKey, JSON.stringify(apiSession));
    }
    const { projects } = await api("/api/projects");
    if (projects.length) currentProject = projects[0];
    else {
      currentProject = (await api("/api/projects", { method: "POST", body: JSON.stringify({ name: "Midnight Sessions" }) })).project;
      projects.push(currentProject);
    }
    document.querySelector("#workspace-title").textContent = currentProject.name;
    renderProjectSelector(projects);
    clips = (await api("/api/clips")).clips.filter((clip) => clip.projectId === currentProject?.id);
    renderClipLibrary();
    return true;
  } catch (error) {
    if (error.status === 401) {
      apiSession = null;
      window.localStorage.removeItem(sessionKey);
      try {
        const email = `creator-${crypto.randomUUID().slice(0, 8)}@clipforge.local`;
        apiSession = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password: crypto.randomUUID() }) });
        window.localStorage.setItem(sessionKey, JSON.stringify(apiSession));
        const { projects } = await api("/api/projects");
        if (projects.length) currentProject = projects[0];
        else {
          currentProject = (await api("/api/projects", { method: "POST", body: JSON.stringify({ name: "Midnight Sessions" }) })).project;
          projects.push(currentProject);
        }
        document.querySelector("#workspace-title").textContent = currentProject.name;
        renderProjectSelector(projects);
        clips = (await api("/api/clips")).clips;
        renderClipLibrary();
        return true;
      } catch (retryError) {
        showToast(`Backend unavailable: ${retryError.message}`);
      }
    } else {
      showToast(`Backend unavailable: ${error.message}`);
    }
    clips = readSavedClips();
    renderClipLibrary();
    return false;
  }
}

let playbackTimer;
let toastTimer;
let draggedHandle;

function readSavedClips() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function saveClips() { window.localStorage.setItem(storageKey, JSON.stringify(clips)); }

function applyCaptionStyle(style = captionStyle) {
  captionStyle = { color: style.color || "lime", weight: style.weight || "bold" };
  document.documentElement.dataset.captionColor = captionStyle.color;
  document.documentElement.dataset.captionWeight = captionStyle.weight;
  const colorField = document.querySelector("#highlight-color");
  const weightField = document.querySelector("#caption-weight");
  if (colorField) colorField.value = captionStyle.color;
  if (weightField) weightField.value = captionStyle.weight;
  document.querySelector("#brand-style-description").textContent = `${captionStyle.weight === "bold" ? "Bold" : "Soft"} ${captionStyle.color} highlight`;
  window.localStorage.setItem(styleKey, JSON.stringify(captionStyle));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function getRange() { return normalizeClipRange(startInput.value, endInput.value, timelineMaximum); }

function clearSourcePreview() {
  sourceVideo = null;
  if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
  sourcePreviewUrl = null;
  previewElement?.remove();
  previewElement = null;
  videoStage.innerHTML = '<div class="video-placeholder"><span>Upload a video to start</span></div>';
  timelineMaximum = 1;
  startInput.max = 1;
  endInput.max = 1;
  startInput.value = 0;
  endInput.value = 1;
  updateRange();
}

function restoreSourcePreview(video) {
  if (!video?.id) return;
  if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
  sourcePreviewUrl = `/api/videos/${encodeURIComponent(video.id)}/stream`;
  previewElement?.remove();
  previewElement = document.createElement("video");
  previewElement.className = "source-video";
  previewElement.src = sourcePreviewUrl;
  previewElement.muted = false;
  previewElement.volume = Number(volumeInput?.value ?? 1);
  previewElement.playsInline = true;
  previewElement.preload = "metadata";
  videoStage.querySelector(".video-placeholder")?.replaceWith(previewElement);
  timelineMaximum = Math.max(1, Math.floor(video.duration));
  startInput.max = timelineMaximum;
  endInput.max = timelineMaximum;
  startInput.value = 0;
  endInput.value = Math.min(24, timelineMaximum);
  updateRange();
}

function updateRange() {
  const clipRange = getRange();
  startInput.value = clipRange.start;
  endInput.value = clipRange.end;
  const duration = clipDuration(clipRange.start, clipRange.end);
  durationLabel.textContent = `${formatTimestamp(duration)} clip`;
  range.style.left = `${(clipRange.start / timelineMaximum) * 100}%`;
  range.style.width = `${(duration / timelineMaximum) * 100}%`;
  playhead.style.left = `${(clipRange.start / timelineMaximum) * 100}%`;
  if (previewElement) previewElement.currentTime = Math.min(clipRange.start, Math.max(0, (previewElement.duration || timelineMaximum) - 0.05));
}

async function uploadSource(file) {
  if (!file) return;
  const maxUploadBytes = 250 * 1024 * 1024;
  if (file.size > maxUploadBytes) throw new Error("This video is too large. ClipForge currently accepts videos up to 250 MB.");
  if (!apiSession || !currentProject) {
    await ensureWorkspace();
    if (!apiSession || !currentProject) throw new Error("ClipForge could not connect your workspace. Refresh and try again.");
  }
  const probe = document.createElement("video");
  const probeUrl = URL.createObjectURL(file);
  const duration = await new Promise((resolve, reject) => {
    probe.onloadedmetadata = () => { URL.revokeObjectURL(probeUrl); resolve(probe.duration); };
    probe.onerror = () => { URL.revokeObjectURL(probeUrl); reject(new Error("Could not read video duration.")); };
    probe.src = probeUrl;
  });

  if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
  sourcePreviewUrl = URL.createObjectURL(file);
  previewElement = document.createElement("video");
  previewElement.className = "source-video";
  previewElement.src = sourcePreviewUrl;
  previewElement.muted = false;
  previewElement.volume = Number(volumeInput?.value ?? 1);
  previewElement.playsInline = true;
  previewElement.preload = "metadata";
  videoStage.querySelector(".video-placeholder")?.replaceWith(previewElement);

  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const fallbackMime = extension === "mp4" ? "video/mp4" : extension === "mov" ? "video/quicktime" : extension === "webm" ? "video/webm" : extension === "m4v" ? "video/x-m4v" : "";
  const contentType = file.type?.startsWith("video/") ? file.type : fallbackMime;
  if (!contentType) {
    if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
    sourcePreviewUrl = null;
    previewElement?.remove();
    previewElement = null;
    throw new Error("Please choose a video file (MP4, MOV, WebM, or M4V).");
  }
  showToast("Uploading video…");
  const upload = await new Promise((resolve, reject) => {
    let attempts = 0;
    const send = () => {
      attempts += 1;
      const request = new XMLHttpRequest();
      request.open("POST", "/api/uploads");
      request.timeout = 15 * 60 * 1000;
      request.setRequestHeader("content-type", contentType);
      request.setRequestHeader("x-filename", file.name);
      if (apiSession?.token) request.setRequestHeader("authorization", "Bearer " + apiSession.token);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) showToast("Uploading video… " + Math.round((event.loaded / event.total) * 100) + "%");
      };
      request.onload = () => {
        let result = {};
        try { result = JSON.parse(request.responseText || "{}"); } catch {}
        if (request.status >= 200 && request.status < 300) resolve(result);
        else reject(new Error(result.error || "Upload failed (HTTP " + request.status + ")."));
      };
      request.onerror = () => {
        if (attempts < 2) { showToast("Connection interrupted. Retrying upload…"); send(); }
        else reject(new Error("Upload failed: network connection was interrupted."));
      };
      request.ontimeout = () => {
        if (attempts < 2) { showToast("Upload timed out. Retrying…"); send(); }
        else reject(new Error("Upload timed out. Please try a smaller video or a stronger connection."));
      };
      request.onabort = () => reject(new Error("Upload was cancelled."));
      request.send(file);
    };
    send();
  });
  if (!currentProject) {
    const { projects } = await api("/api/projects");
    currentProject = projects[0] || (await api("/api/projects", { method: "POST", body: JSON.stringify({ name: "Midnight Sessions" }) })).project;
  }
  sourceVideo = (await api("/api/videos", { method: "POST", body: JSON.stringify({ projectId: currentProject.id, name: file.name, duration, sourceUrl: upload.url }) })).video;
  timelineMaximum = Math.max(1, Math.floor(duration));
  startInput.max = timelineMaximum;
  endInput.max = timelineMaximum;
  startInput.value = 0;
  endInput.value = Math.min(24, timelineMaximum);
  updateRange();
  showToast("Video uploaded. Automatic analysis is finding the best moments…");
  try {
    const format = document.querySelector(".format-option.selected")?.dataset.format || "9:16";
    const result = await api(`/api/videos/${encodeURIComponent(sourceVideo.id)}/auto-clip`, {
      method: "POST",
      body: JSON.stringify({ limit: 12, format, style: captionStyle, language: "en" })
    });
    clips = [...result.clips.map((item) => item.clip), ...clips];
    renderClipLibrary();
    startClipStatusPolling();
    showToast(result.aiFallback
      ? `Automatic analysis found ${result.generated} clips and started rendering them.`
      : `AI found ${result.generated} clips and started rendering them.`);
    void refreshClipLibraryWhileRendering();
    if (sourceVideo.id) {
      void pollAutoClipStatus(sourceVideo.id);
    }
  } catch (error) {
    if (error.status === 409) {
      showToast("Automatic clipping is already running for this video. We are using the existing job.");
      if (sourceVideo.id) void pollAutoClipStatus(sourceVideo.id);
    } else if (error.status === 503) {
      showToast("AI transcription is not configured on the server yet.");
    } else {
      showToast(`Video uploaded, but AI clipping failed: ${error.message}`);
    }
  }
}

async function refreshClipStatuses({ showReadyToast = false } = {}) {
  if (!apiSession || !clips.length) return;
  try {
    const previous = new Map(clips.map((clip) => [clip.id, clip.status]));
    clips = (await api("/api/clips")).clips;
    renderClipLibrary();
    if (showReadyToast) {
      const becameReady = clips.filter((clip) => previous.get(clip.id) && previous.get(clip.id) !== "ready" && clip.status === "ready");
      if (becameReady.length) showToast(`${becameReady.length} clip${becameReady.length === 1 ? "" : "s"} ready to download.`);
    }
  } catch {
    // A temporary polling failure should not interrupt editing.
  }
}

let statusPollTimer;
function startClipStatusPolling() {
  window.clearInterval(statusPollTimer);
  if (!clips.some((clip) => !["ready", "failed"].includes(clip.status))) return;
  statusPollTimer = window.setInterval(async () => {
    await refreshClipStatuses({ showReadyToast: true });
    if (!clips.some((clip) => !["ready", "failed"].includes(clip.status))) {
      window.clearInterval(statusPollTimer);
      statusPollTimer = undefined;
    }
  }, 2500);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function renderClipLibrary() {
  clipCount.textContent = clips.length;
  const query = libraryQuery.trim().toLowerCase();
  const filtered = clips.filter((clip) => {
    const title = String(clip.title || "");
    const matchesQuery = !query || title.toLowerCase().includes(query);
    const matchesFilter = libraryFilter === "all" || (libraryFilter === "rendering" ? !["ready", "failed"].includes(clip.status) : clip.status === libraryFilter);
    return matchesQuery && matchesFilter;
  });
  clipsEmpty.hidden = clips.length > 0;
  clipLibrary.innerHTML = filtered.map((clip) => {
    const title = escapeHtml(clip.title || "Untitled clip");
    const format = escapeHtml(clip.format || "9:16");
    const formatClass = format.replace(/:/g, "-");
    const clipId = escapeHtml(clip.id);
    const status = clip.status === "ready"
      ? `<button class="download-clip" type="button" data-download-clip="${clipId}">Download</button>`
      : clip.status === "failed"
        ? `<div class="clip-status-actions"><small>Render failed</small><button class="retry-clip" type="button" data-retry-clip="${clipId}">Retry</button></div>`
        : `<small class="rendering-status">Rendering…</small>`;
    return `<article class="clip-card"><div class="clip-card-art ${formatClass}"><span>${format}</span><p>${clip.captions ? "CC" : "No captions"}</p></div><div><h3>${title}</h3><p>${formatTimestamp(clip.start)}–${formatTimestamp(clip.end)} · ${formatTimestamp(clipDuration(clip.start, clip.end))}</p><small>Exported ${new Date(clip.createdAt).toLocaleDateString()}</small><div>${status}</div></div><button class="delete-clip" type="button" data-delete-clip="${clipId}" aria-label="Delete ${title}">×</button></article>`;
  }).join("");
}

async function refreshClipLibraryWhileRendering() {
  for (let attempt = 0; attempt < 450; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const result = await api("/api/clips");
      clips = result.clips.filter((clip) => clip.projectId === currentProject?.id);
      renderClipLibrary();
      if (!clips.some((clip) => !["ready", "failed"].includes(clip.status))) break;
    } catch {
      break;
    }
  }
}

function stopPlayback() {
  window.clearInterval(playbackTimer);
  playbackTimer = undefined;
  previewElement?.pause();
  playbackButton.textContent = "▶";
  playbackButton.setAttribute("aria-label", "Play clip");
}

function startPlayback() {
  if (previewElement) {
    previewElement.currentTime = Number(startInput.value);
    void previewElement.play().catch(() => {});
  }
  playbackButton.textContent = "❚❚";
  playbackButton.setAttribute("aria-label", "Pause clip");
  playbackTimer = window.setInterval(() => {
    const current = previewElement ? previewElement.currentTime : Number(startInput.value);
    playhead.style.left = `${(current / timelineMaximum) * 100}%`;
    if (current >= Number(endInput.value)) { stopPlayback(); return; }
    if (!previewElement) startInput.value = current + 1;
  }, 250);
}

function updateFromPointer(event) {
  const bounds = timelineTrack.getBoundingClientRect();
  const second = Math.round(Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * timelineMaximum);
  const current = getRange();
  if (draggedHandle === "start") startInput.value = Math.min(second, current.end - 1);
  if (draggedHandle === "end") endInput.value = Math.max(second, current.start + 1);
  updateRange();
}

function switchView(view) {
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === view));
  document.querySelectorAll(".editor, .secondary-view").forEach((section) => { section.hidden = section.id !== view; });
  if (view === "clips") renderClipLibrary();
}

[startInput, endInput].forEach((input) => input.addEventListener("input", updateRange));

document.querySelectorAll(".format-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".format-option").forEach((option) => { option.classList.remove("selected"); option.setAttribute("aria-checked", "false"); });
    button.classList.add("selected");
    button.setAttribute("aria-checked", "true");
    document.querySelector(".format-badge").textContent = button.dataset.format;
    showToast(`Canvas changed to ${button.dataset.format}.`);
  });
});

volumeInput?.addEventListener("input", () => { if (previewElement) previewElement.volume = Number(volumeInput.value); });
playbackButton.addEventListener("click", () => (playbackTimer ? stopPlayback() : startPlayback()));
sourceUpload.addEventListener("change", async () => { try { await uploadSource(sourceUpload.files[0]); } catch (error) { showToast(error.message); } });
captionToggle.addEventListener("change", () => {
  videoStage.classList.toggle("captions-off", !captionToggle.checked);
  showToast(captionToggle.checked ? "Auto captions enabled." : "Auto captions disabled.");
});
timelineTrack.addEventListener("click", (event) => {
  if (event.target.closest(".range")) return;
  const bounds = timelineTrack.getBoundingClientRect();
  const selectedSecond = Math.round(((event.clientX - bounds.left) / bounds.width) * timelineMaximum);
  const duration = clipDuration(startInput.value, endInput.value);
  const clipRange = normalizeClipRange(selectedSecond, selectedSecond + duration, timelineMaximum);
  startInput.value = clipRange.start;
  endInput.value = clipRange.end;
  updateRange();
});

document.querySelectorAll(".handle").forEach((handle) => {
  handle.addEventListener("pointerdown", (event) => { draggedHandle = handle.classList.contains("start-handle") ? "start" : "end"; handle.setPointerCapture(event.pointerId); });
  handle.addEventListener("pointermove", (event) => { if (draggedHandle) updateFromPointer(event); });
  handle.addEventListener("pointerup", () => { draggedHandle = undefined; });
  handle.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const target = handle.classList.contains("start-handle") ? startInput : endInput;
    target.value = Number(target.value) + (event.key === "ArrowRight" ? 1 : -1);
    updateRange();
  });
});

document.querySelector("#apply-hook").addEventListener("click", () => { startInput.value = 124; endInput.value = 148; updateRange(); showToast("Smart-cut hook applied."); });

const transcriptDialog = document.querySelector("#transcript-dialog");
const transcriptInput = document.querySelector("#transcript-input");
const transcriptFile = document.querySelector("#transcript-file");
const autoTranscribeButton = document.querySelector("#auto-transcribe");

function parseTranscript(rawText) {
  return rawText.split("\n").map((line) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 4) return null;
    const start = Number(parts[0]);
    const end = Number(parts[1]);
    const speaker = parts[2] || undefined;
    const text = parts.slice(3).join(" | ").trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return null;
    return { start, end, speaker, text };
  }).filter(Boolean);
}

transcriptFile?.addEventListener("change", async () => {
  const file = transcriptFile.files?.[0];
  if (!file) return;
  transcriptInput.value = await file.text();
  showToast(`${file.name} loaded. Review it, then generate clips.`);
});

autoTranscribeButton?.addEventListener("click", async () => {
  try {
    if (!sourceVideo) throw new Error("Upload a source video first.");
    autoTranscribeButton.disabled = true;
    autoTranscribeButton.textContent = "Transcribing…";
    showToast("Transcribing your video…");
    const result = await api(`/api/videos/${encodeURIComponent(sourceVideo.id)}/transcribe`, { method: "POST", body: JSON.stringify({ language: "en" }) });
    transcriptInput.value = result.transcript.map((segment) => `${segment.start} | ${segment.end} | ${segment.speaker || ""} | ${segment.text}`).join("\n");
    showToast(`Transcript ready: ${result.count} timed segments.`);
  } catch (error) {
    showToast(error.status === 503 ? "Automatic transcription needs the server transcription key configured." : error.message);
  } finally {
    autoTranscribeButton.disabled = false;
    autoTranscribeButton.textContent = "Transcribe video automatically";
  }
});

document.querySelector("#generate-ai-clips")?.addEventListener("click", () => {
  if (!sourceVideo) { showToast("Upload a source video first."); return; }
  transcriptDialog.showModal();
});

document.querySelector("#run-ai-generation")?.addEventListener("click", async (event) => {
  event.preventDefault();
  try {
    if (!sourceVideo) throw new Error("Upload a source video first.");
    const rawTranscript = transcriptInput.value.trim();
    if (!rawTranscript) throw new Error("Add or import a transcript before generating clips.");
    await api(`/api/videos/${encodeURIComponent(sourceVideo.id)}/transcript`, { method: "POST", body: JSON.stringify({ text: rawTranscript, format: "auto" }) });
    const format = document.querySelector(".format-option.selected").dataset.format;
    const result = await api(`/api/videos/${encodeURIComponent(sourceVideo.id)}/generate-clips`, {
      method: "POST",
      body: JSON.stringify({ limit: 40, format, style: captionStyle })
    });
    transcriptDialog.close();
    clips = [...result.clips.map((item) => item.clip), ...clips];
    renderClipLibrary();
    startClipStatusPolling();
    showToast(`AI ranked ${result.generated} clips and queued them for rendering.`);
    void refreshClipLibraryWhileRendering();
  } catch (error) {
    showToast(error.message);
  }
});

function openStyleDialog() { styleDialog.showModal(); }
document.querySelector("#style-button").addEventListener("click", openStyleDialog);
document.querySelectorAll("[data-open-style]").forEach((button) => button.addEventListener("click", openStyleDialog));
document.querySelector("#save-style").addEventListener("click", () => {
  applyCaptionStyle({ color: document.querySelector("#highlight-color").value, weight: document.querySelector("#caption-weight").value });
  showToast("Caption style saved for future exports.");
});

projectSelect?.addEventListener("change", async () => {
  try { await loadProject(projectSelect.value); showToast("Project switched."); }
  catch (error) { showToast(error.message); }
});

document.querySelector("#new-project").addEventListener("click", async () => {
  stopPlayback();
  try {
    if (!apiSession || !currentProject) {
      const ready = await ensureWorkspace();
      if (!ready) throw new Error("ClipForge could not connect your workspace.");
    }
    currentProject = (await api("/api/projects", { method: "POST", body: JSON.stringify({ name: `Project ${new Date().toLocaleDateString()}` }) })).project;
    const refreshedProjects = (await api("/api/projects")).projects;
    renderProjectSelector(refreshedProjects);
    document.querySelector("#workspace-title").textContent = currentProject.name;
    sourceVideo = undefined;
    clips = [];
    renderClipLibrary();
    if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
    sourcePreviewUrl = undefined;
    previewElement?.remove();
    previewElement = undefined;
    if (!videoStage.querySelector(".video-placeholder")) {
      const placeholder = document.createElement("div");
      placeholder.className = "video-placeholder";
      placeholder.innerHTML = "<span class=\"play-icon\">▶</span><p>Upload a source video to begin</p><small>Choose a video above</small>";
      videoStage.prepend(placeholder);
    }
    timelineMaximum = 24;
    startInput.max = 24;
    endInput.max = 24;
    startInput.value = 0;
    endInput.value = 24;
    updateRange();
    switchView("editor");
    showToast("New project created.");
  } catch (error) {
    showToast(`Could not create project: ${error.message}`);
  }
});

document.querySelector("#export-button").addEventListener("click", async () => {
  const selected = document.querySelector(".format-option.selected").dataset.format;
  try {
    if (!sourceVideo) throw new Error("Upload a source video before exporting.");
    const result = await api("/api/clips", { method: "POST", body: JSON.stringify({ videoId: sourceVideo.id, title: `Midnight Session · Clip ${clips.length + 1}`, start: Number(startInput.value), end: Number(endInput.value), format: selected, captions: captionToggle.checked, style: { color: document.querySelector("#highlight-color").value, weight: document.querySelector("#caption-weight").value } }) });
    clips.unshift(result.clip);
    renderClipLibrary();
    showToast("Export queued. Your rendered clip will be ready shortly.");
    for (let attempt = 0; attempt < 900; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const jobResult = await api(`/api/jobs/${result.job.id}`);
      if (jobResult.job.status === "completed" || jobResult.job.status === "failed") break;
    }
    clips = (await api("/api/clips")).clips;
    renderClipLibrary();
    const finished = clips.find((clip) => clip.id === result.clip.id);
    if (finished?.status === "ready") showToast("Your clip is ready to download.");
    else if (finished?.status === "failed") showToast("Clip render failed: " + (finished.error || "FFmpeg could not render this clip."));
    else showToast("Clip is still rendering. Check My clips for its current status.");
  } catch (error) { showToast(error.message); }
});

clipSearch?.addEventListener("input", () => { libraryQuery = clipSearch.value; renderClipLibrary(); });
clipFilter?.addEventListener("change", () => { libraryFilter = clipFilter.value; renderClipLibrary(); });

fullscreenButton?.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await videoStage.requestFullscreen();
    else await document.exitFullscreen();
  } catch { showToast("Full screen is not available on this device."); }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
});

document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); switchView(link.dataset.view); }));
document.querySelectorAll("[data-go-editor]").forEach((button) => button.addEventListener("click", () => switchView("editor")));

clipLibrary.addEventListener("click", async (event) => {
  const retryButton = event.target.closest("[data-retry-clip]");
  if (retryButton) {
    if (retryButton.disabled) return;
    retryButton.disabled = true;
    retryButton.textContent = "Retrying…";
    try {
      const result = await api(`/api/clips/${retryButton.dataset.retryClip}/retry`, { method: "POST" });
      clips = clips.map((clip) => clip.id === result.clip.id ? result.clip : clip);
      renderClipLibrary();
      showToast("Render retry queued.");
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const jobResult = await api(`/api/jobs/${result.job.id}`);
        if (jobResult.job.status === "completed" || jobResult.job.status === "failed") break;
      }
      clips = (await api("/api/clips")).clips;
      renderClipLibrary();
    } catch (error) { showToast(error.message); renderClipLibrary(); }
    return;
  }
  const downloadButton = event.target.closest("[data-download-clip]");
  if (downloadButton) {
    try {
      const response = await fetch(`/api/clips/${downloadButton.dataset.downloadClip}/download`, { headers: apiSession?.token ? { authorization: `Bearer ${apiSession.token}` } : {} });
      if (!response.ok) throw new Error("Download failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `clipforge-${downloadButton.dataset.downloadClip}.mp4`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { showToast(error.message); }
    return;
  }
  const button = event.target.closest("[data-delete-clip]");
  if (!button) return;
  try {
    await api(`/api/clips/${button.dataset.deleteClip}`, { method: "DELETE" });
    clips = clips.filter((clip) => clip.id !== button.dataset.deleteClip);
    saveClips();
    renderClipLibrary();
    showToast("Clip removed from your library.");
  } catch (error) {
    showToast(error.status === 409 ? "This clip is still rendering. Try again when rendering finishes." : `Could not remove clip: ${error.message}`);
  }
});

renderClipLibrary();
updateRange();
applyCaptionStyle();
startClipStatusPolling();
ensureWorkspace();

window.addEventListener("keydown", (event) => {
  if (event.target.matches("input, select, textarea")) return;
  if (event.key === " ") { event.preventDefault(); playbackButton.click(); }
  if (event.key.toLowerCase() === "e") document.querySelector("#export-button").click();
  if (event.key.toLowerCase() === "u") sourceUpload.click();
  if (event.key === "Escape" && styleDialog.open) styleDialog.close();
});

async function pollAutoClipStatus(videoId) {
  for (let attempt = 0; attempt < 450; attempt += 1) {
    try {
      const status = await api(`/api/videos/${encodeURIComponent(videoId)}/auto-clip-status`);
      clips = [...status.clips, ...clips.filter((clip) => clip.videoId !== videoId && clip.projectId === currentProject?.id)];
      renderClipLibrary();
      if (status.total > 0 && status.processing === 0) {
        showToast(status.failed ? `Automatic clipping finished: ${status.ready} clips ready, ${status.failed} failed.` : `Automatic clipping finished: ${status.ready} clips are ready.`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
