export function clipDuration(start, end) {
  const safeStart = Number(start);
  const safeEnd = Number(end);
  return Number.isFinite(safeStart) && Number.isFinite(safeEnd) && safeEnd > safeStart ? safeEnd - safeStart : 0;
}

export function normalizeClipRange(start, end, maximum) {
  const limit = Number(maximum);
  if (!Number.isFinite(limit) || limit <= 0) return { start: 0, end: 1 };

  const safeStart = Math.min(Math.max(0, Number(start) || 0), limit - 1);
  const proposedEnd = Number(end);
  const safeEnd = Number.isFinite(proposedEnd)
    ? Math.min(Math.max(safeStart + 1, proposedEnd), limit)
    : Math.min(safeStart + 1, limit);

  return { start: safeStart, end: safeEnd };
}

export function formatTimestamp(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
