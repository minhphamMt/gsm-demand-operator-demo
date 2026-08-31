import { describe, expect, it } from 'vitest'

import { dispatchSupplyDelta, zonesAfterDispatch } from '@/features/operator-data/model/dispatchedSupply'
import { operationalGapFor } from '@/features/operator-data/model/zoneBalance'
import type { DispatchBatch, DispatchMove, Zone } from '@/features/operator-data/model/types'

const zone = (aiZoneId: number, demand: number | null, supply: number | null): Zone => ({
  id: `AI-Z${String(aiZoneId).padStart(2, '0')}`,
  aiZoneId, zoneCode: `Z${aiZoneId}`, label: `Vùng ${aiZoneId}`, tier: 'core', areaKm2: 4,
  center: [105, 21], boundary: [], dataStatus: supply === null ? 'missing' : 'live',
  supply, demand, gap: demand !== null && supply !== null ? demand - supply : null,
  severity: 'NORMAL', confidence: 0.9, rainMmH: 0, rainForecast15: 0, rainForecast30: 0,
  forecast15: demand ?? 0, forecast30: demand ?? 0,
})

const move = (patch: Partial<DispatchMove> = {}): DispatchMove => ({
  id: 'MOV-1', sourceMoveKey: 'k1', sourceZoneId: 5, targetZoneId: 2,
  plannedUnits: 4, acknowledgedUnits: 0, arrivedUnits: 0, availableUnits: 0, failedUnits: 0,
  state: 'PLANNED', etaMinutes: 8, distanceKm: 3, ...patch,
})

const batch = (moves: readonly DispatchMove[]): DispatchBatch => ({
  id: 'BATCH-1', proposalId: 'P-1', proposalVersion: 1, approvedContentHash: 'abc',
  status: 'RELEASED', releasedAt: '2026-08-28T17:00:00+07:00', moves, reconciliations: [],
})

describe('dispatchSupplyDelta', () => {
  it('không có lượt điều phối thì không đổi gì', () => {
    expect(dispatchSupplyDelta(undefined).size).toBe(0)
  })

  it('trừ zone nguồn ngay khi tài xế nhận lệnh, chưa cộng zone đích', () => {
    // Xe đã rời đi nhưng chưa tới. Cộng cho đích lúc này là hứa một chiếc xe chưa có mặt.
    const delta = dispatchSupplyDelta(batch([move({ acknowledgedUnits: 4, state: 'EN_ROUTE' })]))

    expect(delta.get('AI-Z05')).toBe(-4)
    expect(delta.get('AI-Z02')).toBeUndefined()
  })

  it('cộng zone đích khi xe đã sẵn sàng, và tổng khi đó bảo toàn', () => {
    const delta = dispatchSupplyDelta(
      batch([move({ acknowledgedUnits: 4, arrivedUnits: 4, availableUnits: 4, state: 'AVAILABLE' })]),
    )

    expect(delta.get('AI-Z05')).toBe(-4)
    expect(delta.get('AI-Z02')).toBe(4)
    expect([...delta.values()].reduce((sum, value) => sum + value, 0)).toBe(0)
  })

  it('chặng hỏng thì xe không rời zone nguồn', () => {
    const delta = dispatchSupplyDelta(batch([move({ acknowledgedUnits: 4, failedUnits: 4, state: 'FAILED' })]))

    expect(delta.get('AI-Z05')).toBeUndefined()
  })

  it('nhiều chặng về cùng một zone thì cộng dồn', () => {
    const delta = dispatchSupplyDelta(batch([
      move({ id: 'MOV-1', sourceZoneId: 5, targetZoneId: 2, acknowledgedUnits: 3, availableUnits: 3 }),
      move({ id: 'MOV-2', sourceZoneId: 7, targetZoneId: 2, acknowledgedUnits: 2, availableUnits: 2 }),
    ]))

    expect(delta.get('AI-Z02')).toBe(5)
  })
})

describe('zonesAfterDispatch', () => {
  it('vùng đỏ chuyển xanh khi xe đã tới nơi', () => {
    // Đây là điều cả tính năng này tồn tại để làm: thiếu 5 xe, điều tới 5 xe, hết thiếu.
    const before = [zone(2, 20, 15), zone(5, 10, 18)]
    const after = zonesAfterDispatch(
      before,
      batch([move({ sourceZoneId: 5, targetZoneId: 2, acknowledgedUnits: 5, availableUnits: 5 })]),
    )

    expect(operationalGapFor(before[0]!)).toBe(5)
    expect(operationalGapFor(after[0]!)).toBe(0)
  })

  it('zone nguồn nghèo đi đúng số xe đã rút', () => {
    const after = zonesAfterDispatch(
      [zone(5, 10, 18)],
      batch([move({ sourceZoneId: 5, targetZoneId: 2, acknowledgedUnits: 5, availableUnits: 5 })]),
    )

    expect(after[0]!.supply).toBe(13)
  })

  it('không đẩy cung xuống số âm', () => {
    const after = zonesAfterDispatch(
      [zone(5, 10, 2)],
      batch([move({ sourceZoneId: 5, targetZoneId: 2, acknowledgedUnits: 6 })]),
    )

    expect(after[0]!.supply).toBe(0)
  })

  it('zone chưa có quan sát thì không đoán hộ', () => {
    const after = zonesAfterDispatch(
      [zone(2, null, null)],
      batch([move({ targetZoneId: 2, acknowledgedUnits: 4, availableUnits: 4 })]),
    )

    expect(after[0]!.supply).toBeNull()
  })

  it('trả lại đúng mảng cũ khi không có gì để cộng', () => {
    const before = [zone(2, 20, 15)]

    expect(zonesAfterDispatch(before, undefined)).toBe(before)
  })
})
