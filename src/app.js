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
const generateContentPackButton = document.querySelector("#generate-content-pack");
const savePerformanceButton = document.querySelector("#save-performance");
const performanceLogSection = document.querySelector("#clip-performance-log");
const clipContentPack = document.querySelector("#clip-content-pack");
const clipContentPackList = document.querySelector("#clip-content-pack-list");
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
let uploadInFlight = false;
const clipSearch = document.querySelector("#clip-search");
const clearClipSearchButton = document.querySelector("#clear-clip-search");
const clipFilter = document.querySelector("#clip-filter");
const clipSort = document.querySelector("#clip-sort");
const clearClipFiltersButton = document.querySelector("#clear-clip-filters");
const librarySummary = document.querySelector("#clip-status-summary" );
const libraryProjectOverview = document.querySelector("#library-project-overview");
const libraryProjectProgress = document.querySelector("#library-project-progress");
const libraryProjectProgressBar = document.querySelector("#library-project-progress-bar");
const libraryProjectProgressLabel = document.querySelector("#library-project-progress-label");
const libraryProducerPlanButton = document.querySelector("#library-producer-plan");
const libraryProducerCreateButton = document.querySelector("#library-producer-create");
const libraryProducerPlan = document.querySelector("#library-producer-plan-result");

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
const newProjectButton = document.querySelector("#new-project");
const fullscreenButton = document.querySelector("#fullscreen-button");
const accountButton = document.querySelector("#account-button");
const dashboardSettingsButton = document.querySelector("#dashboard-settings");
const dashboardLogoutButton = document.querySelector("#dashboard-logout");
const dashboardNewProjectButton = document.querySelector("#dashboard-new-project");
const dashboardOpenEditorButton = document.querySelector("#dashboard-open-editor");
const dashboardOpenLibraryButton = document.querySelector("#dashboard-open-library");
const dashboardOpenSettingsButton = document.querySelector("#dashboard-open-settings");
const settingsSignoutButton = document.querySelector("#settings-signout");
const accountDialog = document.querySelector("#account-dialog");
const accountDialogSave = document.querySelector("#account-dialog-save");
const accountLoginButton = document.querySelector("#account-login-button");
const accountSignupButton = document.querySelector("#account-signup-button");
const loginEmailInput = document.querySelector("#login-email");
const loginPasswordInput = document.querySelector("#login-password");
const signupEmailInput = document.querySelector("#signup-email");
const signupPasswordInput = document.querySelector("#signup-password");
const accountEmailInput = document.querySelector("#account-email");
const accountPasswordInput = document.querySelector("#account-password");
const accountDialogEmail = document.querySelector("#account-dialog-email");
const settingsMenuItems = document.querySelectorAll("[data-settings-tab]");
const settingsPanels = document.querySelectorAll("[data-settings-panel]");

const volumeInput = document.querySelector("#volume-input");
let libraryQuery = "";
let libraryFilter = "all";
let librarySort = "newest";
let timelineMaximum = Number(endInput.max);
const storageKey = "clipforge-exports";
const sessionKey = "clipforge-session";
const identityKey = "clipforge-identity";
const styleKey = "clipforge-caption-style";
const favoriteKey = "clipforge-favorite-clips";
const transcriptionLanguageKey = "clipforge-transcription-language";
const transcriptionLanguage = document.querySelector("#transcription-language");
const captionLanguageSelect = document.querySelector("#caption-language");
const captionLanguageKey = "clipforge-caption-language";
const safeStorageParse = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
};
let clips = [];
const selectedClipIds = new Set();
const savedFavoriteClipIds = safeStorageParse(favoriteKey, []);
const favoriteClipIds = new Set(Array.isArray(savedFavoriteClipIds) ? savedFavoriteClipIds : []);
const automaticClipFailures = new Set();
const automaticClipPolls = new Set();
let apiSession = safeStorageParse(sessionKey, null);
let sourceVideo;
let sourcePreviewUrl;
let previewElement;
let currentProject;
let workspaceLoadVersion = 0;
let statusPollInFlight = false;
let captionStyle = safeStorageParse(styleKey, { color: "lime", weight: "bold" });
if (!captionStyle || typeof captionStyle !== "object" || Array.isArray(captionStyle)) captionStyle = { color: "lime", weight: "bold" };

const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", ...(apiSession?.token ? { authorization: `Bearer ${apiSession.token}` } : {}), ...options.headers } });
  if (response.status === 204) return null;
  const raw = await response.text();
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = { error: raw || `Request failed (HTTP ${response.status}).` }; }
  if (!response.ok) { const error = new Error(result.error || `Request failed (HTTP ${response.status}).`); error.status = response.status; throw error; }
  return result;
};

function renderDashboard(projects = []) {
  const grid = document.querySelector("#project-grid");
  if (!grid) return;
  const count = document.querySelector("#dashboard-project-count");
  if (count) count.textContent = String(projects.length);
  grid.replaceChildren(...projects.map((project, index) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open ${project.name}`);
    card.innerHTML = '<div><div class="project-card-mark"></div><div class="project-card-copy"><h3></h3><p>AI clipping workspace</p></div></div><span class="project-card-arrow" aria-hidden="true">→</span>';
    card.querySelector(".project-card-mark").textContent = String(index + 1).padStart(2, "0");
    card.querySelector("h3").textContent = project.name;
    card.addEventListener("click", () => openProject(project.id));
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openProject(project.id); } });
    return card;
  }));
}

async function openProject(projectId) {
  await loadProject(projectId);
  switchView("editor");
  history.replaceState(null, "", "#editor");
}
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
  const loadVersion = ++workspaceLoadVersion;
  const { projects } = await api("/api/projects");
  if (loadVersion !== workspaceLoadVersion) return;
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project not found.");
  currentProject = project;
  document.querySelector("#workspace-title").textContent = currentProject.name;
  if (projectSelect) projectSelect.value = project.id;
  const videos = (await api(`/api/videos?projectId=${encodeURIComponent(project.id)}`)).videos;
  if (loadVersion !== workspaceLoadVersion) return;
  sourceVideo = videos[0];
  const deleteSourceButton = document.querySelector("#delete-source-video");
  if (sourceVideo) { restoreSourcePreview(sourceVideo); if (deleteSourceButton) deleteSourceButton.hidden = false; } else { clearSourcePreview(); if (deleteSourceButton) deleteSourceButton.hidden = true; }
  const result = await api("/api/clips");
  if (loadVersion !== workspaceLoadVersion) return;
  clips = result.clips.filter((clip) => clip.projectId === project.id);
  selectedClipIds.clear();
  renderClipLibrary();
  if (sourceVideo?.autoClipStatus?.status === "processing") void pollAutoClipStatus(sourceVideo.id);
}

async function ensureWorkspace() {
  const loadVersion = ++workspaceLoadVersion;
  try {
    if (!apiSession) {
      const savedIdentity = safeStorageParse(identityKey, null);
      if (savedIdentity?.email) {
        throw Object.assign(new Error("Please log in to continue."), { status: 401 });
      }
      throw Object.assign(new Error("Create a ClipForge account or log in to continue."), { status: 401 });
    }
    const { projects } = await api("/api/projects");
    if (loadVersion !== workspaceLoadVersion) return false;
    if (projects.length) currentProject = projects[0];
    else {
      const createdProject = (await api("/api/projects", { method: "POST", body: JSON.stringify({ name: "Midnight Sessions" }) })).project;
      if (loadVersion !== workspaceLoadVersion) return false;
      if (!createdProject?.id) throw new Error("Project creation returned an invalid project.");
      currentProject = createdProject;
      projects.push(currentProject);
    }
    document.querySelector("#workspace-title").textContent = currentProject.name;
    renderProjectSelector(projects);
    renderDashboard(projects);
    const account = document.querySelector("#dashboard-account-email");
    if (account) account.textContent = apiSession?.user?.email || "ClipForge account";
    const videos = (await api(`/api/videos?projectId=${encodeURIComponent(currentProject.id)}`)).videos;
    if (loadVersion !== workspaceLoadVersion) return false;
    sourceVideo = videos[0];
    const deleteSourceButton = document.querySelector("#delete-source-video");
    if (sourceVideo) {
      restoreSourcePreview(sourceVideo);
      if (deleteSourceButton) deleteSourceButton.hidden = false;
    } else {
      clearSourcePreview();
      if (deleteSourceButton) deleteSourceButton.hidden = true;
    }
    const clipResult = await api("/api/clips");
    if (loadVersion !== workspaceLoadVersion) return false;
    clips = clipResult.clips.filter((clip) => clip.projectId === currentProject?.id);
    renderClipLibrary();
    if (sourceVideo?.autoClipStatus?.status === "processing") void pollAutoClipStatus(sourceVideo.id);
    return true;
  } catch (error) {
    if (error.status === 401) {
      apiSession = null;
      window.localStorage.removeItem(sessionKey);
      try {
        throw new Error("Your ClipForge session expired. Please log in again.");
        const { projects } = await api("/api/projects");
        if (loadVersion !== workspaceLoadVersion) return false;
        if (projects.length) currentProject = projects[0];
        else {
          const createdProject = (await api("/api/projects", { method: "POST", body: JSON.stringify({ name: "Midnight Sessions" }) })).project;
          if (loadVersion !== workspaceLoadVersion) return false;
          if (!createdProject?.id) throw new Error("Project creation returned an invalid project.");
          currentProject = createdProject;
          projects.push(currentProject);
        }
        document.querySelector("#workspace-title").textContent = currentProject.name;
        renderProjectSelector(projects);
        const videos = (await api(`/api/videos?projectId=${encodeURIComponent(currentProject.id)}`)).videos;
        if (loadVersion !== workspaceLoadVersion) return false;
        sourceVideo = videos[0];
        const deleteSourceButton = document.querySelector("#delete-source-video");
        if (sourceVideo) {
          restoreSourcePreview(sourceVideo);
          if (deleteSourceButton) deleteSourceButton.hidden = false;
        } else {
          clearSourcePreview();
          if (deleteSourceButton) deleteSourceButton.hidden = true;
        }
        const clipResult = await api("/api/clips");
        if (loadVersion !== workspaceLoadVersion) return false;
        clips = clipResult.clips.filter((clip) => clip.projectId === currentProject?.id);
        renderClipLibrary();
        return true;
      } catch (retryError) {
        if (loadVersion === workspaceLoadVersion) showToast(`Backend unavailable: ${retryError.message}`);
      }
    } else {
      if (loadVersion === workspaceLoadVersion) showToast(`Backend unavailable: ${error.message}`);
    }
    if (loadVersion !== workspaceLoadVersion) return false;
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
  stopPlayback();
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
  stopPlayback();
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
  const maximum = Number.isFinite(timelineMaximum) && timelineMaximum > 0 ? timelineMaximum : 1;
  if (timelineMaximum !== maximum) timelineMaximum = maximum;
  const clipRange = normalizeClipRange(startInput.value, endInput.value, maximum);
  startInput.value = clipRange.start;
  endInput.value = clipRange.end;
  const duration = clipDuration(clipRange.start, clipRange.end);
  durationLabel.textContent = `${formatTimestamp(duration)} clip`;
  range.style.left = `${(clipRange.start / maximum) * 100}%`;
  range.style.width = `${(duration / maximum) * 100}%`;
  playhead.style.left = `${(clipRange.start / maximum) * 100}%`;
  if (previewElement) previewElement.currentTime = Math.min(clipRange.start, Math.max(0, (previewElement.duration || maximum) - 0.05));
}

async function uploadSource(file) {
  if (!file) return;
  const maxUploadBytes = 250 * 1024 * 1024;
  if (file.size > maxUploadBytes) throw new Error("This video is too large. ClipForge currently accepts videos up to 250 MB.");
  if (!apiSession || !currentProject) {
    await ensureWorkspace().then(() => switchView("dashboard"));
    if (!apiSession || !currentProject) throw new Error("ClipForge could not connect your workspace. Refresh and try again.");
  }
  const uploadProjectId = currentProject.id;
  const previousSourceVideo = sourceVideo;
  if (uploadInFlight) throw new Error("Another video upload is already in progress.");
  uploadInFlight = true;
  let uploadCommitted = false;
  try {
  // Do not require the browser to decode the entire source before uploading.
  // Long files and some codecs can make browser metadata probing fail even when
  // FFmpeg on the server can read the video correctly. The server now probes
  // duration after the upload is safely stored.
  let duration = 0;

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
  const upload = await new Promise(async (resolve, reject) => {
    const uploadId = crypto.randomUUID();
    const chunkSize = 10 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    let completedBytes = 0;
    try {
      for (let index = 0; index < totalChunks; index += 1) {
        const chunk = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize));
        let attempts = 0;
        let uploaded = false;
        while (!uploaded && attempts < 3) {
          attempts += 1;
          const result = await new Promise((chunkResolve, chunkReject) => {
            const request = new XMLHttpRequest();
            activeUploadRequest = request;
            request.open("POST", "/api/uploads/chunk");
            request.timeout = 15 * 60 * 1000;
            request.setRequestHeader("content-type", contentType);
            request.setRequestHeader("x-filename", file.name);
            request.setRequestHeader("x-upload-id", uploadId);
            request.setRequestHeader("x-upload-index", String(index));
            request.setRequestHeader("x-upload-total", String(totalChunks));
            request.setRequestHeader("x-upload-size", String(file.size));
            if (apiSession?.token) request.setRequestHeader("authorization", "Bearer " + apiSession.token);
            request.upload.onprogress = (event) => {
              if (!event.lengthComputable) return;
              const percent = Math.min(100, Math.round(((completedBytes + event.loaded) / file.size) * 100));
              if (uploadProgressBar) uploadProgressBar.value = percent;
              if (uploadProgressPercent) uploadProgressPercent.textContent = percent + "%";
              if (uploadProgressLabel) uploadProgressLabel.textContent = "Uploading video…";
            };
            request.onload = () => {
              let data = {};
              try { data = JSON.parse(request.responseText || "{}"); } catch {}
              if (request.status >= 200 && request.status < 300) chunkResolve(data);
              else chunkReject(new Error(data.error || "Upload chunk failed (HTTP " + request.status + ")."));
            };
            request.onerror = () => chunkReject(new Error("Upload chunk failed: network connection was interrupted."));
            request.ontimeout = () => chunkReject(new Error("Upload chunk timed out."));
            request.onabort = () => chunkReject(new Error("Upload was cancelled."));
            request.send(chunk);
          }).catch((error) => {
            if (attempts >= 3) throw error;
            showToast("Connection interrupted. Retrying this upload section…");
            return null;
          });
          if (result !== null) uploaded = true;
        }
        completedBytes += chunk.size;
        const percent = Math.min(100, Math.round((completedBytes / file.size) * 100));
        if (uploadProgressBar) uploadProgressBar.value = percent;
        if (uploadProgressPercent) uploadProgressPercent.textContent = percent + "%";
        if (uploadProgressLabel) uploadProgressLabel.textContent = "Uploading video…";
      }
      const completed = await api("/api/uploads/complete", {
        method: "POST",
        body: JSON.stringify({ uploadId, filename: file.name, totalChunks, totalSize: file.size })
      });
      resolve(completed);
    } catch (error) {
      reject(error);
    }
  });
  activeUploadRequest = null;
  const uploadedVideo = (await api("/api/videos", { method: "POST", body: JSON.stringify({ projectId: uploadProjectId, name: file.name, sourceUrl: upload.url }) })).video;
  duration = Number(uploadedVideo?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("ClipForge could not read the uploaded video's duration on the server.");
  if (currentProject?.id !== uploadProjectId) {
    showToast("Video uploaded to the original project. The current project was changed during upload.");
    return;
  }
  sourceVideo = uploadedVideo;
  uploadCommitted = true;
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
  showToast("Video uploaded. ClipForge AI is starting automatic clipping…");
  const generationButton = document.querySelector("#run-ai-generation");
  if (generationButton && !generationButton.disabled) {
    window.setTimeout(() => generationButton.click(), 150);
  } else {
    document.querySelector("#transcript-dialog")?.showModal();
  }
  } finally {
    if (!uploadCommitted) {
      if (currentProject?.id === uploadProjectId && previousSourceVideo?.id) restoreSourcePreview(previousSourceVideo);
      else if (currentProject?.id === uploadProjectId) clearSourcePreview();
      uploadProgress?.setAttribute("hidden", "");
    }
    uploadInFlight = false;
    activeUploadRequest = null;
  }
}

async function refreshClipStatuses({ showReadyToast = false } = {}) {
  if (!apiSession || !clips.length) return;
  const pollingProjectId = currentProject?.id;
  try {
    const previous = new Map(clips.map((clip) => [clip.id, clip.status]));
    const result = await api("/api/clips");
    if (currentProject?.id !== pollingProjectId) return;
    clips = result.clips.filter((clip) => clip.projectId === pollingProjectId);
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
  statusPollTimer = undefined;
  if (!clips.some((clip) => !["ready", "failed"].includes(clip.status))) return;
  const pollingProjectId = currentProject?.id;
  statusPollTimer = window.setInterval(async () => {
    if (currentProject?.id !== pollingProjectId) {
      window.clearInterval(statusPollTimer);
      statusPollTimer = undefined;
      return;
    }
    if (statusPollInFlight) return;
    statusPollInFlight = true;
    try {
      await refreshClipStatuses({ showReadyToast: true });
    } finally {
      statusPollInFlight = false;
    }
    if (currentProject?.id !== pollingProjectId || !clips.some((clip) => !["ready", "failed"].includes(clip.status))) {
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


async function loadProducerPlan() {
  if (!currentProject?.id || !libraryProducerPlanButton || !libraryProducerPlan) return;
  libraryProducerPlanButton.disabled = true;
  libraryProducerPlanButton.textContent = "Planning…";
  try {
    const result = await api("/api/projects/" + encodeURIComponent(currentProject.id) + "/producer-plan");
    const plan = result.plan || {};
    const priorities = (plan.priorities || []).map((item) => "<li><b>" + escapeHtml(item.label) + "</b><span>" + escapeHtml(item.recommendation) + "</span></li>").join("");
    const performance = plan.performance || {};
    const proven = (plan.provenTypes || []).join(", ");
    const learning = performance.trackedClips ? "Performance: " + performance.trackedClips + " tracked · " + performance.totals.views.toLocaleString() + " views · " + (performance.engagementRate ?? 0) + "% engagement" + (proven ? " · Proven: " + escapeHtml(proven) : "") : "No performance data yet — log published clip results to teach the Producer what your audience responds to.";
    const mix = (plan.mix || []).slice(0, 5).map((item) => escapeHtml(item.label) + ": " + item.count).join(" · ");
    const nextPublish = plan.nextPublish?.label ? "<div class=\"producer-next-publish\"><b>Next publish:</b> " + escapeHtml(plan.nextPublish.label) + " <small>(" + escapeHtml(plan.nextPublish.confidence || "medium") + " confidence)</small><span>" + escapeHtml(plan.nextPublish.reason || "") + "</span></div>" : "";
    const platformSummary = (performance.byPlatform || []).slice(0, 3).map((item) => escapeHtml(item.platform) + ": " + item.views.toLocaleString() + " views").join(" · ");
    const platformRecommendation = plan.platformRecommendation?.reason ? "<p><b>Platform focus:</b> " + escapeHtml(plan.platformRecommendation.reason) + "</p>" : "";
    const platformEngagement = plan.platformRecommendation?.engagementReason ? "<p><b>Engagement signal:</b> " + escapeHtml(plan.platformRecommendation.engagementReason) + "</p>" : "";
    const nextPublishPlan = plan.nextPublishPlan?.typeLabel
      ? "<div class=\"producer-next-publish producer-next-publish-plan\"><b>Next publish recipe:</b> " + escapeHtml(plan.nextPublishPlan.typeLabel) + (plan.nextPublishPlan.platform ? " on " + escapeHtml(plan.nextPublishPlan.platform) : "") + " <small>(" + escapeHtml(plan.nextPublishPlan.confidence || "medium") + " confidence)</small><span>" + escapeHtml(plan.nextPublishPlan.reason || "") + "</span></div>"
      : "";

    const targetTypes = (plan.priorities || []).map((item) => item.type).filter(Boolean).slice(0, 3);
    if (libraryProducerCreateButton) {
      libraryProducerCreateButton.disabled = !sourceVideo?.id || !targetTypes.length;
      libraryProducerCreateButton.dataset.targetTypes = targetTypes.join(",");
      libraryProducerCreateButton.textContent = targetTypes.length ? "Create priority clips" : "Priority mix complete";
    }
    libraryProducerPlan.innerHTML = "<div class=\"producer-plan-head\"><strong>AI Producer Plan</strong><span>" + escapeHtml(plan.strategy?.label || "Creator") + "</span></div>" +
      "<p>" + (plan.averageScore === null ? "No scored clips yet." : "Average AI score: <b>" + plan.averageScore + "/100</b>") + (mix ? " · " + mix : "") + "</p>" +
      "<p>" + learning + "</p>" + (platformSummary ? "<p>Platforms: " + platformSummary + "</p>" : "") + platformRecommendation + platformEngagement + nextPublishPlan + nextPublish + (priorities ? "<ul>" + priorities + "</ul>" : "<p>Your current clip mix covers the main intelligence types. Keep rotating formats to avoid repetition.</p>");
    libraryProducerPlan.hidden = false;
  } catch (error) {
    showToast("Producer plan unavailable: " + error.message);
  } finally {
    libraryProducerPlanButton.disabled = false;
    libraryProducerPlanButton.textContent = "AI Producer Plan";
  }
}

async function createProducerPriorityClips() {
  const videoId = sourceVideo?.id;
  const projectId = currentProject?.id;
  const targetTypes = String(libraryProducerCreateButton?.dataset.targetTypes || "").split(",").map((type) => type.trim()).filter(Boolean).slice(0, 3);
  if (!videoId || !projectId || !targetTypes.length) {
    showToast("Upload a source video first, then load the AI Producer Plan.");
    return;
  }
  libraryProducerCreateButton.disabled = true;
  libraryProducerCreateButton.textContent = "Creating…";
  try {
    const format = document.querySelector(".format-option.selected")?.dataset.format || "9:16";
    const profile = window.localStorage.getItem("clipforge-content-profile") || "creator";
    const result = await api("/api/videos/" + encodeURIComponent(videoId) + "/auto-clip", {
      method: "POST",
      body: JSON.stringify({
        limit: 12,
        format,
        style: captionStyle,
        language: transcriptionLanguage?.value || "en",
        profile,
        targetTypes,
      }),
    });
    renderClipLibrary();
    void pollAutoClipStatus(videoId);
    showToast("Producer is creating a priority mix: " + targetTypes.join(", ") + ".");
  } catch (error) {
    showToast("Priority clip creation failed: " + error.message);
  } finally {
    libraryProducerCreateButton.disabled = false;
    libraryProducerCreateButton.textContent = "Create priority clips";
  }
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
    const sourceDuration = sourceVideo?.duration ? Number(sourceVideo.duration) : 0;
    const progressPercent = clips.length ? Math.round((readyCount / clips.length) * 100) : 0;
    if (libraryProjectProgressBar) libraryProjectProgressBar.value = progressPercent;
    if (libraryProjectProgressLabel) libraryProjectProgressLabel.textContent = `${progressPercent}%`;
    if (libraryProjectProgress) libraryProjectProgress.hidden = clips.length === 0;
    const intelligenceCounts = clips.reduce((counts, clip) => { const type = String(clip.highlightType || "").trim(); if (type) counts[type] = (counts[type] || 0) + 1; return counts; }, {});
    const intelligenceSummary = Object.entries(intelligenceCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type, count]) => `${type}: ${count}`).join(" · ");
    const strongestClip = [...clips].sort((a, b) => Number(b.aiScore || 0) - Number(a.aiScore || 0))[0];
    const strategyLabel = String(clips.find((clip) => clip.contentProfileLabel)?.contentProfileLabel || "").trim();
    const scoredClips = clips.filter((clip) => Number.isFinite(Number(clip.aiScore)));
    const averageScore = scoredClips.length ? Math.round(scoredClips.reduce((sum, clip) => sum + Number(clip.aiScore), 0) / scoredClips.length) : 0;
    const contentDna = strongestClip && Number(strongestClip.aiScore) > 0
      ? "Content DNA: " + (strategyLabel ? escapeHtml(strategyLabel) + " · " : "") + escapeHtml(String(strongestClip.highlightType || "insight")) + " lead · " + averageScore + "/100 avg AI score"
      : strategyLabel
        ? "Content DNA: " + escapeHtml(strategyLabel) + (intelligenceSummary ? " · " + escapeHtml(intelligenceSummary) : "")
        : "";
    const trackedPerformance = clips.filter((clip) => clip?.performance && Number.isFinite(Number(clip.performance.views)));
    const performanceViews = trackedPerformance.reduce((sum, clip) => sum + Math.max(0, Number(clip.performance.views) || 0), 0);
    const performanceEngagements = trackedPerformance.reduce((sum, clip) => sum + Math.max(0, Number(clip.performance.likes) || 0) + Math.max(0, Number(clip.performance.comments) || 0) + Math.max(0, Number(clip.performance.shares) || 0), 0);
    const performanceRate = performanceViews ? ((performanceEngagements / performanceViews) * 100).toFixed(2) : null;
    const performanceTypes = {};
    trackedPerformance.forEach((clip) => {
      const type = String(clip.highlightType || "insight").trim() || "insight";
      const entry = performanceTypes[type] || { views: 0, engagements: 0 };
      entry.views += Math.max(0, Number(clip.performance.views) || 0);
      entry.engagements += Math.max(0, Number(clip.performance.likes) || 0) + Math.max(0, Number(clip.performance.comments) || 0) + Math.max(0, Number(clip.performance.shares) || 0);
      performanceTypes[type] = entry;
    });
    const bestPerformance = Object.entries(performanceTypes).sort((a, b) => (b[1].engagements / Math.max(1, b[1].views)) - (a[1].engagements / Math.max(1, a[1].views)))[0];
    const performanceDna = trackedPerformance.length
      ? "Performance DNA: " + trackedPerformance.length + " tracked · " + performanceViews.toLocaleString() + " views" + (performanceRate !== null ? " · " + performanceRate + "% engagement" : "") + (bestPerformance ? " · " + escapeHtml(bestPerformance[0]) + " leads engagement" : "")
      : "";
    libraryProjectOverview.innerHTML = "<strong>" + projectName.replace(/[&<>]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[char])) + "</strong><span>" + sourceCount + " source video" + (sourceCount === 1 ? "" : "s") + "</span><span>" + (sourceDuration ? formatTimestamp(sourceDuration) + " source length" : "Source not loaded") + "</span><span>" + clips.length + " clips</span><span>" + readyCount + " ready</span><span>" + favoriteCount + " favorite" + (favoriteCount === 1 ? "" : "s") + "</span><span>" + formatTimestamp(readyDuration) + " rendered</span>" + (intelligenceSummary ? "<span>Intelligence: " + escapeHtml(intelligenceSummary) + "</span>" : "") + (contentDna ? "<span>" + contentDna + "</span>" : "") + (performanceDna ? "<span>" + performanceDna + "</span>" : "");
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
    const aiReason = String(clip.aiReason || "").trim();
    const strategyLabel = String(clip.contentProfileLabel || "").trim();
    const highlightType = String(clip.highlightType || "").trim();
    const hookLine = String(clip.hookLine || "").trim();
    const socialCaption = String(clip.socialCaption || "").trim();
    const libraryRelationship = clip.libraryRelationship && typeof clip.libraryRelationship === "object" ? String(clip.libraryRelationship.type || "").trim() : "";
    const intelligence = (aiReason || strategyLabel || highlightType || hookLine || socialCaption) ? `<div class="clip-intelligence"><span>${highlightType ? escapeHtml(highlightType) : "AI pick"}${strategyLabel ? " · " + escapeHtml(strategyLabel) : ""}</span>${hookLine ? `<p><strong>Hook:</strong> ${escapeHtml(hookLine)}</p>` : ""}${socialCaption ? `<p><strong>Caption:</strong> ${escapeHtml(socialCaption)}</p>` : ""}${libraryRelationship && libraryRelationship !== "new" ? `<p><strong>Library:</strong> ${escapeHtml(libraryRelationship)}</p>` : ""}${aiReason ? `<p>${escapeHtml(aiReason)}</p>` : ""}</div>` : "";
const packageButton = (hookLine || socialCaption || title !== "Untitled clip")
  ? `<button class="text-button copy-package-clip" type="button" data-copy-package-clip="${clipId}">Copy content package</button>`
  : "";
    return `<article class="clip-card${favoriteClipIds.has(clip.id) ? " is-favorite" : ""}"><label class="clip-select"><input type="checkbox" data-select-clip="${clipId}" ${selectedClipIds.has(clip.id) ? "checked" : ""} aria-label="Select ${title}" /></label><div class="clip-card-art ${formatClass}"><span>${format}</span><p>${clip.captions ? "CC" : "No captions"}</p></div><div><h3>${title}</h3>${intelligence}<button class="text-button favorite-clip" type="button" data-favorite-clip="${clipId}" aria-pressed="${favoriteClipIds.has(clip.id)}">${favoriteClipIds.has(clip.id) ? "★ Favorited" : "☆ Favorite"}</button><button class="text-button rename-clip" type="button" data-rename-clip="${clipId}">Rename</button><button class="text-button details-clip" type="button" data-details-clip="${clipId}">Details</button>${packageButton}<p>${formatTimestamp(clip.start)}–${formatTimestamp(clip.end)} · ${formatTimestamp(clipDuration(clip.start, clip.end))}</p><button class="text-button clip-source-link" type="button" data-open-source="${clip.videoId}">Source: ${escapeHtml(sourceVideo?.id === clip.videoId ? sourceVideo.name : "Source video")}</button><small>Exported ${new Date(clip.createdAt).toLocaleDateString()}</small><div>${status}</div></div><button class="delete-clip" type="button" data-delete-clip="${clipId}" aria-label="Delete ${title}">×</button></article>`;
  }).join("");
  updateBulkClipControls();
  if (librarySelectionSummary) librarySelectionSummary.textContent = `${selectedClipIds.size} selected`;
  if (selectAllClipsButton) { const readyTotal = clips.filter((clip) => clip.status === "ready").length; const readySelected = clips.filter((clip) => clip.status === "ready" && selectedClipIds.has(clip.id)).length; selectAllClipsButton.textContent = readyTotal > 0 && readySelected === readyTotal ? "Clear ready" : "Select ready"; }
  if (selectReadyClipsButton) { const readyTotal = clips.filter((clip) => clip.status === "ready").length; const readySelected = clips.filter((clip) => clip.status === "ready" && selectedClipIds.has(clip.id)).length; selectReadyClipsButton.textContent = readyTotal > 0 && readySelected === readyTotal ? "Clear ready" : "Select ready"; }

  if (selectFailedClipsButton) { const failedTotal = clips.filter((clip) => clip.status === "failed").length; const failedSelected = clips.filter((clip) => clip.status === "failed" && selectedClipIds.has(clip.id)).length; selectFailedClipsButton.textContent = failedTotal > 0 && failedSelected === failedTotal ? "Clear failed" : "Select failed"; }
  if (selectRenderingClipsButton) { const renderingTotal = clips.filter((clip) => !["ready", "failed"].includes(clip.status)).length; const renderingSelected = clips.filter((clip) => !["ready", "failed"].includes(clip.status) && selectedClipIds.has(clip.id)).length; selectRenderingClipsButton.textContent = renderingTotal > 0 && renderingSelected === renderingTotal ? "Clear rendering" : "Select rendering"; }

  if (selectAllStatusClipsButton) { selectAllStatusClipsButton.textContent = selectedClipIds.size === clips.length && clips.length > 0 ? "Clear all" : "Select all statuses"; }
  if (invertClipSelectionButton) { invertClipSelectionButton.textContent = selectedClipIds.size === clips.length && clips.length > 0 ? "Clear all" : "Invert selection"; }

  if (selectVisibleClipsButton) { const query = libraryQuery.trim().toLowerCase(); const visible = clips.filter((clip) => { const title = String(clip.title || ""); const matchesQuery = !query || title.toLowerCase().includes(query); const matchesFilter = libraryFilter === "all" || (libraryFilter === "favorites" ? favoriteClipIds.has(clip.id) : (libraryFilter === "rendering" ? !["ready", "failed"].includes(clip.status) : clip.status === libraryFilter)); return matchesQuery && matchesFilter; }); const visibleSelected = visible.filter((clip) => selectedClipIds.has(clip.id)).length; selectVisibleClipsButton.textContent = visible.length > 0 && visibleSelected === visible.length ? "Clear visible" : "Select visible"; }
  if (selectUntaggedClipsButton) { const uncaptioned = clips.filter((clip) => !clip.captions); const selected = uncaptioned.filter((clip) => selectedClipIds.has(clip.id)); selectUntaggedClipsButton.textContent = uncaptioned.length > 0 && selected.length === uncaptioned.length ? "Clear no captions" : "Select no captions"; }
  if (selectCaptionedClipsButton) { const captioned = clips.filter((clip) => Boolean(clip.captions)); const selected = captioned.filter((clip) => selectedClipIds.has(clip.id)); selectCaptionedClipsButton.textContent = captioned.length > 0 && selected.length === captioned.length ? "Clear captions" : "Select captions"; }
  if (selectLongClipsButton) { const longClips = clips.filter((clip) => clipDuration(clip.start, clip.end) >= 60); const selected = longClips.filter((clip) => selectedClipIds.has(clip.id)); selectLongClipsButton.textContent = longClips.length > 0 && selected.length === longClips.length ? "Clear long clips" : "Select long clips"; }
  if (selectShortClipsButton) { const shortClips = clips.filter((clip) => clipDuration(clip.start, clip.end) < 60); const selected = shortClips.filter((clip) => selectedClipIds.has(clip.id)); selectShortClipsButton.textContent = shortClips.length > 0 && selected.length === shortClips.length ? "Clear short clips" : "Select short clips"; }
}

async function refreshClipLibraryWhileRendering() {
  const pollingProjectId = currentProject?.id;
  for (let attempt = 0; attempt < 1800; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (currentProject?.id !== pollingProjectId) return;
    try {
      const result = await api("/api/clips");
      if (currentProject?.id !== pollingProjectId) return;
      clips = result.clips.filter((clip) => clip.projectId === pollingProjectId);
      renderClipLibrary();
      if (!clips.some((clip) => !["ready", "failed"].includes(clip.status))) break;
    } catch {
      // Keep polling through temporary API/network failures; the next attempt can recover.
    }
  }
}

async function pollAutoClipStatus(videoId) {
  if (!videoId || automaticClipPolls.has(videoId)) return;
  automaticClipPolls.add(videoId);
  const pollingProjectId = currentProject?.id;
  try {
    for (let attempt = 0; attempt < 900; attempt += 1) {
      if (currentProject?.id !== pollingProjectId || sourceVideo?.id !== videoId) return;
      const language = transcriptionLanguage?.value || "auto";
      const captionLanguage = captionLanguageSelect?.value || safeStorageParse(captionLanguageKey, "original");
      try {
        const result = await api(`/api/videos/${encodeURIComponent(videoId)}/auto-clip-status?language=${encodeURIComponent(language)}&captionLanguage=${encodeURIComponent(captionLanguage)}`);
        if (currentProject?.id !== pollingProjectId || sourceVideo?.id !== videoId) return;
        if (Array.isArray(result.clips)) {
          clips = [...result.clips, ...clips.filter((clip) => !result.clips.some((item) => item.id === clip.id))];
          renderClipLibrary();
        }
        const status = result.analysisStatus?.status;
        if (status === "completed") {
          showToast(result.analysisStatus?.reused
            ? "ClipForge restored your existing AI clips."
            : `AI analysis finished: ${result.total || result.analysisStatus?.generated || 0} clips found. Rendering is continuing in My clips.`);
          startClipStatusPolling();
          return;
        }
        if (status === "failed") {
          showToast(`AI clipping failed: ${result.analysisStatus?.error || "Automatic clipping could not complete."}`);
          return;
        }
      } catch (error) {
        if (error?.status === 404) return;
        // Keep polling through temporary network failures.
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (currentProject?.id === pollingProjectId && sourceVideo?.id === videoId) {
      showToast("AI clipping is taking longer than expected. Your run is still saved and can continue in the background.");
    }
  } finally {
    automaticClipPolls.delete(videoId);
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
  stopPlayback();
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
  if (!bounds.width || !Number.isFinite(timelineMaximum) || timelineMaximum <= 0) return;
  const second = Math.round(Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * timelineMaximum);
  const current = getRange();
  if (draggedHandle === "start") startInput.value = Math.min(second, current.end - 1);
  if (draggedHandle === "end") endInput.value = Math.max(second, current.start + 1);
  updateRange();
}

function switchView(view) {
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === view));
  document.querySelectorAll(".dashboard, .editor, .secondary-view").forEach((section) => { section.hidden = section.id !== view; });
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
sourceUpload.addEventListener("change", async () => {
  const uploadEventProjectId = currentProject?.id;
  try {
    await uploadSource(sourceUpload.files[0]);
  } catch (error) {
    if (currentProject?.id === uploadEventProjectId) showToast(error.message);
  } finally {
    sourceUpload.value = "";
  }
});
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
  const uploadEventProjectId = currentProject?.id;
  try {
    await uploadSource(file);
  } catch (error) {
    if (currentProject?.id === uploadEventProjectId) showToast(error.message);
  }
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
    const deletedVideoId = sourceVideo.id;
    const deletedVideoProjectId = currentProject?.id;
    automaticClipFailures.add(deletedVideoId);
    await api("/api/videos/" + encodeURIComponent(deletedVideoId), { method: "DELETE" });
    if (currentProject?.id !== deletedVideoProjectId || sourceVideo?.id !== deletedVideoId) return;
    clips = clips.filter((clip) => clip.videoId !== deletedVideoId);
    for (const clipId of [...favoriteClipIds]) if (!clips.some((clip) => clip.id === clipId)) favoriteClipIds.delete(clipId);
    window.localStorage.setItem(favoriteKey, JSON.stringify([...favoriteClipIds]));
    selectedClipIds.clear();
    clearSourcePreview();
    button.hidden = true;
    renderClipLibrary();
    showToast("Source video deleted.");
  } catch (error) {
    if (currentProject?.id === deletedVideoProjectId) {
      showToast(error.status === 409 ? "This video is still processing. Try again when rendering finishes." : "Could not delete video: " + error.message);
    }
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
  if (!bounds.width || !Number.isFinite(timelineMaximum) || timelineMaximum <= 0) return;
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

document.querySelector("#apply-hook")?.addEventListener("click", () => {
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
const savedTranscriptionLanguage = safeStorageParse(transcriptionLanguageKey, "auto");
if (transcriptionLanguage && [...transcriptionLanguage.options].some((option) => option.value === savedTranscriptionLanguage)) {
  transcriptionLanguage.value = savedTranscriptionLanguage;
}
transcriptionLanguage?.addEventListener("change", () => {
  window.localStorage.setItem(transcriptionLanguageKey, JSON.stringify(transcriptionLanguage.value || "auto"));
});
const savedCaptionLanguage = safeStorageParse(captionLanguageKey, "original");
if (captionLanguageSelect && [...captionLanguageSelect.options].some((option) => option.value === savedCaptionLanguage)) captionLanguageSelect.value = savedCaptionLanguage;
captionLanguageSelect?.addEventListener("change", () => window.localStorage.setItem(captionLanguageKey, JSON.stringify(captionLanguageSelect.value || "original")));

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
  try {
    transcriptInput.value = await file.text();
    showToast(`${file.name} loaded. Review it, then generate clips.`);
  } catch (error) {
    transcriptInput.value = "";
    showToast(`Could not read ${file.name}: ${error.message}`);
  }
});

autoTranscribeButton?.addEventListener("click", async () => {
  try {
    if (!sourceVideo) throw new Error("Upload a source video first.");
    const transcriptionProjectId = currentProject?.id;
    const transcriptionVideoId = sourceVideo.id;
    autoTranscribeButton.disabled = true;
    autoTranscribeButton.textContent = "Transcribing…";
    showToast("Transcribing your video…");
    const result = await api(`/api/videos/${encodeURIComponent(transcriptionVideoId)}/transcribe`, { method: "POST", body: JSON.stringify({ language: transcriptionLanguage?.value || "en" }) });
    if (currentProject?.id !== transcriptionProjectId || sourceVideo?.id !== transcriptionVideoId) {
      showToast("Transcript finished for the original source video, but the workspace changed during transcription.");
      return;
    }
    transcriptInput.value = result.transcript.map((segment) => `${segment.start} | ${segment.end} | ${segment.speaker || ""} | ${segment.text}`).join("\n");
    showToast(`Transcript ready: ${result.count} timed segments.`);
  } catch (error) {
    if (currentProject?.id === transcriptionProjectId && sourceVideo?.id === transcriptionVideoId) {
      showToast(error.status === 503 ? "Automatic transcription needs the server transcription key configured." : error.message);
    }
  } finally {
    autoTranscribeButton.disabled = false;
    autoTranscribeButton.textContent = "Transcribe video automatically";
  }
});

document.querySelector("#library-ai-generate")?.addEventListener("click", () => {
  if (!sourceVideo) { showToast("Upload a source video first."); switchView("editor"); return; }
  transcriptDialog.showModal();
});

document.querySelector("#generate-ai-clips")?.addEventListener("click", () => {
  if (!sourceVideo) { showToast("Upload a source video first."); return; }
  transcriptDialog.showModal();
});

document.querySelector("#run-ai-generation")?.addEventListener("click", async (event) => {
  event.preventDefault();
  const runButton = event.currentTarget;
  if (runButton.disabled) return;
  runButton.disabled = true;
  const originalLabel = runButton.textContent;
  runButton.textContent = "Generating…";
  try {
    if (!sourceVideo) throw new Error("Upload a source video first.");
    const generationProjectId = currentProject?.id;
    const generationVideoId = sourceVideo.id;
    const rawTranscript = transcriptInput.value.trim();
    const selectedClipCount = Number(document.querySelector("#ai-clip-count")?.value) || 10;
    if (rawTranscript) {
      await api(`/api/videos/${encodeURIComponent(generationVideoId)}/transcript`, { method: "POST", body: JSON.stringify({ text: rawTranscript, format: "auto" }) });
    }
    if (currentProject?.id !== generationProjectId || sourceVideo?.id !== generationVideoId) {
      throw new Error("The source video or project changed while generation was running. Please reopen the original project before generating clips.");
    }
    const format = document.querySelector("#ai-output-format")?.value || document.querySelector(".format-option.selected")?.dataset.format || "9:16";
    const captions = document.querySelector("#ai-caption-enabled")?.value !== "false";
    const contentProfile = document.querySelector("#ai-content-profile")?.value || window.localStorage.getItem("clipforge-content-profile") || "creator";
    window.localStorage.setItem("clipforge-content-profile", contentProfile);
    const endpoint = rawTranscript ? "generate-clips" : "auto-clip";
    const result = await api(`/api/videos/${encodeURIComponent(generationVideoId)}/${endpoint}`, {
      method: "POST",
      body: JSON.stringify({ limit: selectedClipCount, format, captions, style: captionStyle, language: transcriptionLanguage?.value || "auto", captionLanguage: document.querySelector("#caption-language")?.value || safeStorageParse(captionLanguageKey, "original"), profile: contentProfile })
    });
    if (currentProject?.id !== generationProjectId || sourceVideo?.id !== generationVideoId) {
      throw new Error("The source video or project changed while generation was running. The generated clips were kept on the original source.");
    }
    transcriptDialog.close();
    if (endpoint === "auto-clip") {
      showToast("AI analysis started. ClipForge is finding the strongest moments in the background.");
      void pollAutoClipStatus(generationVideoId);
    } else {
      const generatedClips = Array.isArray(result.clips) ? result.clips.map((item) => item.clip).filter(Boolean) : [];
      clips = [...generatedClips, ...clips];
      renderClipLibrary();
      startClipStatusPolling();
      showToast(result.aiFallback
        ? `Built-in highlight analysis ranked ${result.generated} clips and queued them for rendering.`
        : `AI highlight analysis ranked ${result.generated} clips and queued them for rendering.`);
      void refreshClipLibraryWhileRendering();
    }
  } catch (error) {
    if (currentProject?.id === generationProjectId && sourceVideo?.id === generationVideoId) showToast(error.message);
  } finally {
    runButton.disabled = false;
    runButton.textContent = originalLabel;
  }
});

function openStyleDialog() { styleDialog.showModal(); }
document.querySelector("#style-button").addEventListener("click", openStyleDialog);
document.querySelectorAll("[data-open-style]").forEach((button) => button.addEventListener("click", openStyleDialog));
document.querySelector("#save-style").addEventListener("click", () => {
  applyCaptionStyle({ color: document.querySelector("#highlight-color").value, weight: document.querySelector("#caption-weight").value });
  showToast("Caption style saved for future exports.");
});

const renameProjectButton = document.querySelector("#rename-project");
renameProjectButton?.addEventListener("click", async () => {
  if (!currentProject || renameProjectButton.disabled) return;
  const nextName = window.prompt("Rename project", currentProject.name);
  if (nextName === null) return;
  const name = nextName.trim();
  if (!name) { showToast("Project name cannot be empty."); return; }
  if (name.length > 120) { showToast("Project name must be 120 characters or fewer."); return; }
  renameProjectButton.disabled = true;
  const originalRenameLabel = renameProjectButton.textContent;
  const renamedProjectId = currentProject.id;
  renameProjectButton.textContent = "Renaming…";
  try {
    const result = await api(`/api/projects/${encodeURIComponent(renamedProjectId)}`, {
      method: "PATCH",
      body: JSON.stringify({ name })
    });
    if (currentProject?.id !== renamedProjectId) {
      showToast("Project renamed, but the workspace changed before the update finished.");
      return;
    }
    currentProject = result.project;
    document.querySelector("#workspace-title").textContent = currentProject.name;
    const projects = (await api("/api/projects")).projects;
    if (currentProject?.id !== renamedProjectId) return;
    renderProjectSelector(projects);
    renderClipLibrary();
    showToast("Project renamed.");
  } catch (error) {
    if (currentProject?.id === renamedProjectId) showToast(`Could not rename project: ${error.message}`);
  } finally {
    renameProjectButton.disabled = false;
    renameProjectButton.textContent = originalRenameLabel;
  }
});

deleteProjectButton?.addEventListener("click", async () => {
  if (!currentProject) return;
  const requestedDeleteProjectId = currentProject.id;
  if (uploadInFlight) {
    showToast("Finish or cancel the active video upload before deleting this project.");
    return;
  }
  try {
    const { projects } = await api("/api/projects");
    if (currentProject?.id !== requestedDeleteProjectId) return;
    if (projects.length <= 1) {
      showToast("Keep at least one project in ClipForge.");
      return;
    }
    const project = projects.find((item) => item.id === requestedDeleteProjectId);
    if (!project) throw new Error("Project is no longer available.");
    const projectName = project.name;
    if (!window.confirm(`Delete "${projectName}"? This removes its videos and clips.`)) return;
    deleteProjectButton.disabled = true;
    workspaceLoadVersion += 1;
    const deletedId = requestedDeleteProjectId;
    await api(`/api/projects/${encodeURIComponent(deletedId)}`, { method: "DELETE" });
    if (currentProject?.id !== deletedId) return;
    const remaining = projects.filter((project) => project.id !== deletedId);
    currentProject = remaining[0];
    selectedClipIds.clear();
    renderProjectSelector(remaining);
    await loadProject(currentProject.id);
    showToast("Project deleted.");
  } catch (error) {
    if (currentProject?.id === requestedDeleteProjectId) {
      showToast(error.status === 409
        ? "This project still has active processing. Try again when rendering finishes."
        : `Could not delete project: ${error.message}`);
    }
  } finally {
    deleteProjectButton.disabled = false;
  }
});

projectSelect?.addEventListener("change", async () => {
  const requestedProjectId = projectSelect.value;
  try {
    await loadProject(requestedProjectId);
    if (currentProject?.id === requestedProjectId) showToast("Project switched.");
  } catch (error) {
    if (currentProject?.id === requestedProjectId) showToast(error.message);
  }
});

async function createNewProject() {
  if (newProjectButton?.disabled) return;
  newProjectButton.disabled = true;
  const originalLabel = newProjectButton.textContent;
  newProjectButton.textContent = "Creating…";
  stopPlayback();
  const creationLoadVersion = ++workspaceLoadVersion;
  try {
    if (!apiSession) {
      showAccountDialog("signup");
      return;
    }
    if (!currentProject) {
      const ready = await ensureWorkspace();
      if (!ready || creationLoadVersion !== workspaceLoadVersion) return;
    }
    const createdProject = (await api("/api/projects", { method: "POST", body: JSON.stringify({ name: `Project ${new Date().toLocaleDateString()}` }) })).project;
    if (creationLoadVersion !== workspaceLoadVersion) return;
    if (!createdProject?.id) throw new Error("Project creation returned an invalid project.");
    currentProject = createdProject;
    const refreshedProjects = (await api("/api/projects")).projects;
    if (creationLoadVersion !== workspaceLoadVersion || currentProject?.id !== createdProject.id) return;
    renderProjectSelector(refreshedProjects);
    document.querySelector("#workspace-title").textContent = currentProject.name;
    sourceVideo = undefined;
    clips = [];
    selectedClipIds.clear();
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
    history.replaceState(null, "", "#editor");
    showToast("New project created.");
  } catch (error) {
    if (creationLoadVersion === workspaceLoadVersion) showToast(`Could not create project: ${error.message}`);
  } finally {
    newProjectButton.disabled = false;
    newProjectButton.textContent = originalLabel;
  }
}

newProjectButton?.addEventListener("click", () => void createNewProject());
dashboardNewProjectButton?.addEventListener("click", () => void createNewProject());
dashboardOpenEditorButton?.addEventListener("click", async () => {
  if (!apiSession) { showAccountDialog("login"); return; }
  if (!currentProject) await ensureWorkspace();
  if (currentProject) { switchView("editor"); history.replaceState(null, "", "#editor"); }
});
dashboardOpenLibraryButton?.addEventListener("click", async () => {
  if (!apiSession) { showAccountDialog("login"); return; }
  if (!currentProject) await ensureWorkspace();
  if (currentProject) { switchView("clips"); history.replaceState(null, "", "#clips"); }
});
dashboardOpenSettingsButton?.addEventListener("click", () => showAccountDialog("preferences"));

