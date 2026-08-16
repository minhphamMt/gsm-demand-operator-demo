import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createZones } from '@/features/operator-data/model/zoneGeometry'
import { mapLegendFor } from '@/features/operator-map/model/operatorMapGeometry'
import { classifyMapFailure, OperatorMap } from './OperatorMap'

describe('OperatorMap unavailable state', () => {
  it('keeps the AI-zone boundary disclaimer visible when Mapbox is unavailable', () => {
    render(
      <OperatorMap
        forecastMinutes={0}
        onZoneSelect={vi.fn()}
        zones={createZones()}
      />,
    )

    expect(screen.getByText('Chưa cấu hình Mapbox')).toBeInTheDocument()
    expect(screen.getByText(/vùng đại diện AI zone, không phải ranh giới hành chính/i)).toBeInTheDocument()
  })

  it('classifies token, network and unknown map failures', () => {
    expect(classifyMapFailure(new Error('401 Unauthorized: access token invalid'))).toBe('token-style')
    expect(classifyMapFailure(new Error('Failed to fetch: NetworkError'))).toBe('network')
    expect(classifyMapFailure(new Error('style parsing failed'))).toBe('unknown')
  })

  it('labels observed and forecast map values with their actual basis', () => {
    expect(mapLegendFor('gap', 0).title).toBe('CHÚ GIẢI CHÊNH LỆCH GHI NHẬN')
    expect(mapLegendFor('gap', 5)).toMatchObject({
      title: 'CHÚ GIẢI RỦI RO DỰ BÁO P90',
      items: expect.arrayContaining([[expect.any(String), 'Thiếu p90 3–7 xe']]),
    })
  })
})
