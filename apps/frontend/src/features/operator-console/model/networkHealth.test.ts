import { describe, expect, it } from 'vitest'

import type { Snapshot, Zone } from '@/features/operator-data'
import { networkGauges, riskDistribution } from './networkHealth'

const zone = (id: string, fields: Partial<Zone>): Zone => ({
  id, label: id, dataStatus: 'live', demand: 10, supply: 10, gap: 0, severity: 'Low', ...fields,
} as Zone)

const snapshotOf = (zones: readonly Zone[], kpis: Partial<Snapshot['kpis']> = {}): Snapshot => ({
  zones,
  kpis: { fleetAvailable: 100, requests: 120, fulfillmentRate: 85, residualGap: 12, avgWaitProxy: 6, ...kpis },
} as Snapshot)

describe('riskDistribution', () => {
  it('counts zones per severity in escalating order', () => {
    const buckets = riskDistribution([
      zone('AI-Z01', { severity: 'Critical' }),
      zone('AI-Z02', { severity: 'Low' }),
      zone('AI-Z03', { severity: 'High' }),
      zone('AI-Z04', { severity: 'Low' }),
    ])

    expect(buckets.map((bucket) => [bucket.severity, bucket.count])).toEqual([
      ['Low', 2], ['Medium', 0], ['High', 1], ['Critical', 1],
    ])
  })

  // Zone chưa quan sát được không thuộc mức rủi ro nào — xếp nó vào "Ổn định" là báo cáo sai.
  it('leaves unobserved zones out of every bucket', () => {
    const buckets = riskDistribution([
      zone('AI-Z01', { severity: 'Low' }),
      zone('AI-Z02', { dataStatus: 'missing', demand: null, supply: null, severity: 'Low' }),
    ])

    expect(buckets.reduce((total, bucket) => total + bucket.count, 0)).toBe(1)
  })
})

describe('networkGauges', () => {
  it('reports fulfillment straight from the snapshot KPI', () => {
    const gauges = networkGauges(snapshotOf([zone('AI-Z01', {})], { fulfillmentRate: 85, residualGap: 12 }))

    const fulfillment = gauges.find((gauge) => gauge.id === 'fulfillment')
    expect(fulfillment?.percent).toBe(85)
    expect(fulfillment?.detail).toBe('12 xe còn thiếu')
  })

  it('counts Low and Medium as in-hand, High and Critical as needing action', () => {
    const gauges = networkGauges(snapshotOf([
      zone('AI-Z01', { severity: 'Low' }),
      zone('AI-Z02', { severity: 'Medium' }),
      zone('AI-Z03', { severity: 'High' }),
      zone('AI-Z04', { severity: 'Critical' }),
    ]))

    expect(gauges.find((gauge) => gauge.id === 'balanced')?.percent).toBe(50)
  })

  it('measures data coverage against the 30-zone contract, not against what arrived', () => {
    const gauges = networkGauges(snapshotOf([
      zone('AI-Z01', {}),
      zone('AI-Z02', { dataStatus: 'missing', demand: null, supply: null }),
    ]))

    // 1 zone quan sát được trên hợp đồng 30 zone — không phải 1/2.
    expect(gauges.find((gauge) => gauge.id === 'coverage')?.percent).toBe(3)
    expect(gauges.find((gauge) => gauge.id === 'coverage')?.detail).toBe('1/30 zone có quan sát')
  })

  it('stays at zero instead of NaN when no zone reported', () => {
    const gauges = networkGauges(snapshotOf([], { fulfillmentRate: Number.NaN }))

    expect(gauges.map((gauge) => gauge.percent)).toEqual([0, 0, 0])
  })
})
