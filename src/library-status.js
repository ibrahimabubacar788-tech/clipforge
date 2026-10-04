const library = document.querySelector("#clip-library");
const summary = document.querySelector("#clip-status-summary");

function refreshStatusSummary() {
  if (!summary || !library) return;
  const cards = [...library.querySelectorAll(".clip-card")];
  const ready = cards.filter((card) => card.querySelector(".download-clip")).length;
  const failed = cards.filter((card) => card.textContent.includes("Render failed")).length;
  const rendering = Math.max(0, cards.length - ready - failed);
  if (!cards.length) {
    summary.textContent = "No clips yet";
    summary.dataset.state = "empty";
    return;
  }
  summary.textContent = `${ready} ready · ${rendering} rendering · ${failed} failed`;
  summary.dataset.state = rendering ? "active" : "complete";
}

if (library && summary) {
  new MutationObserver(refreshStatusSummary).observe(library, { childList: true, subtree: true });
  refreshStatusSummary();
}


import("./creator-intake.js").catch((error) => console.error("Creator intake failed to load:", error));
