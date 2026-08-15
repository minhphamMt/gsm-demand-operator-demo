import type { DispatchBatch, DispatchMove } from '@/features/operator-data/model/types'

const liveStatuses = new Set(['DISPATCHING', 'PARTIALLY_ACKED', 'IN_PROGRESS'])
const terminalMoveStates = new Set<DispatchMove['state']>(['AVAILABLE', 'FAILED', 'CANCELLED'])

export function dispatchStatusPresentation(batch: Pick<DispatchBatch, 'status' | 'releasedAt' | 'moves'>, now = Date.now()) {
  const labels: Record<string, string> = {
    QUEUED: 'Chờ hệ thống tiếp nhận',
    DISPATCHING: 'Đang gửi lệnh',
    PARTIALLY_ACKED: 'Đã nhận một phần',
    IN_PROGRESS: 'Đang di chuyển',
    PARTIALLY_EXECUTED: 'Hoàn tất một phần',
    EXECUTED: 'Đã hoàn tất',
    FAILED: 'Thực thi thất bại',
    CANCELLED: 'Đã dừng',
  }
  const maxEtaMinutes = Math.max(0, ...batch.moves.map((move) => move.etaMinutes))
  const overdueAt = new Date(batch.releasedAt).getTime() + Math.max(10, maxEtaMinutes + 5) * 60_000
  const isLive = liveStatuses.has(batch.status)
  const isOverdue = (isLive || batch.status === 'QUEUED') && Number.isFinite(overdueAt) && now > overdueAt
  return {
    label: isOverdue ? 'Cần kiểm tra' : labels[batch.status] ?? batch.status,
    isAnimating: isLive && !isOverdue,
    isOverdue,
    isQueued: batch.status === 'QUEUED' && !isOverdue,
    canCancel: ['QUEUED', 'DISPATCHING', 'PARTIALLY_ACKED', 'IN_PROGRESS'].includes(batch.status),
  }
}

export function dispatchProgress(batch: Pick<DispatchBatch, 'moves'>) {
  const totalMoves = batch.moves.length
  const finishedMoves = batch.moves.filter((move) => terminalMoveStates.has(move.state)).length
  const failedMoves = batch.moves.filter((move) => move.state === 'FAILED').length
  const activeMoves = batch.moves.filter((move) => ['SENT', 'ACKNOWLEDGED', 'EN_ROUTE', 'ARRIVED'].includes(move.state)).length
  const waitingMoves = batch.moves.filter((move) => move.state === 'PLANNED').length
  const plannedUnits = batch.moves.reduce((sum, move) => sum + move.plannedUnits, 0)
  const availableUnits = batch.moves.reduce((sum, move) => sum + move.availableUnits, 0)
  return {
    totalMoves,
    finishedMoves,
    failedMoves,
    activeMoves,
    waitingMoves,
    plannedUnits,
    availableUnits,
    completionPercent: totalMoves ? Math.round(finishedMoves / totalMoves * 100) : 0,
  }
}

export function dispatchMoveLabel(state: DispatchMove['state']) {
  const labels: Record<DispatchMove['state'], string> = {
    PLANNED: 'Chờ gửi',
    SENT: 'Đã gửi',
    ACKNOWLEDGED: 'Đã tiếp nhận',
    EN_ROUTE: 'Đang di chuyển',
    ARRIVED: 'Đã đến',
    AVAILABLE: 'Sẵn sàng phục vụ',
    FAILED: 'Thất bại',
    CANCELLED: 'Đã dừng',
  }
  return labels[state]
}
