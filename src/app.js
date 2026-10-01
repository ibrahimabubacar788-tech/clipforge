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
let timelineMaximum = Number(endInput.max);
const storageKey = "clipforge-exports";
const sessionKey = "clipforge-session";
let clips = [];
let apiSession = JSON.parse(window.localStorage.getItem(sessionKey) || "null");
let sourceVideo;
let sourcePreviewUrl;
let previewElement;
let currentProject;

const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", ...(apiSession?.token ? { authorization: `Bearer ${apiSession.token}` } : {}), ...options.headers } });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
};

async function ensureWorkspace() {
  try {
    if (!apiSession) {
      const email = `creator-${crypto.randomUUID().slice(0, 8)}@clipforge.local`;
      apiSession = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password: crypto.randomUUID() }) });
      window.localStorage.setItem(sessionKey, JSON.stringify(apiSession));
    }
    const { projects } = await api("/api/projects");
    currentProject = projects[0] || (await api("/api/projects", { method: "POST", body: JSON.stringify({ name: "Midnight Sessions" }) })).project;
    document.querySelector("#workspace-title").textContent = currentProject.name;
    clips = (await api("/api/clips")).clips;
    renderClipLibrary();
  } catch (error) { showToast(`Backend unavailable: ${error.message}`); clips = readSavedClips(); renderClipLibrary(); }
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

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function getRange() { return normalizeClipRange(startInput.value, endInput.value, timelineMaximum); }

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
  const probe = document.createElement("video");
  const probeUrl = URL.createObjectURL(file);
  const duration = await new Promise((resolve, reject) => {
    probe.onloadedmetadata = () => { URL.revokeObjectURL(probeUrl); resolve(probe.duration); };
    probe.onerror = () => { URL.revokeObjectURL(probeUrl); reject(new Error("Could not read video duration.")); };
    probe.src = probeUrl;
  });

  if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
  sourcePreviewUrl = URL.createObjectURL(file);
  previewElement = document.createElement("video");
  previewElement.className = "source-video";
  previewElement.src = sourcePreviewUrl;
  previewElement.muted = true;
  previewElement.playsInline = true;
  previewElement.preload = "metadata";
  videoStage.querySelector(".video-placeholder")?.replaceWith(previewElement);

  const uploadResponse = await fetch("/api/uploads", { method: "POST", headers: { "content-type": file.type || "application/octet-stream", "x-filename": file.name, ...(apiSession?.token ? { authorization: `Bearer ${apiSession.token}` } : {}) }, body: file });
  if (!uploadResponse.ok) { const error = await uploadResponse.json().catch(() => ({})); throw new Error(error.error || "Upload failed."); }
  const upload = await uploadResponse.json();
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
  showToast(`${file.name} is ready to clip.`);
}

function renderClipLibrary() {
  clipCount.textContent = clips.length;
  clipsEmpty.hidden = clips.length > 0;
  clipLibrary.innerHTML = clips.map((clip) => {
    const status = clip.status === "ready"
      ? `<button class="download-clip" type="button" data-download-clip="${clip.id}">Download</button>`
      : `<small>${clip.status === "failed" ? "Render failed" : "Rendering…"}</small>`;
    return `<article class="clip-card"><div class="clip-card-art ${clip.format.replace(":", "-")}"><span>${clip.format}</span><p>${clip.captions ? "CC" : "No captions"}</p></div><div><h3>${clip.title}</h3><p>${formatTimestamp(clip.start)}–${formatTimestamp(clip.end)} · ${formatTimestamp(clipDuration(clip.start, clip.end))}</p><small>Exported ${new Date(clip.createdAt).toLocaleDateString()}</small><div>${status}</div></div><button class="delete-clip" type="button" data-delete-clip="${clip.id}" aria-label="Delete ${clip.title}">×</button></article>`;
  }).join("");
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

function openStyleDialog() { styleDialog.showModal(); }
document.querySelector("#style-button").addEventListener("click", openStyleDialog);
document.querySelectorAll("[data-open-style]").forEach((button) => button.addEventListener("click", openStyleDialog));
document.querySelector("#save-style").addEventListener("click", () => {
  const color = document.querySelector("#highlight-color").value;
  const weight = document.querySelector("#caption-weight").value;
  document.documentElement.dataset.captionColor = color;
  document.documentElement.dataset.captionWeight = weight;
  document.querySelector("#brand-style-description").textContent = `${weight === "bold" ? "Bold" : "Soft"} ${color} highlight`;
  showToast("Caption style saved.");
});

document.querySelector("#new-project").addEventListener("click", async () => {
  stopPlayback();
  try {
    currentProject = (await api("/api/projects", { method: "POST", body: JSON.stringify({ name: `Project ${new Date().toLocaleDateString()}` }) })).project;
    document.querySelector("#workspace-title").textContent = currentProject.name;
    sourceVideo = undefined;
    if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
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
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const jobResult = await api(`/api/jobs/${result.job.id}`);
      if (jobResult.job.status === "completed" || jobResult.job.status === "failed") break;
    }
    clips = (await api("/api/clips")).clips;
    renderClipLibrary();
    const finished = clips.find((clip) => clip.id === result.clip.id);
    showToast(finished?.status === "ready" ? "Your clip is ready to download." : "Clip rendering did not complete.");
  } catch (error) { showToast(error.message); }
});

document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); switchView(link.dataset.view); }));
document.querySelectorAll("[data-go-editor]").forEach((button) => button.addEventListener("click", () => switchView("editor")));

clipLibrary.addEventListener("click", async (event) => {
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
  try { await api(`/api/clips/${button.dataset.deleteClip}`, { method: "DELETE" }); } catch { clips = clips.filter((clip) => clip.id !== button.dataset.deleteClip); saveClips(); }
  clips = clips.filter((clip) => clip.id !== button.dataset.deleteClip);
  renderClipLibrary();
  showToast("Clip removed from your library.");
});

renderClipLibrary();
updateRange();
ensureWorkspace();
