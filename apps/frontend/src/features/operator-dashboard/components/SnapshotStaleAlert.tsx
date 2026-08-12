import { AlertTriangle, RefreshCw } from 'lucide-react'

import { getSnapshotFreshness } from '@/features/operator-data'
import { Button } from '@/shared/components/ui/Button'
import { formatTime } from '@/shared/lib/format'

export function SnapshotStaleAlert({ generatedAt, isRefreshing, now, onRefresh }: { generatedAt: string; isRefreshing: boolean; now?: Date; onRefresh: () => void }) {
  const freshness = getSnapshotFreshness(generatedAt, now)
  if (!freshness.isStale) return null

  const age = freshness.ageMinutes === null ? 'không xác định' : `${freshness.ageMinutes} phút`
  const snapshotTime = freshness.ageMinutes === null ? 'không hợp lệ' : formatTime(generatedAt)
  return <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between" role="alert">
    <div className="flex min-w-0 gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" /><div><p className="font-semibold">Snapshot đã cũ — không nên ra quyết định từ dữ liệu này</p><p className="mt-0.5 text-sm text-amber-800">Dữ liệu lúc {snapshotTime} · cách hiện tại {age}. Hãy tải lại trước khi mở proposal.</p></div></div>
    <Button className="shrink-0" isLoading={isRefreshing} onClick={onRefresh} variant="secondary"><RefreshCw className="size-4" />Tải snapshot mới</Button>
  </div>
}
