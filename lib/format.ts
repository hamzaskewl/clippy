/** Format a millisecond timestamp as a short relative age (e.g. "5m", "2h"). */
export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export function timeAgoLong(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function formatNumber(n: number | undefined | null): string {
  if (n == null) return '-'
  return n.toLocaleString()
}

export function formatViewers(n: number | undefined | null): string | null {
  if (n == null) return null
  return `${(n / 1000).toFixed(1)}k`
}

/** CSS class for jump-percent emphasis. */
export function jumpClass(jumpPercent: number): '' | 'high' | 'mega' {
  if (jumpPercent > 150) return 'mega'
  if (jumpPercent > 50) return 'high'
  return ''
}
