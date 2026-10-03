    const progressPercent = clips.length ? Math.round((readyCount / clips.length) * 100) : 0;
    if (libraryProjectProgressBar) libraryProjectProgressBar.value = progressPercent;
    if (libraryProjectProgressLabel) libraryProjectProgressLabel.textContent = `${progressPercent}%`;
    if (libraryProjectProgress) libraryProjectProgress.hidden = clips.length === 0;
    libraryProjectOverview.innerHTML = "<strong>" + projectName.replace(/[&<>]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[char])) + "</strong><span>" + sourceCount + " source video" + (sourceCount === 1 ? "" : "s") + "</span><span>" + (sourceDuration ? formatTimestamp(sourceDuration) + " source length" : "Source not loaded") + "</span><span>" + clips.length + " clips</span><span>" + readyCount + " ready</span><span>" + favoriteCount + " favorite" + (favoriteCount === 1 ? "" : "s") + "</span><span>" + formatTimestamp(readyDuration) + " rendered</span>";
  }
  const totalDuration = clips.reduce((sum, clip) => sum + clipDuration(clip.start, clip.end), 0);
  if (librarySummary) librarySummary.textContent = `${clips.length} total · ${readyCount} ready · ${renderingCount} rendering · ${failedCount} failed · ${favoriteCount} favorite${favoriteCount === 1 ? "" : "s"} · ${formatTimestamp(totalDuration)} of content`;
  clipLibrary.innerHTML = filtered.map((clip) => {
    const title = escapeHtml(clip.title || "Untitled clip");
    const format = escapeHtml(clip.format || "9:16");
    const formatClass = format.replace(/:/g, "-");
    const clipId = escapeHtml(clip.id);
    const videoId = escapeHtml(clip.videoId);
    const progress = Math.max(0, Math.min(100, Number(clip.renderProgress) || 0));
    const status = clip.status === "ready"
      ? `<div class="clip-status-actions"><button class="preview-clip" type="button" data-preview-clip="${clipId}">Preview</button><button class="download-clip" type="button" data-download-clip="${clipId}">Download</button></div>`
      : clip.status === "failed"
        ? `<div class="clip-status-actions"><small>Render failed</small><button class="retry-clip" type="button" data-retry-clip="${clipId}">Retry</button></div>`
        : clip.renderJobStatus === "queued"
          ? `<div class="clip-rendering"><small class="rendering-status">Queued for rendering…</small><progress class="clip-render-progress" max="100" value="0" aria-label="Render progress"></progress></div>`
          : `<div class="clip-rendering"><small class="rendering-status">Rendering… ${progress}%</small><progress class="clip-render-progress" max="100" value="${progress}" aria-label="Render progress"></progress></div>`;
    return `<article class="clip-card${favoriteClipIds.has(clip.id) ? " is-favorite" : ""}"><label class="clip-select"><input type="checkbox" data-select-clip="${clipId}" ${selectedClipIds.has(clip.id) ? "checked" : ""} aria-label="Select ${title}" /></label><div class="clip-card-art ${formatClass}"><span>${format}</span><p>${clip.captions ? "CC" : "No captions"}</p></div><div><h3>${title}</h3><button class="text-button favorite-clip" type="button" data-favorite-clip="${clipId}" aria-pressed="${favoriteClipIds.has(clip.id)}">${favoriteClipIds.has(clip.id) ? "★ Favorited" : "☆ Favorite"}</button><button class="text-button rename-clip" type="button" data-rename-clip="${clipId}">Rename</button><button class="text-button details-clip" type="button" data-details-clip="${clipId}">Details</button><p>${formatTimestamp(clip.start)}–${formatTimestamp(clip.end)} · ${formatTimestamp(clipDuration(clip.start, clip.end))}</p><button class="text-button clip-source-link" type="button" data-open-source="${videoId}">Source: ${escapeHtml(sourceVideo?.id === clip.videoId ? sourceVideo.name : "Source video")}</button><small>Exported ${new Date(clip.createdAt).toLocaleDateString()}</small><div>${status}</div></div><button class="delete-clip" type="button" data-delete-clip="${clipId}" aria-label="Delete ${title}">×</button></article>`;
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
