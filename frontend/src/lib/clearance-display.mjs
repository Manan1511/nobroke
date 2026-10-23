export function clearanceDisplay(value) {
  const parsed = Number(value)
  const percent = Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0
  return {
    hasProgress: percent > 0,
    percent,
    label: percent > 0 ? `${percent}% cleared` : "Nothing cleared yet",
  }
}
