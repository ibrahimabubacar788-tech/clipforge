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
const timelineMaximum = Number(endInput.max);
let clips = 0;
let playbackTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function updateRange() {
  const clipRange = normalizeClipRange(startInput.value, endInput.value, timelineMaximum);
  startInput.value = clipRange.start;
  endInput.value = clipRange.end;
  const duration = clipDuration(clipRange.start, clipRange.end);
  durationLabel.textContent = `${formatTimestamp(duration)} clip`;
  const start = (clipRange.start / timelineMaximum) * 100;
  const width = (duration / timelineMaximum) * 100;
  range.style.left = `${start}%`;
  range.style.width = `${width}%`;
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
document.querySelector("#apply-hook").addEventListener("click", () => { startInput.value = 124; endInput.value = 148; updateRange(); showToast("Smart-cut hook applied."); });
document.querySelector("#style-button").addEventListener("click", () => showToast("Caption style controls are ready for editing."));
document.querySelector("#new-project").addEventListener("click", () => showToast("New project workspace created."));
document.querySelector("#export-button").addEventListener("click", () => { clips += 1; document.querySelector("#clip-count").textContent = clips; showToast("Your clip has been queued for export."); });
updateRange();
