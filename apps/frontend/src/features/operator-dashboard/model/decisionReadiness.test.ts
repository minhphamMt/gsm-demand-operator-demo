import { describe, expect, it } from 'vitest'

import type { AiSnapshotStatus, Proposal } from '@/features/operator-data'
import { getDecisionReadiness } from '@/features/operator-dashboard/model/decisionReadiness'

const ai = (overrides: Partial<AiSnapshotStatus> = {}): AiSnapshotStatus => ({
  zoneContract: 'AI_ZONE_1_30', registeredZones: 30, liveZones: 30, forecastedZones: 30,
  horizons: [15, 30], modelVersion: 'v1', forecastMode: 'model', dataSource: 'database', forecastAt: '2026-08-11T10:00:00Z',
  ...overrides,
})

describe('getDecisionReadiness', () => {
  it('only allows generation with the complete 30-zone live contract', () => {
    expect(getDecisionReadiness(ai(), undefined).canGenerate).toBe(true)
    expect(getDecisionReadiness(ai({ liveZones: 29 }), undefined).canGenerate).toBe(false)
  })

  it('exposes the weakest evidence without inventing a confidence score', () => {
    const result = getDecisionReadiness(ai({ forecastedZones: 0 }), undefined)
    expect(result.weakestFactor).toBe('Có dự báo')
    expect(result.evidence.map((item) => item.value)).toEqual(['30/30', '0/30', 'Chưa kiểm'])
  })

  it('reports policy coverage from the proposal checks', () => {
    const plan = { policyChecks: [{ passed: true }, { passed: false }] } as unknown as Proposal
    expect(getDecisionReadiness(ai(), plan).evidence[2]).toMatchObject({ value: '1/2', state: 'warning' })
  })
})
