// Danh sách chặng điều chuyển mà Dispatch đề xuất, để tab Connect mở rộng thành checklist
// (agent/07-Design §5.2). Nguồn: `decision.plan.moves` — đúng payload của POST /decisions.
//
// Đọc theo kiểu `unknown` rồi thu hẹp: `decision` là túi dữ liệu tự do trong contract run,
// không có guard sẵn, và một run FAILED vẫn phải hiển thị được phần còn lại.
//
// Cố ý **chỉ đọc**: chọn/bỏ chọn từng chặng là hành vi sửa phương án, phải đi qua đường
// Revise rồi hai cổng phê duyệt (CLAUDE.md §11.1), không thể là checkbox trong panel giám sát.

export type ProposedMove = {
  id: string
  fromZone: number
  toZone: number
  units: number
  etaSteps: number
  estimatedCost: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const numberAt = (source: Record<string, unknown>, key: string): number | undefined =>
  typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : undefined

export function readProposedMoves(decision: Record<string, unknown> | undefined): readonly ProposedMove[] {
  if (!decision || !isRecord(decision.plan) || !Array.isArray(decision.plan.moves)) return []
  return decision.plan.moves.flatMap((entry, index) => {
    if (!isRecord(entry)) return []
    const fromZone = numberAt(entry, 'from_zone')
    const toZone = numberAt(entry, 'to_zone')
    const units = numberAt(entry, 'units_to_move')
    if (fromZone === undefined || toZone === undefined || units === undefined) return []
    return [{
      id: `${fromZone}-${toZone}-${index}`,
      fromZone,
      toZone,
      units,
      etaSteps: numberAt(entry, 'eta_steps') ?? 0,
      estimatedCost: numberAt(entry, 'estimated_cost') ?? 0,
    }]
  })
}

export function moveLabel(move: ProposedMove): string {
  return `Điều ${move.units} xe từ zone ${move.fromZone} sang zone ${move.toZone}`
}
