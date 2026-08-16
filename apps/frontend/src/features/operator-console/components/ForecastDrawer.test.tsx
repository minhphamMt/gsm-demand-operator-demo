import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type ForecastRun, type Hotspot, type Zone } from '@/features/operator-data'
import { ForecastDrawer } from './ForecastDrawer'

const zone: Zone = {
  id: 'AI-Z01', aiZoneId: 1, zoneCode: 'AI-Z01', label: 'Ba Đình', tier: 'core', areaKm2: 5,
  center: [105.8, 21], boundary: [[105.8, 21], [105.81, 21], [105.8, 21.01]], dataStatus: 'live',
  supply: 8, demand: 13, gap: 5, operationalGap: 5, severity: 'High', confidence: 90,
  rainMmH: 1, rainForecast15: 1, rainForecast30: 1, forecast5: 15, forecast15: 16, forecast30: 17,
  forecastSupply5: 9, forecastSupply15: 10, forecastSupply30: 11,
  demandRange5: [11, 20], demandRange15: [12, 21], demandRange30: [13, 22],
  supplyRange5: [7, 11], supplyRange15: [8, 12], supplyRange30: [9, 13],
}

const run: ForecastRun = {
  id: 'run-5', horizonMinutes: 5, status: 'COMPLETED', modelVersion: 'lgbm', featureVersion: 'feature-v1', policyVersion: 'policy-v1', inputHash: 'hash', forecastMode: 'trained', dataSource: 'db', forecastAt: '2026-08-15T00:00:00Z', completedAt: '2026-08-15T00:00:01Z', zoneCount: 30,
}

const hotspot: Hotspot = {
  zoneId: 'AI-Z01', rank: 1, reason: 'HIGH_DEMAND_GAP', etaMinutes: 0, isPersistent: false,
  forecastRunId: 'run-5', severity: 'High', policyVersion: 'hotspot-gap-v1', threshold: 6,
  reasonCodes: ['HIGH_DEMAND_GAP'], contributingFeatures: { demand: 15, supply: 9, gap: 6 },
}

describe('ForecastDrawer', () => {
  afterEach(cleanup)

  it('renders per-zone p10/p50/p90 and immutable ForecastRun provenance', () => {
    render(<ForecastDrawer dataSource="db" forecastMode="trained" forecastRun={run} forecastTime="08:05" horizon={5} hotspots={[hotspot]} modelVersion="lgbm" onClose={vi.fn()} onZoneSelect={vi.fn()} sourceTime="08:00" zones={[zone]} />)

    expect(screen.getByText('Cầu dự báo: p10 11 · p50 15 · p90 20')).toBeInTheDocument()
    expect(screen.getByText('run-5')).toBeInTheDocument()
    expect(screen.getByText('COMPLETED · 30/30 zone')).toBeInTheDocument()
    expect(screen.getByText('Hotspot chính sách High: gap 6 xe ≥ ngưỡng 6 xe · HIGH_DEMAND_GAP')).toBeInTheDocument()
  })

  it('separates the p50 operating balance from the p90 risk buffer', () => {
    const surplus = { ...zone, id: 'AI-Z02', aiZoneId: 2, zoneCode: 'AI-Z02', label: 'Hoàn Kiếm', demand: 5, supply: 11, operationalGap: -2 }
    render(<ForecastDrawer forecastTime="08:05" horizon={5} hotspots={[hotspot]} onClose={vi.fn()} onZoneSelect={vi.fn()} sourceTime="08:00" zones={[zone, surplus]} />)

    expect(screen.getByText('THIẾU HỤT TRUNG VỊ P50').parentElement).toHaveTextContent('5 xe')
    expect(screen.getByText('THIẾU HỤT THẬN TRỌNG P90').parentElement).toHaveTextContent('5 xe')
    expect(screen.getByText('NGUỒN DƯ TRUNG VỊ P50').parentElement).toHaveTextContent('6 xe')
    expect(screen.getByText('1 zone · trước các ràng buộc điều chuyển')).toBeInTheDocument()
  })

  it('reconciles displayed and grouped p90 deficits with the p90 total', () => {
    const visible = { ...zone, demand: 10, supply: 9, gap: 1, operationalGap: 6 }
    const groupedTwo = { ...zone, id: 'AI-Z02', aiZoneId: 2, zoneCode: 'AI-Z02', label: 'Hoàn Kiếm', demand: 10, supply: 11, gap: -1, operationalGap: 2 }
    const groupedOne = { ...zone, id: 'AI-Z03', aiZoneId: 3, zoneCode: 'AI-Z03', label: 'Tây Hồ', demand: 10, supply: 12, gap: -2, operationalGap: 1 }
    render(<ForecastDrawer forecastTime="08:05" horizon={5} hotspots={[]} onClose={vi.fn()} onZoneSelect={vi.fn()} sourceTime="08:00" zones={[visible, groupedTwo, groupedOne]} />)

    const reconciliation = screen.getByLabelText('Đối chiếu tổng thiếu hụt p90')
    expect(within(reconciliation).getByText('1 vùng đang hiển thị', { exact: false }).parentElement).toHaveTextContent('6 xe')
    expect(within(reconciliation).getByText('2 vùng được gom', { exact: false }).parentElement).toHaveTextContent('3 xe')
    expect(within(reconciliation).getByText('Tổng thiếu hụt', { exact: false }).parentElement).toHaveTextContent('9 xe')
    expect(screen.getByText('Danh sách dưới đây dùng kịch bản p90, không phải các thành phần của tổng thiếu hụt p50.')).toBeInTheDocument()
    expect(screen.getByText('2 vùng còn lại').parentElement?.parentElement).toHaveTextContent('−3 xe')
  })
})
