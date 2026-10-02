import { clipDuration, formatTimestamp, normalizeClipRange } from "./clip-utils.js";

const startInput = document.querySelector("#start-input");
const endInput = document.querySelector("#end-input");
const durationLabel = document.querySelector("#duration-label");
const toast = document.querySelector("#toast");
const range = document.querySelector("#range");
const captionToggle = document.querySelector("#caption-toggle");
const captionOverlay = document.querySelector("#caption-overlay");
const videoStage = document.querySelector(".video-stage");
const timelineTrack = document.querySelector(".timeline-track");
const playbackButton = document.querySelector("#play-button");
const playhead = document.querySelector("#playhead");
const clipCount = document.querySelector("#clip-count");
const clipLibrary = document.querySelector("#clip-library");
const clipPreviewDialog = document.querySelector("#clip-preview-dialog");
const clipPreviewVideo = document.querySelector("#clip-preview-video");
const clipPreviewTitle = document.querySelector("#clip-preview-title");
const clipDetailsDialog = document.querySelector("#clip-details-dialog");
const clipDetailsTitle = document.querySelector("#clip-details-title");
const clipDetailsList = document.querySelector("#clip-details-list");
const detailsDownloadClipButton = document.querySelector("#details-download-clip");
const clipsEmpty = document.querySelector("#clips-empty");
const styleDialog = document.querySelector("#style-dialog");
const sourceUpload = document.querySelector("#source-upload");
const videoDropzone = document.querySelector("#video-dropzone");
const uploadProgress = document.querySelector("#upload-progress");
const uploadProgressLabel = document.querySelector("#upload-progress-label");
const uploadProgressPercent = document.querySelector("#upload-progress-percent");
const uploadProgressBar = document.querySelector("#upload-progress-bar");
const cancelUploadButton = document.querySelector("#cancel-upload");
let activeUploadRequest = null;
const clipSearch = document.querySelector("#clip-search");
const clipFilter = document.querySelector("#clip-filter");
const clipSort = document.querySelector("#clip-sort");
const clearClipFiltersButton = document.querySelector("#clear-clip-filters");
const librarySummary = document.querySelector("#clip-status-summary" );
const libraryProjectOverview = document.querySelector("#library-project-overview");
const selectAllClipsButton = document.querySelector("#select-all-clips");
const downloadSelectedClipsButton = document.querySelector("#download-selected-clips");
const deleteSelectedClipsButton = document.querySelector("#delete-selected-clips");
const librarySelectionSummary = document.querySelector("#library-selection-summary");
const refreshClipsButton = document.querySelector("#refresh-clips");
const copyClipLinksButton = document.querySelector("#copy-clip-links");
const exportClipListButton = document.querySelector("#export-clip-list");
const copyClipTitlesButton = document.querySelector("#copy-clip-titles");
const copyClipDurationButton = document.querySelector("#copy-clip-duration");
const copyClipJsonButton = document.querySelector("#copy-clip-json");
const copyClipSummaryButton = document.querySelector("#copy-clip-summary");
const batchRenameClipsButton = document.querySelector("#batch-rename-clips");
const deselectAllClipsButton = document.querySelector("#deselect-all-clips");
const selectFailedClipsButton = document.querySelector("#select-failed-clips");
const retryFailedClipsButton = document.querySelector("#retry-failed-clips");
const selectRenderingClipsButton = document.querySelector("#select-rendering-clips");
const selectAllStatusClipsButton = document.querySelector("#select-all-status-clips");
const invertClipSelectionButton = document.querySelector("#invert-clip-selection");
const selectVisibleClipsButton = document.querySelector("#select-visible-clips");
const selectReadyClipsButton = document.querySelector("#select-ready-clips");
const selectUntaggedClipsButton = document.querySelector("#select-untagged-clips");
const selectCaptionedClipsButton = document.querySelector("#select-captioned-clips");
const selectLongClipsButton = document.querySelector("#select-long-clips");
const selectShortClipsButton = document.querySelector("#select-short-clips");
const exportStatus = document.querySelector("#export-status");
const projectSelect = document.querySelector("#project-select");
const deleteProjectButton = document.querySelector("#delete-project");
const fullscreenButton = document.querySelector("#fullscreen-button");
const volumeInput = document.querySelector("#volume-input");
let libraryQuery = "";
let libraryFilter = "all";
let librarySort = "newest";
let timelineMaximum = Number(endInput.max);
const storageKey = "clipforge-exports";
const sessionKey = "clipforge-session";
const styleKey = "clipforge-caption-style";
const favoriteKey = "clipforge-favorite-clips";
let clips = [];
const selectedClipIds = new Set();
const favoriteClipIds = new Set(JSON.parse(window.localStorage.getItem(favoriteKey) || "[]"));
const automaticClipFailures = new Set();
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
  const deleteSourceButton = document.querySelector("#delete-source-video");
  if (sourceVideo) { restoreSourcePreview(sourceVideo); if (deleteSourceButton) deleteSourceButton.hidden = false; } else { clearSourcePreview(); if (deleteSourceButton) deleteSourceButton.hidden = true; }
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
        clips = (await api("/api/clips")).clips.filter((clip) => clip.projectId === currentProject?.id);
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

function updateCaptionOverlay() {
  if (!captionOverlay) return;
  captionOverlay.hidden = !captionToggle?.checked;
  captionOverlay.setAttribute("aria-hidden", String(!captionToggle?.checked));
  captionOverlay.dataset.color = captionStyle.color;
  captionOverlay.dataset.weight = captionStyle.weight;
}

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
  updateCaptionOverlay();
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
  uploadProgress?.removeAttribute("hidden");
  if (uploadProgressBar) uploadProgressBar.value = 0;
  if (uploadProgressPercent) uploadProgressPercent.textContent = "0%";
  const upload = await new Promise((resolve, reject) => {
    let attempts = 0;
    const uploadId = crypto.randomUUID();
    const send = () => {
      attempts += 1;
      const request = new XMLHttpRequest();
      activeUploadRequest = request;
      request.open("POST", "/api/uploads");
      request.timeout = 15 * 60 * 1000;
      request.setRequestHeader("content-type", contentType);
      request.setRequestHeader("x-filename", file.name);
      request.setRequestHeader("x-upload-id", uploadId);
      if (apiSession?.token) request.setRequestHeader("authorization", "Bearer " + apiSession.token);
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        if (uploadProgressBar) uploadProgressBar.value = percent;
        if (uploadProgressPercent) uploadProgressPercent.textContent = percent + "%";
        if (uploadProgressLabel) uploadProgressLabel.textContent = "Uploading video…";
        showToast("Uploading video… " + percent + "%");
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
  const deleteSourceButton = document.querySelector("#delete-source-video");
  if (deleteSourceButton) deleteSourceButton.hidden = false;
  timelineMaximum = Math.max(1, Math.floor(duration));
  startInput.max = timelineMaximum;
  endInput.max = timelineMaximum;
  startInput.value = 0;
  endInput.value = Math.min(24, timelineMaximum);
  updateRange();
  if (uploadProgressBar) uploadProgressBar.value = 100;
  if (uploadProgressPercent) uploadProgressPercent.textContent = "100%";
  if (uploadProgressLabel) uploadProgressLabel.textContent = "Upload complete";
  showToast("Video uploaded. ClipForge is preparing the strongest moments…");
  try {
    const format = document.querySelector(".format-option.selected")?.dataset.format || "9:16";
    const autoClipPayload = JSON.stringify({ limit: 12, format, style: captionStyle, language: "en" });
    const requestAutomaticClipping = () => api(`/api/videos/${encodeURIComponent(sourceVideo.id)}/auto-clip`, {
      method: "POST",
      body: autoClipPayload
    });
    showToast("ClipForge is analyzing your video and finding the strongest moments…");
    void pollAutoClipStatus(sourceVideo.id);
    let result;
    try {
      result = await requestAutomaticClipping();
    } catch (firstError) {
      const retryable = !firstError.status || [500, 502, 504].includes(firstError.status);
      if (!retryable) throw firstError;
      showToast("AI analysis was interrupted. Retrying automatically…");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      result = await requestAutomaticClipping();
    }
    automaticClipFailures.delete(sourceVideo.id);
    clips = [...result.clips.map((item) => item.clip), ...clips.filter((clip) => !result.clips.some((item) => item.clip.id === clip.id))];
    renderClipLibrary();
    startClipStatusPolling();
    showToast(result.aiFallback
      ? `Built-in highlight analysis found ${result.generated} clips and started rendering them.`
      : `AI highlight analysis found ${result.generated} clips and started rendering them.`);
    void refreshClipLibraryWhileRendering();
  } catch (error) {
    if (sourceVideo?.id && error.status !== 409) {
      try {
        const status = await api(`/api/videos/${encodeURIComponent(sourceVideo.id)}/auto-clip-status`);
        const hasAutomaticWork = status.total > 0 || status.analysisInProgress;
        if (hasAutomaticWork) {
          automaticClipFailures.delete(sourceVideo.id);
          void pollAutoClipStatus(sourceVideo.id);
        } else {
          automaticClipFailures.add(sourceVideo.id);
        }
      } catch {
        automaticClipFailures.add(sourceVideo.id);
      }
    }
    if (error.status === 409) {
      showToast("Automatic clipping is already running for this video. We are using the existing job.");
      if (sourceVideo.id) void pollAutoClipStatus(sourceVideo.id);
    } else if (error.status === 503) {
      showToast("Automatic transcription needs a server key. You can import a transcript and use ClipForge's built-in highlight engine.");
      document.querySelector("#transcript-dialog")?.showModal();
    } else {
      showToast(`Video uploaded, but AI clipping failed: ${error.message}`);
    }
  }
}

async function refreshClipStatuses({ showReadyToast = false } = {}) {
  if (!apiSession || !clips.length) return;
  try {
    const previous = new Map(clips.map((clip) => [clip.id, clip.status]));
    clips = (await api("/api/clips")).clips.filter((clip) => clip.projectId === currentProject?.id);
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
  for (const id of [...selectedClipIds]) if (!clips.some((clip) => clip.id === id)) selectedClipIds.delete(id);
  clipCount.textContent = clips.length;
  const query = libraryQuery.trim().toLowerCase();
  const filtered = clips.filter((clip) => {
    const title = String(clip.title || "");
    const matchesQuery = !query || title.toLowerCase().includes(query);
    const matchesFilter = libraryFilter === "all" || (libraryFilter === "favorites" ? favoriteClipIds.has(clip.id) : (libraryFilter === "rendering" ? !["ready", "failed"].includes(clip.status) : clip.status === libraryFilter));
    return matchesQuery && matchesFilter;
  });
  filtered.sort((a, b) => {
    if (librarySort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
    if (librarySort === "longest") return clipDuration(b.start, b.end) - clipDuration(a.start, a.end);
    if (librarySort === "shortest") return clipDuration(a.start, a.end) - clipDuration(b.start, b.end);
    const titleA = String(a.title || "").toLowerCase(), titleB = String(b.title || "").toLowerCase();
    if (librarySort === "az") return titleA.localeCompare(titleB);
    if (librarySort === "za") return titleB.localeCompare(titleA);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  clipsEmpty.hidden = clips.length > 0;
  const readyCount = clips.filter((clip) => clip.status === "ready").length;
  const renderingCount = clips.filter((clip) => !["ready", "failed"].includes(clip.status)).length;
  const failedCount = clips.filter((clip) => clip.status === "failed").length;
  const favoriteCount = clips.filter((clip) => favoriteClipIds.has(clip.id)).length;
  if (libraryProjectOverview) {
    const projectName = currentProject?.name || "Current project";
    const sourceCount = sourceVideo ? 1 : 0;
    const readyDuration = clips.filter((clip) => clip.status === "ready").reduce((sum, clip) => sum + Math.max(0, Number(clip.end) - Number(clip.start)), 0);
    libraryProjectOverview.innerHTML = "<strong>" + projectName.replace(/[&<>]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[char])) + "</strong><span>" + sourceCount + " source video" + (sourceCount === 1 ? "" : "s") + "</span><span>" + clips.length + " clips</span><span>" + readyCount + " ready</span><span>" + formatTimestamp(readyDuration) + " rendered</span>";
  }
  const totalDuration = clips.reduce((sum, clip) => sum + clipDuration(clip.start, clip.end), 0);
  if (librarySummary) librarySummary.textContent = `${clips.length} total · ${readyCount} ready · ${renderingCount} rendering · ${failedCount} failed · ${favoriteCount} favorite${favoriteCount === 1 ? "" : "s"} · ${formatTimestamp(totalDuration)} of content`;
  clipLibrary.innerHTML = filtered.map((clip) => {
    const title = escapeHtml(clip.title || "Untitled clip");
    const format = escapeHtml(clip.format || "9:16");
    const formatClass = format.replace(/:/g, "-");
    const clipId = escapeHtml(clip.id);
    const progress = Math.max(0, Math.min(100, Number(clip.renderProgress) || 0));
    const status = clip.status === "ready"
      ? `<div class="clip-status-actions"><button class="preview-clip" type="button" data-preview-clip="${clipId}">Preview</button><button class="download-clip" type="button" data-download-clip="${clipId}">Download</button></div>`
      : clip.status === "failed"
        ? `<div class="clip-status-actions"><small>Render failed</small><button class="retry-clip" type="button" data-retry-clip="${clipId}">Retry</button></div>`
        : clip.renderJobStatus === "queued"
          ? `<div class="clip-rendering"><small class="rendering-status">Queued for rendering…</small><progress class="clip-render-progress" max="100" value="0" aria-label="Render progress"></progress></div>`
          : `<div class="clip-rendering"><small class="rendering-status">Rendering… ${progress}%</small><progress class="clip-render-progress" max="100" value="${progress}" aria-label="Render progress"></progress></div>`;
    return `<article class="clip-card${favoriteClipIds.has(clip.id) ? " is-favorite" : ""}"><label class="clip-select"><input type="checkbox" data-select-clip="${clipId}" ${selectedClipIds.has(clip.id) ? "checked" : ""} aria-label="Select ${title}" /></label><div class="clip-card-art ${formatClass}"><span>${format}</span><p>${clip.captions ? "CC" : "No captions"}</p></div><div><h3>${title}</h3><button class="text-button favorite-clip" type="button" data-favorite-clip="${clipId}" aria-pressed="${favoriteClipIds.has(clip.id)}">${favoriteClipIds.has(clip.id) ? "★ Favorited" : "☆ Favorite"}</button><button class="text-button rename-clip" type="button" data-rename-clip="${clipId}">Rename</button><button class="text-button details-clip" type="button" data-details-clip="${clipId}">Details</button><p>${formatTimestamp(clip.start)}–${formatTimestamp(clip.end)} · ${formatTimestamp(clipDuration(clip.start, clip.end))}</p><small>Exported ${new Date(clip.createdAt).toLocaleDateString()}</small><div>${status}</div></div><button class="delete-clip" type="button" data-delete-clip="${clipId}" aria-label="Delete ${title}">×</button></article>`;
  }).join("");
  updateBulkClipControls();
  if (librarySelectionSummary) librarySelectionSummary.textContent = `${selectedClipIds.size} selected`;
  if (selectAllClipsButton) { const readyTotal = clips.filter((clip) => clip.status === "ready").length; const readySelected = clips.filter((clip) => clip.status === "ready" && selectedClipIds.has(clip.id)).length; selectAllClipsButton.textContent = readyTotal > 0 && readySelected === readyTotal ? "Clear ready" : "Select ready"; }
  if (selectReadyClipsButton) { const readyTotal = clips.filter((clip) => clip.status === "ready").length; const readySelected = clips.filter((clip) => clip.status === "ready" && selectedClipIds.has(clip.id)).length; selectReadyClipsButton.textContent = readyTotal > 0 && readySelected === readyTotal ? "Clear ready" : "Select ready"; }

  if (selectFailedClipsButton) { const failedTotal = clips.filter((clip) => clip.status === "failed").length; const failedSelected = clips.filter((clip) => clip.status === "failed" && selectedClipIds.has(clip.id)).length; selectFailedClipsButton.textContent = failedTotal > 0 && failedSelected === failedTotal ? "Clear failed" : "Select failed"; }
  if (selectRenderingClipsButton) { const renderingTotal = clips.filter((clip) => !["ready", "failed"].includes(clip.status)).length; const renderingSelected = clips.filter((clip) => !["ready", "failed"].includes(clip.status) && selectedClipIds.has(clip.id)).length; selectRenderingClipsButton.textContent = renderingTotal > 0 && renderingSelected === renderingTotal ? "Clear rendering" : "Select rendering"; }}

  if (selectAllStatusClipsButton) { selectAllStatusClipsButton.textContent = selectedClipIds.size === clips.length && clips.length > 0 ? "Clear all" : "Select all statuses"; }
  if (invertClipSelectionButton) { invertClipSelectionButton.textContent = selectedClipIds.size === clips.length && clips.length > 0 ? "Clear all" : "Invert selection"; }

  if (selectVisibleClipsButton) { const query = libraryQuery.trim().toLowerCase(); const visible = clips.filter((clip) => { const title = String(clip.title || ""); const matchesQuery = !query || title.toLowerCase().includes(query); const matchesFilter = libraryFilter === "all" || (libraryFilter === "favorites" ? favoriteClipIds.has(clip.id) : (libraryFilter === "rendering" ? !["ready", "failed"].includes(clip.status) : clip.status === libraryFilter)); return matchesQuery && matchesFilter; }); const visibleSelected = visible.filter((clip) => selectedClipIds.has(clip.id)).length; selectVisibleClipsButton.textContent = visible.length > 0 && visibleSelected === visible.length ? "Clear visible" : "Select visible"; }async function refreshClipLibraryWhileRendering() {

  if (selectUntaggedClipsButton) { const uncaptioned = clips.filter((clip) => !clip.captions); const selected = uncaptioned.filter((clip) => selectedClipIds.has(clip.id)); selectUntaggedClipsButton.textContent = uncaptioned.length > 0 && selected.length === uncaptioned.length ? "Clear no captions" : "Select no captions"; }  for (let attempt = 0; attempt < 450; attempt += 1) {

  if (selectCaptionedClipsButton) { const captioned = clips.filter((clip) => Boolean(clip.captions)); const selected = captioned.filter((clip) => selectedClipIds.has(clip.id)); selectCaptionedClipsButton.textContent = captioned.length > 0 && selected.length === captioned.length ? "Clear captions" : "Select captions"; }    await new Promise((resolve) => setTimeout(resolve, 2000));

  if (selectLongClipsButton) { const longClips = clips.filter((clip) => clipDuration(clip.start, clip.end) >= 60); const selected = longClips.filter((clip) => selectedClipIds.has(clip.id)); selectLongClipsButton.textContent = longClips.length > 0 && selected.length === longClips.length ? "Clear long clips" : "Select long clips"; }    try {

  if (selectShortClipsButton) { const shortClips = clips.filter((clip) => clipDuration(clip.start, clip.end) < 60); const selected = shortClips.filter((clip) => selectedClipIds.has(clip.id)); selectShortClipsButton.textContent = shortClips.length > 0 && selected.length === shortClips.length ? "Clear short clips" : "Select short clips"; }      const result = await api("/api/clips");
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
cancelUploadButton?.addEventListener("click", () => {
  if (!activeUploadRequest) return;
  activeUploadRequest.abort();
  activeUploadRequest = null;
  uploadProgress?.setAttribute("hidden", "");
  showToast("Upload cancelled.");
});
sourceUpload.addEventListener("change", async () => { try { await uploadSource(sourceUpload.files[0]); } catch (error) { showToast(error.message); } finally { sourceUpload.value = ""; } });
videoDropzone?.addEventListener("dragover", (event) => {
  if (![...event.dataTransfer.items].some((item) => item.kind === "file")) return;
  event.preventDefault();
  videoDropzone.classList.add("is-dragging");
  event.dataTransfer.dropEffect = "copy";
});
videoDropzone?.addEventListener("dragleave", (event) => {
  if (!videoDropzone.contains(event.relatedTarget)) videoDropzone.classList.remove("is-dragging");
});
videoDropzone?.addEventListener("drop", async (event) => {
  event.preventDefault();
  videoDropzone.classList.remove("is-dragging");
  const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(item.name));
  if (!file) { showToast("Drop a video file (MP4, MOV, WebM, or M4V)."); return; }
  try { await uploadSource(file); } catch (error) { showToast(error.message); }
});
videoDropzone?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    sourceUpload?.click();
  }
});

document.querySelector("#delete-source-video")?.addEventListener("click", async () => {
  if (!sourceVideo) return;
  if (!window.confirm("Delete this video? This removes its clips too.")) return;
  const button = document.querySelector("#delete-source-video");
  button.disabled = true;
  try {
    await api("/api/videos/" + encodeURIComponent(sourceVideo.id), { method: "DELETE" });
    clips = clips.filter((clip) => clip.videoId !== sourceVideo.id);
    saveClips();
    clearSourcePreview();
    button.hidden = true;
    renderClipLibrary();
    showToast("Source video deleted.");
  } catch (error) {
    showToast(error.status === 409 ? "This video is still processing. Try again when rendering finishes." : "Could not delete video: " + error.message);
  } finally { button.disabled = false; }
});
captionToggle.addEventListener("change", () => {
  videoStage.classList.toggle("captions-off", !captionToggle.checked);
  updateCaptionOverlay();
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

document.querySelector("#apply-hook").addEventListener("click", () => {
  const duration = Math.max(1, timelineMaximum);
  const preferredStart = Math.min(124, Math.max(0, duration - 24));
  const preferredEnd = Math.min(duration, preferredStart + Math.min(24, duration));
  startInput.value = Math.max(0, preferredStart);
  endInput.value = Math.max(Number(startInput.value) + 1, preferredEnd);
  if (Number(endInput.value) > duration) endInput.value = duration;
  updateRange();
  showToast("Smart-cut hook applied.");
});

const transcriptDialog = document.querySelector("#transcript-dialog");
const transcriptInput = document.querySelector("#transcript-input");
const transcriptFile = document.querySelector("#transcript-file");
const autoTranscribeButton = document.querySelector("#auto-transcribe");

function parseTranscript(rawText) {
  return rawText.split("\\n").map((line) => {
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
    transcriptInput.value = result.transcript.map((segment) => `${segment.start} | ${segment.end} | ${segment.speaker || ""} | ${segment.text}`).join("\\n");
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
    showToast(result.aiFallback
      ? `Built-in highlight analysis ranked ${result.generated} clips and queued them for rendering.`
      : `AI highlight analysis ranked ${result.generated} clips and queued them for rendering.`);
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

document.querySelector("#rename-project")?.addEventListener("click", async () => {
  if (!currentProject) return;
  const nextName = window.prompt("Rename project", currentProject.name);
  if (nextName === null) return;
  const name = nextName.trim();
  if (!name) { showToast("Project name cannot be empty."); return; }
  if (name.length > 120) { showToast("Project name must be 120 characters or fewer."); return; }
  try {
    const result = await api(`/api/projects/${encodeURIComponent(currentProject.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name })
    });
    currentProject = result.project;
    document.querySelector("#workspace-title").textContent = currentProject.name;
    const projects = (await api("/api/projects")).projects;
    renderProjectSelector(projects);
    renderClipLibrary();
    showToast("Project renamed.");
  } catch (error) {
    showToast(`Could not rename project: ${error.message}`);
  }
});

deleteProjectButton?.addEventListener("click", async () => {
  if (!currentProject) return;
  try {
    const { projects } = await api("/api/projects");
    if (projects.length <= 1) {
      showToast("Keep at least one project in ClipForge.");
      return;
    }
    const projectName = currentProject.name;
    if (!window.confirm(`Delete "${projectName}"? This removes its videos and clips.`)) return;
    deleteProjectButton.disabled = true;
    const deletedId = currentProject.id;
    await api(`/api/projects/${encodeURIComponent(deletedId)}`, { method: "DELETE" });
    const remaining = projects.filter((project) => project.id !== deletedId);
    currentProject = remaining[0];
    renderProjectSelector(remaining);
    await loadProject(currentProject.id);
    showToast("Project deleted.");
  } catch (error) {
    showToast(error.status === 409
      ? "This project still has active processing. Try again when rendering finishes."
      : `Could not delete project: ${error.message}`);
  } finally {
    deleteProjectButton.disabled = false;
  }
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
  const exportButton = document.querySelector("#export-button");
  if (exportButton.disabled) return;
  exportButton.disabled = true;
  if (exportStatus) { exportStatus.hidden = false; exportStatus.textContent = "Preparing export…"; }
  try {
    if (!sourceVideo) throw new Error("Upload a source video before exporting.");
    const result = await api("/api/clips", { method: "POST", body: JSON.stringify({ videoId: sourceVideo.id, title: `Midnight Session · Clip ${clips.length + 1}`, start: Number(startInput.value), end: Number(endInput.value), format: selected, captions: captionToggle.checked, style: { color: document.querySelector("#highlight-color").value, weight: document.querySelector("#caption-weight").value } }) });
    clips.unshift(result.clip);
    renderClipLibrary();
    if (exportStatus) exportStatus.textContent = "Rendering clip…";
    showToast("Export queued. Your rendered clip will be ready shortly.");
    for (let attempt = 0; attempt < 450; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const jobResult = await api(`/api/jobs/${result.job.id}`);
      if (jobResult.job.status === "completed" || jobResult.job.status === "failed") break;
    }
    clips = (await api("/api/clips")).clips.filter((clip) => clip.projectId === currentProject?.id);
    renderClipLibrary();
    const finished = clips.find((clip) => clip.id === result.clip.id);
    if (finished?.status === "ready") { if (exportStatus) exportStatus.textContent = "Export ready"; showToast("Your clip is ready to download."); }
    else if (finished?.status === "failed") { if (exportStatus) exportStatus.textContent = "Export failed"; showToast("Clip render failed: " + (finished.error || "FFmpeg could not render this clip.")); }
    else { if (exportStatus) exportStatus.textContent = "Still rendering"; showToast("Clip is still rendering. Check My clips for its current status."); }
  } catch (error) { if (exportStatus) exportStatus.textContent = "Export failed"; showToast(error.message); }
  finally { exportButton.disabled = false; }
});

clipSearch?.addEventListener("input", () => { libraryQuery = clipSearch.value; renderClipLibrary(); });
clipFilter?.addEventListener("change", () => { libraryFilter = clipFilter.value; renderClipLibrary(); });
clearClipFiltersButton?.addEventListener("click", () => {
  libraryQuery = "";
  libraryFilter = "all";
  librarySort = "newest";
  if (clipSearch) clipSearch.value = "";
  if (clipFilter) clipFilter.value = "all";
  if (clipSort) clipSort.value = "newest";
  renderClipLibrary();
  clipSearch?.focus();
});
clipSort?.addEventListener("change", () => { librarySort = clipSort.value; renderClipLibrary(); });

copyClipLinksButton?.addEventListener("click", () => { void copySelectedClipLinks(); });
exportClipListButton?.addEventListener("click", exportSelectedClipList);
copyClipTitlesButton?.addEventListener("click", () => { void copySelectedClipTitles(); });
copyClipDurationButton?.addEventListener("click", () => { void copySelectedClipDuration(); });
copyClipJsonButton?.addEventListener("click", () => { void copySelectedClipJson(); });
copyClipSummaryButton?.addEventListener("click", () => { void copySelectedClipSummary(); });
batchRenameClipsButton?.addEventListener("click", () => { void batchRenameClips(); });
deselectAllClipsButton?.addEventListener("click", () => {
  const readyIds = new Set(clips.filter((clip) => clip.status === "ready").map((clip) => clip.id));
  const allReadySelected = readyIds.size > 0 && [...readyIds].every((id) => selectedClipIds.has(id));
  readyIds.forEach((id) => allReadySelected ? selectedClipIds.delete(id) : selectedClipIds.add(id));
  renderClipLibrary();
});
selectFailedClipsButton?.addEventListener("click", () => {
  const failed = clips.filter((clip) => clip.status === "failed");
  const allSelected = failed.length > 0 && failed.every((clip) => selectedClipIds.has(clip.id));
  failed.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});
selectRenderingClipsButton?.addEventListener("click", () => {
  const rendering = clips.filter((clip) => !["ready", "failed"].includes(clip.status));
  const allSelected = rendering.length > 0 && rendering.every((clip) => selectedClipIds.has(clip.id));
  rendering.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});
selectAllStatusClipsButton?.addEventListener("click", () => {
  const allSelected = clips.length > 0 && clips.every((clip) => selectedClipIds.has(clip.id));
  clips.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});
invertClipSelectionButton?.addEventListener("click", () => {
  clips.forEach((clip) => selectedClipIds.has(clip.id) ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});
selectVisibleClipsButton?.addEventListener("click", () => {
  const query = libraryQuery.trim().toLowerCase();
  const visible = clips.filter((clip) => {
    const title = String(clip.title || "");
    const matchesQuery = !query || title.toLowerCase().includes(query);
    const matchesFilter = libraryFilter === "all" || (libraryFilter === "rendering" ? !["ready", "failed"].includes(clip.status) : clip.status === libraryFilter);
    return matchesQuery && matchesFilter;
  });
  const allVisibleSelected = visible.length > 0 && visible.every((clip) => selectedClipIds.has(clip.id));
  visible.forEach((clip) => allVisibleSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});
selectReadyClipsButton?.addEventListener("click", () => {
selectUntaggedClipsButton?.addEventListener("click", () => {
selectCaptionedClipsButton?.addEventListener("click", () => {
selectLongClipsButton?.addEventListener("click", () => {
selectShortClipsButton?.addEventListener("click", () => {
  const shortClips = clips.filter((clip) => clipDuration(clip.start, clip.end) < 60);
  const allSelected = shortClips.length > 0 && shortClips.every((clip) => selectedClipIds.has(clip.id));
  shortClips.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});  const longClips = clips.filter((clip) => clipDuration(clip.start, clip.end) >= 60);
  const allSelected = longClips.length > 0 && longClips.every((clip) => selectedClipIds.has(clip.id));
  longClips.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});  const captioned = clips.filter((clip) => Boolean(clip.captions));
  const allSelected = captioned.length > 0 && captioned.every((clip) => selectedClipIds.has(clip.id));
  captioned.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});  const uncaptioned = clips.filter((clip) => !clip.captions);
  const allSelected = uncaptioned.length > 0 && uncaptioned.every((clip) => selectedClipIds.has(clip.id));
  uncaptioned.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});  const readyIds = new Set(clips.filter((clip) => clip.status === "ready").map((clip) => clip.id));
  const allReadySelected = readyIds.size > 0 && [...readyIds].every((id) => selectedClipIds.has(id));
  readyIds.forEach((id) => allReadySelected ? selectedClipIds.delete(id) : selectedClipIds.add(id));
  renderClipLibrary();
});
retryFailedClipsButton?.addEventListener("click", async () => {
selectReadyClipsButton?.addEventListener("click", () => { selectedClipIds.clear(); clips.filter((clip) => clip.status === "ready").forEach((clip) => selectedClipIds.add(clip.id)); renderClipLibrary(); });  const failed = clips.filter((clip) => selectedClipIds.has(clip.id) && clip.status === "failed");
  if (!failed.length) return;
  retryFailedClipsButton.disabled = true;
  let retried = 0;
  for (const clip of failed) {
    try {
      const result = await api(`/api/clips/${encodeURIComponent(clip.id)}/retry`, { method: "POST" });
      const updated = result.clip || result;
      const target = clips.find((item) => item.id === clip.id);
      if (target) Object.assign(target, updated, { status: updated.status || "queued" });
      retried += 1;
    } catch (error) { showToast(error.message); }
  }
  renderClipLibrary();
  showToast(`${retried} of ${failed.length} failed clip${failed.length === 1 ? "" : "s"} retried.`);
});
refreshClipsButton?.addEventListener("click", async () => {
  if (!apiSession || !currentProject) return;
  refreshClipsButton.disabled = true;
  refreshClipsButton.textContent = "Refreshing…";
  try {
    await refreshClipStatuses({ showReadyToast: true });
    showToast("Clip library refreshed.");
  } catch (error) {
    showToast(`Could not refresh clips: ${error.message}`);
  } finally {
    refreshClipsButton.disabled = false;
    refreshClipsButton.textContent = "Refresh";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
  if (event.code === "Space") {
    event.preventDefault();
    playbackButton?.click();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    startInput.value = Math.max(0, Number(startInput.value) - 1);
    endInput.value = Math.max(Number(startInput.value) + 1, Number(endInput.value));
    updateRange();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    endInput.value = Math.min(timelineMaximum, Number(endInput.value) + 1);
    startInput.value = Math.min(Number(startInput.value), Number(endInput.value) - 1);
    updateRange();
  } else if (event.key.toLowerCase() === "f") {
    fullscreenButton?.click();
  } else if (event.key === "escape" && document.fullscreenElement) {
    void document.exitFullscreen();
  }
});

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

clipLibrary.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-clip]");
  if (!checkbox) return;
  if (checkbox.checked) selectedClipIds.add(checkbox.dataset.selectClip);
  else selectedClipIds.delete(checkbox.dataset.selectClip);
  updateBulkClipControls();
});
async function batchRenameClips() {
  const selected = clips.filter((clip) => selectedClipIds.has(clip.id) && ["ready", "failed"].includes(clip.status));
  if (!selected.length) return;
  const prefix = window.prompt("Enter a title prefix for the selected clips:", "Clip");
  if (prefix === null) return;
  const cleanPrefix = prefix.trim();
  if (!cleanPrefix) { showToast("Enter a title prefix."); return; }
  let renamed = 0;
  for (const [index, clip] of selected.entries()) {
    try {
      const result = await api(`/api/clips/${encodeURIComponent(clip.id)}`, { method: "PATCH", body: JSON.stringify({ title: `${cleanPrefix} ${index + 1}` }) });
      const updated = result.clip || result;
      const target = clips.find((item) => item.id === clip.id);
      if (target) target.title = updated.title || `${cleanPrefix} ${index + 1}`;
      renamed += 1;
    } catch (error) {
      showToast(error.message);
    }
  }
  renderClipLibrary();
  showToast(`${renamed} of ${selected.length} clip${selected.length === 1 ? "" : "s"} renamed.`);
}

async function copySelectedClipSummary() {
  const selected = clips.filter((clip) => selectedClipIds.has(clip.id) && clip.status === "ready");
  if (!selected.length) return;
  const total = selected.reduce((sum, clip) => sum + clipDuration(clip.start, clip.end), 0);
  const summary = selected.map((clip, index) => `${index + 1}. ${clip.title || "Untitled clip"} — ${clip.format || "9:16"} — ${formatTimestamp(clip.start)}–${formatTimestamp(clip.end)} — ${formatTimestamp(clipDuration(clip.start, clip.end))}`).join("\n");
  const text = `ClipForge selected clips (${selected.length})\nTotal duration: ${formatTimestamp(total)}\n\n${summary}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Clip summary copied.");
  } catch {
    showToast("Could not copy clip summary. Your browser may block clipboard access.");
  }
}

async function copySelectedClipJson() {
  const selected = clips.filter((clip) => selectedClipIds.has(clip.id) && clip.status === "ready");
  if (!selected.length) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
    showToast(`Metadata for ${selected.length} clip${selected.length === 1 ? "" : "s"} copied.`);
  } catch {
    showToast("Could not copy clip metadata. Your browser may block clipboard access.");
  }
}

async function copySelectedClipDuration() {
  const selected = clips.filter((clip) => selectedClipIds.has(clip.id) && clip.status === "ready");
  if (!selected.length) return;
  const total = selected.reduce((sum, clip) => sum + clipDuration(clip.start, clip.end), 0);
  try {
    await navigator.clipboard.writeText(formatTimestamp(total));
    showToast(`Total duration ${formatTimestamp(total)} copied.`);
  } catch {
    showToast("Could not copy duration. Your browser may block clipboard access.");
  }
}

async function copySelectedClipTitles() {
  const selected = clips.filter((clip) => selectedClipIds.has(clip.id) && clip.status === "ready");
  if (!selected.length) return;
  try {
    await navigator.clipboard.writeText(selected.map((clip) => clip.title || "Untitled clip").join("\n"));
    showToast(`${selected.length} clip${selected.length === 1 ? "" : "s"} title${selected.length === 1 ? "" : "s"} copied.`);
  } catch {
    showToast("Could not copy clip titles. Your browser may block clipboard access.");
  }
}

function exportSelectedClipList() {
  const selected = clips.filter((clip) => selectedClipIds.has(clip.id) && clip.status === "ready");
  if (!selected.length) return;
  const rows = [["Title", "Format", "Start", "End", "Duration", "Captions", "Download URL"], ...selected.map((clip) => [clip.title || "Untitled clip", clip.format || "9:16", clip.start, clip.end, clipDuration(clip.start, clip.end), clip.captions ? "Yes" : "No", new URL(`/api/clips/${encodeURIComponent(clip.id)}/download`, window.location.origin).href])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, `""`)}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "clipforge-clips.csv";
  anchor.click();
  URL.revokeObjectURL(url);
  showToast(`${selected.length} clip${selected.length === 1 ? "" : "s"} exported.`);
}

async function copySelectedClipLinks() {
  const selected = clips.filter((clip) => selectedClipIds.has(clip.id) && clip.status === "ready");
  if (!selected.length) return;
  const links = selected.map((clip) => new URL(`/api/clips/${encodeURIComponent(clip.id)}/download`, window.location.origin).href).join("\n");
  try {
    await navigator.clipboard.writeText(links);
    showToast(`${selected.length} clip link${selected.length === 1 ? "" : "s"} copied.`);
  } catch {
    showToast("Could not copy clip links. Your browser may block clipboard access.");
  }
}

function updateBulkClipControls() {
  const ready = clips.filter((clip) => clip.status === "ready");
  const selectedReady = ready.filter((clip) => selectedClipIds.has(clip.id)).length;
  const selectedFailed = clips.filter((clip) => clip.status === "failed" && selectedClipIds.has(clip.id)).length;
  const selectedRenameable = clips.filter((clip) => ["ready", "failed"].includes(clip.status) && selectedClipIds.has(clip.id)).length;
  const selectedTotal = selectedClipIds.size;
  if (selectAllClipsButton) selectAllClipsButton.textContent = ready.length && selectedReady === ready.length ? "Clear selection" : "Select ready";
  if (downloadSelectedClipsButton) {
    downloadSelectedClipsButton.disabled = selectedReady === 0;
    downloadSelectedClipsButton.textContent = selectedReady ? `Download selected (${selectedReady})` : "Download selected";
  }
  if (deleteSelectedClipsButton) {
    deleteSelectedClipsButton.disabled = selectedReady === 0;
    deleteSelectedClipsButton.textContent = selectedReady ? `Delete selected (${selectedReady})` : "Delete selected";
  }
  if (retryFailedClipsButton) {
    retryFailedClipsButton.disabled = selectedFailed === 0;
    retryFailedClipsButton.textContent = selectedFailed ? `Retry failed (${selectedFailed})` : "Retry failed";
  }
  if (batchRenameClipsButton) {
    batchRenameClipsButton.disabled = selectedRenameable === 0;
    batchRenameClipsButton.textContent = selectedRenameable ? `Batch rename (${selectedRenameable})` : "Batch rename";
  }
  if (deselectAllClipsButton) {
    deselectAllClipsButton.disabled = selectedTotal === 0;
    deselectAllClipsButton.textContent = selectedTotal ? `Deselect all (${selectedTotal})` : "Deselect all";
  }
}
async function downloadSelectedClips() {
  const selected = clips.filter((clip) => selectedClipIds.has(clip.id) && clip.status === "ready");
  if (!selected.length) return;
  downloadSelectedClipsButton.disabled = true;
  try {
    for (const clip of selected) {
      const response = await fetch(`/api/clips/${encodeURIComponent(clip.id)}/download`, { headers: apiSession?.token ? { authorization: `Bearer ${apiSession.token}` } : {} });
      if (!response.ok) throw new Error(`Could not download ${clip.title || "clip"}.`);
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${clip.title || "ClipForge clip"}.mp4`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    showToast(`Downloaded ${selected.length} selected clip${selected.length === 1 ? "" : "s"}.`);
  } catch (error) { showToast(error.message); }
  finally { updateBulkClipControls(); }
}
async function deleteSelectedClips() {
  const selected = clips.filter((clip) => selectedClipIds.has(clip.id) && clip.status === "ready");
  if (!selected.length) return;
  if (!window.confirm(`Delete ${selected.length} selected clip${selected.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
  deleteSelectedClipsButton.disabled = true;
  try {
    const results = await Promise.allSettled(selected.map((clip) => api(`/api/clips/${encodeURIComponent(clip.id)}`, { method: "DELETE" })));
    const deletedIds = new Set();
    let failed = 0;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") deletedIds.add(selected[index].id);
      else failed += 1;
    });
    for (const id of deletedIds) selectedClipIds.delete(id);
    clips = clips.filter((clip) => !deletedIds.has(clip.id));
    renderClipLibrary();
    showToast(failed ? `Deleted ${deletedIds.size}; ${failed} could not be deleted.` : `Deleted ${deletedIds.size} selected clip${deletedIds.size === 1 ? "" : "s"}.`);
  } catch (error) {
    showToast(`Could not delete selected clips: ${error.message}`);
    updateBulkClipControls();
  }
}
deleteSelectedClipsButton?.addEventListener("click", deleteSelectedClips);

selectAllClipsButton?.addEventListener("click", () => {
  const ready = clips.filter((clip) => clip.status === "ready");
  const allSelected = ready.length > 0 && ready.every((clip) => selectedClipIds.has(clip.id));
  if (allSelected) ready.forEach((clip) => selectedClipIds.delete(clip.id));
  else ready.forEach((clip) => selectedClipIds.add(clip.id));
  renderClipLibrary();
});
downloadSelectedClipsButton?.addEventListener("click", downloadSelectedClips);

clipLibrary.addEventListener("click", async (event) => {
  const favoriteButton = event.target.closest("[data-favorite-clip]");
  if (favoriteButton) {
    const clipId = favoriteButton.dataset.favoriteClip;
    if (favoriteClipIds.has(clipId)) favoriteClipIds.delete(clipId);
    else favoriteClipIds.add(clipId);
    window.localStorage.setItem(favoriteKey, JSON.stringify([...favoriteClipIds]));
    renderClipLibrary();
    showToast(favoriteClipIds.has(clipId) ? "Clip added to favorites." : "Clip removed from favorites.");
    return;
  }
  const detailsButton = event.target.closest("[data-details-clip]");
  if (detailsButton) {
    const clip = clips.find((item) => item.id === detailsButton.dataset.detailsClip);
    if (!clip || !clipDetailsDialog || !clipDetailsList) return;
    const duration = clipDuration(clip.start, clip.end);
    const status = clip.status === "ready" ? "Ready" : clip.status === "failed" ? "Failed" : "Rendering";
    clipDetailsTitle.textContent = clip.title || "Clip details";
    clipDetailsList.innerHTML = [
      ["Status", status],
      ["Format", clip.format || "9:16"],
      ["Duration", formatTimestamp(duration)],
      ["Start", formatTimestamp(clip.start)],
      ["End", formatTimestamp(clip.end)],
      ["Captions", clip.captions ? "On" : "Off"],
      ["Created", new Date(clip.createdAt).toLocaleString()]
    ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
    detailsDownloadClipButton.disabled = clip.status !== "ready";
    detailsDownloadClipButton.dataset.downloadClip = clip.id;
    clipDetailsDialog.showModal();
    return;
  }
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
      for (let attempt = 0; attempt < 450; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const jobResult = await api(`/api/jobs/${result.job.id}`);
        if (jobResult.job.status === "completed" || jobResult.job.status === "failed") break;
      }
      clips = (await api("/api/clips")).clips.filter((clip) => clip.projectId === currentProject?.id);
      renderClipLibrary();
      const finished = clips.find((clip) => clip.id === result.clip.id);
      if (finished?.status === "ready") showToast("Retry finished. Your clip is ready to download.");
      else if (finished?.status === "failed") showToast(`Retry failed: ${finished.error || "FFmpeg could not render this clip."}`);
      else showToast("Retry is still rendering. Check My clips for its current status.");
    } catch (error) { showToast(error.message); renderClipLibrary(); }
    return;
  }
  const renameButton = event.target.closest("[data-rename-clip]");
  if (renameButton) {
    const clip = clips.find((item) => item.id === renameButton.dataset.renameClip);
    if (!clip) return;
    const nextTitle = window.prompt("Rename clip", clip.title || "Untitled clip");
    if (nextTitle === null) return;
    const title = nextTitle.trim();
    if (!title) { showToast("Clip title cannot be empty."); return; }
    if (title.length > 160) { showToast("Clip title must be 160 characters or fewer."); return; }
    try {
      const result = await api(`/api/clips/${encodeURIComponent(clip.id)}`, { method: "PATCH", body: JSON.stringify({ title }) });
      clips = clips.map((item) => item.id === clip.id ? result.clip : item);
      renderClipLibrary();
      showToast("Clip renamed.");
    } catch (error) { showToast(`Could not rename clip: ${error.message}`); }
    return;
  }
  const previewButton = event.target.closest("[data-preview-clip]");
  if (previewButton) {
    const clip = clips.find((item) => item.id === previewButton.dataset.previewClip);
    if (!clip) return;
    if (clip.status !== "ready" || !clip.downloadUrl) { showToast("This clip is not ready for preview yet."); return; }
    clipPreviewTitle.textContent = clip.title || "Clip preview";
    clipPreviewVideo.pause();
    clipPreviewVideo.removeAttribute("src");
    clipPreviewVideo.load();
    try {
      const response = await fetch(`/api/clips/${encodeURIComponent(clip.id)}/download`);
      if (!response.ok) throw new Error("The rendered clip is no longer available.");
      const blobUrl = URL.createObjectURL(await response.blob());
      clipPreviewVideo.dataset.previewBlobUrl = blobUrl;
      clipPreviewVideo.src = blobUrl;
      clipPreviewVideo.onloadedmetadata = () => clipPreviewVideo.play().catch(() => {});
      clipPreviewVideo.ontimeupdate = null;
      clipPreviewDialog.showModal();
    } catch (error) {
      showToast(`Could not load clip preview: ${error.message}`);
    }
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
      const clip = clips.find((item) => item.id === downloadButton.dataset.downloadClip);
      const safeTitle = String(clip?.title || "ClipForge clip")
        .replace(/[<>:"/\\|?*\\x00-\\x1F]/g, "_")
        .replace(/\\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "")
        .slice(0, 100) || "ClipForge clip";
      link.download = `${safeTitle}.mp4`;
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
document.querySelector("#close-clip-details")?.addEventListener("click", () => clipDetailsDialog?.close());
detailsDownloadClipButton?.addEventListener("click", () => {
  const clipId = detailsDownloadClipButton.dataset.downloadClip;
  if (!clipId || detailsDownloadClipButton.disabled) return;
  clipLibrary?.querySelector(`[data-download-clip="${CSS.escape(clipId)}"]`)?.click();
  clipDetailsDialog?.close();
});
document.querySelector("#close-clip-preview")?.addEventListener("click", () => { clipPreviewVideo.pause(); const blobUrl = clipPreviewVideo.dataset.previewBlobUrl; if (blobUrl) URL.revokeObjectURL(blobUrl); delete clipPreviewVideo.dataset.previewBlobUrl; clipPreviewVideo.removeAttribute("src"); clipPreviewVideo.load(); clipPreviewDialog.close(); });
clipPreviewDialog?.addEventListener("close", () => { clipPreviewVideo.pause(); const blobUrl = clipPreviewVideo.dataset.previewBlobUrl; if (blobUrl) URL.revokeObjectURL(blobUrl); delete clipPreviewVideo.dataset.previewBlobUrl; clipPreviewVideo.removeAttribute("src"); clipPreviewVideo.load(); });
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
  const pollingProjectId = currentProject?.id;
  for (let attempt = 0; attempt < 450; attempt += 1) {
    if (automaticClipFailures.has(videoId) || currentProject?.id !== pollingProjectId) return;
    try {
      const status = await api(`/api/videos/${encodeURIComponent(videoId)}/auto-clip-status`);
      const scopedAutomaticClips = status.clips.filter((clip) => clip.projectId === currentProject?.id);
      clips = [...scopedAutomaticClips, ...clips.filter((clip) => clip.projectId === currentProject?.id && (clip.videoId !== videoId || clip.generation !== "auto-ai"))];
      renderClipLibrary();
      if (status.total === 0) {
        showToast(status.analysisInProgress
          ? (status.transcriptReady
            ? "Transcript ready. ClipForge is selecting the strongest moments…"
            : "ClipForge is preparing the transcript and strongest moments…")
          : "Waiting for automatic AI analysis to begin…");
      }
      if (status.total > 0 && status.processing === 0) {
        showToast(status.failed ? `Automatic clipping finished: ${status.ready} clips ready, ${status.failed} failed.` : `Automatic clipping finished: ${status.ready} clips are ready.`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
