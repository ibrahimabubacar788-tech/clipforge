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
const timelineMaximum = Number(endInput.max);
const storageKey = "clipforge-exports";
let clips = readSavedClips();
let playbackTimer;
let toastTimer;
let draggedHandle;

function readSavedClips() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveClips() {
  window.localStorage.setItem(storageKey, JSON.stringify(clips));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function getRange() {
  return normalizeClipRange(startInput.value, endInput.value, timelineMaximum);
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
}

function renderClipLibrary() {
  clipCount.textContent = clips.length;
  clipsEmpty.hidden = clips.length > 0;
  clipLibrary.innerHTML = clips.map((clip) => `<article class="clip-card"><div class="clip-card-art ${clip.format.replace(":", "-")}"><span>${clip.format}</span><p>${clip.captions ? "CC" : "No captions"}</p></div><div><h3>${clip.title}</h3><p>${formatTimestamp(clip.start)}–${formatTimestamp(clip.end)} · ${formatTimestamp(clipDuration(clip.start, clip.end))}</p><small>Exported ${new Date(clip.createdAt).toLocaleDateString()}</small></div><button class="delete-clip" type="button" data-delete-clip="${clip.id}" aria-label="Delete ${clip.title}">×</button></article>`).join("");
}

function stopPlayback() {
  window.clearInterval(playbackTimer);
  playbackTimer = undefined;
  playbackButton.textContent = "▶";
  playbackButton.setAttribute("aria-label", "Play clip");
}

function startPlayback() {
  playbackButton.textContent = "❚❚";
  playbackButton.setAttribute("aria-label", "Pause clip");
  playbackTimer = window.setInterval(() => {
    const nextSecond = Number(startInput.value) + 1;
    if (nextSecond >= Number(endInput.value)) {
      stopPlayback();
      return;
    }
    startInput.value = nextSecond;
    updateRange();
  }, 500);
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
  handle.addEventListener("pointerdown", (event) => {
    draggedHandle = handle.classList.contains("start-handle") ? "start" : "end";
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => { if (draggedHandle) updateFromPointer(event); });
  handle.addEventListener("pointerup", () => { draggedHandle = undefined; });
  handle.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
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

document.querySelector("#new-project").addEventListener("click", () => {
  stopPlayback();
  startInput.value = 0;
  endInput.value = 24;
  updateRange();
  switchView("editor");
  showToast("Fresh project workspace created.");
});
document.querySelector("#export-button").addEventListener("click", () => {
  const selected = document.querySelector(".format-option.selected").dataset.format;
  const clip = { id: crypto.randomUUID(), title: `Midnight Session · Clip ${clips.length + 1}`, start: Number(startInput.value), end: Number(endInput.value), format: selected, captions: captionToggle.checked, createdAt: new Date().toISOString() };
  clips.unshift(clip);
  saveClips();
  renderClipLibrary();
  showToast("Your clip has been exported to My clips.");
});
document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); switchView(link.dataset.view); }));
document.querySelectorAll("[data-go-editor]").forEach((button) => button.addEventListener("click", () => switchView("editor")));
clipLibrary.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-clip]");
  if (!button) return;
  clips = clips.filter((clip) => clip.id !== button.dataset.deleteClip);
  saveClips();
  renderClipLibrary();
  showToast("Clip removed from your library.");
});

renderClipLibrary();
updateRange();
