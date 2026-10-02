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
clearClipSearchButton?.addEventListener("click", () => {
  if (!clipSearch?.value) return;
  clipSearch.value = "";
  libraryQuery = "";
  renderClipLibrary();
  clipSearch.focus();
});
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
  if (!selectedClipIds.size) return;
  selectedClipIds.clear();
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
  const ready = clips.filter((clip) => clip.status === "ready");
  const allSelected = ready.length > 0 && ready.every((clip) => selectedClipIds.has(clip.id));
  ready.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});
selectUntaggedClipsButton?.addEventListener("click", () => {
  const uncaptioned = clips.filter((clip) => !clip.captions);
  const allSelected = uncaptioned.length > 0 && uncaptioned.every((clip) => selectedClipIds.has(clip.id));
  uncaptioned.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});
selectCaptionedClipsButton?.addEventListener("click", () => {
  const captioned = clips.filter((clip) => Boolean(clip.captions));
  const allSelected = captioned.length > 0 && captioned.every((clip) => selectedClipIds.has(clip.id));
  captioned.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});
selectLongClipsButton?.addEventListener("click", () => {
  const longClips = clips.filter((clip) => clipDuration(clip.start, clip.end) >= 60);
  const allSelected = longClips.length > 0 && longClips.every((clip) => selectedClipIds.has(clip.id));
  longClips.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});
selectShortClipsButton?.addEventListener("click", () => {
  const shortClips = clips.filter((clip) => clipDuration(clip.start, clip.end) < 60);
  const allSelected = shortClips.length > 0 && shortClips.every((clip) => selectedClipIds.has(clip.id));
  shortClips.forEach((clip) => allSelected ? selectedClipIds.delete(clip.id) : selectedClipIds.add(clip.id));
  renderClipLibrary();
});
retryFailedClipsButton?.addEventListener("click", async () => {
  const failed = clips.filter((clip) => selectedClipIds.has(clip.id) && clip.status === "failed");
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
    const retryProjectId = currentProject?.id;
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
      if (currentProject?.id !== retryProjectId) return;
      clips = (await api("/api/clips")).clips.filter((clip) => clip.projectId === retryProjectId);
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
      const response = await fetch(`/api/clips/${encodeURIComponent(clip.id)}/download`, { headers: apiSession?.token ? { authorization: `Bearer ${apiSession.token}` } : {} });
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
  const sourceButton = event.target.closest("[data-open-source]");
  if (sourceButton) {
    const videoId = sourceButton.dataset.openSource;
    if (videoId && currentProject) {
      const videos = (await api("/api/videos?projectId=" + encodeURIComponent(currentProject.id))).videos;
      const video = videos.find((item) => item.id === videoId);
      if (video) {
        sourceVideo = video;
        restoreSourcePreview(video);
        document.querySelector('[data-view="editor"]')?.click();
        showToast("Source video opened in the editor.");
      } else {
        showToast("That source video is no longer available.");
      }
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
  if (event.key === "/" && !event.target.matches("input, select, textarea") && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    clipSearch?.focus();
    clipSearch?.select();
    return;
  }
  if (event.key === "Escape" && document.activeElement === clipSearch && clipSearch?.value) {
    clipSearch.value = "";
    libraryQuery = "";
    renderClipLibrary();
    return;
  }
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