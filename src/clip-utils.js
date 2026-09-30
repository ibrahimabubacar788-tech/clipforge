export function clipDuration(start, end) {
  const safeStart = Number(start);
  const safeEnd = Number(end);
  return Number.isFinite(safeStart) && Number.isFinite(safeEnd) && safeEnd > safeStart ? safeEnd - safeStart : 0;
}

export function formatTimestamp(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
