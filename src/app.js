import { clipDuration, formatTimestamp } from "./clip-utils.js";

const startInput = document.querySelector("#start-input");
const endInput = document.querySelector("#end-input");
const durationLabel = document.querySelector("#duration-label");
const toast = document.querySelector("#toast");
const range = document.querySelector("#range");
let clips = 0;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function updateRange() {
  if (Number(endInput.value) <= Number(startInput.value)) endInput.value = Number(startInput.value) + 1;
  const duration = clipDuration(startInput.value, endInput.value);
  durationLabel.textContent = `${formatTimestamp(duration)} clip`;
  const start = (Number(startInput.value) / 519) * 100;
  const width = (duration / 519) * 100;
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

document.querySelector("#play-button").addEventListener("click", (event) => {
  const playing = event.currentTarget.textContent === "❚❚";
  event.currentTarget.textContent = playing ? "▶" : "❚❚";
  event.currentTarget.setAttribute("aria-label", playing ? "Play clip" : "Pause clip");
});
document.querySelector("#apply-hook").addEventListener("click", () => { startInput.value = 124; endInput.value = 148; updateRange(); showToast("Smart-cut hook applied."); });
document.querySelector("#style-button").addEventListener("click", () => showToast("Caption style controls are ready for editing."));
document.querySelector("#new-project").addEventListener("click", () => showToast("New project workspace created."));
document.querySelector("#export-button").addEventListener("click", () => { clips += 1; document.querySelector("#clip-count").textContent = clips; showToast("Your clip has been queued for export."); });
updateRange();
