import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ForecastRunStatus } from './ForecastRunStatus'

const forecast = { zoneContract: 'AI_ZONE_1_30' as const, registeredZones: 30, liveZones: 30, forecastedZones: 30, horizons: [15] as const, modelVersion: 'v1', forecastMode: 'trained', dataSource: 'db', forecastAt: '2026-08-14T00:00:00Z', forecastRunId: 'run-1' }

describe('ForecastRunStatus', () => {
  afterEach(cleanup)
  it('never presents a failed run as usable forecast data', () => {
    render(<ForecastRunStatus forecast={{ ...forecast, forecastStatus: 'FAILED' }} horizon={15} isExact={false} />)
    expect(screen.getByRole('alert')).toHaveTextContent('dữ liệu forecast cũ không được dùng thay thế')
  })

  it('marks fallback separately from a completed trained run', () => {
    render(<ForecastRunStatus forecast={{ ...forecast, forecastStatus: 'FALLBACK' }} horizon={15} isExact />)
    expect(screen.getByRole('alert')).toHaveTextContent('fallback')
  })
})
