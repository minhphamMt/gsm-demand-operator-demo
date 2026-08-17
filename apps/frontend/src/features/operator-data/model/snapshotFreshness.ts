export const snapshotRefreshIntervalMs = 2 * 60 * 1_000
export const snapshotStaleAfterMs = 5 * 60 * 1_000

export type SnapshotFreshness = {
  ageMinutes: number | null
  isStale: boolean
}

export function getSnapshotFreshness(generatedAt: string, now = new Date()): SnapshotFreshness {
  const generatedAtMs = new Date(generatedAt).getTime()
  if (!Number.isFinite(generatedAtMs)) return { ageMinutes: null, isStale: true }

  const ageMs = Math.max(0, now.getTime() - generatedAtMs)
  return {
    ageMinutes: Math.floor(ageMs / 60_000),
    isStale: ageMs > snapshotStaleAfterMs,
  }
}

export function snapshotPollInterval(pageVisibility: DocumentVisibilityState = typeof document === 'undefined' ? 'visible' : document.visibilityState) {
  return pageVisibility === 'visible' ? snapshotRefreshIntervalMs : false
}
