import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Snapshot, Zone } from '@/features/operator-data'
import { PipelineModal, type PipelineTabId } from '@/features/operator-pipeline/components/PipelineModal'

const zone = (id: number, demand: number, supply: number, forecast15: number): Zone => ({
  id: `AI-Z${id}`,
  aiZoneId: id,
  zoneCode: `AI-Z${id}`,
  label: `Zone ${id}`,
  tier: 'core',
  areaKm2: 1,
  center: [105.8, 21],
  boundary: [],
  dataStatus: 'live',
  supply,
  demand,
  gap: Math.max(0, demand - supply),
  severity: 'High',
  confidence: 88,
  rainMmH: 2.1,
  rainForecast15: 2.4,
  rainForecast30: 2.4,
  forecast15,
  forecast30: forecast15,
  forecastSupply15: supply,
})

const snapshot: Snapshot = {
  generatedAt: '2026-08-23T17:05:00+07:00',
  sourceAt: '2026-08-23T17:05:00+07:00',
  replayStep: '5',
  scenario: 'baseline',
  demoScenarioId: 'rain-peak',
  regime: 'rain_peak',
  ai: { zoneContract: 'AI_ZONE_1_30', registeredZones: 2, liveZones: 2, forecastedZones: 2, horizons: [15, 30], modelVersion: 'lgbm_v2_rainpeak', forecastMode: 'trained_model_replay', dataSource: 'replay', forecastAt: null },
  zones: [zone(1, 30, 10, 36), zone(2, 12, 14, 12)],
  hotspots: [],
  kpis: { fleetAvailable: 24, requests: 42, fulfillmentRate: 52.4, residualGap: 20, avgWaitProxy: 8.4 },
}

// Tab do bên ngoài giữ (thanh icon dọc cũng chọn tab), nên test bọc bằng một chủ sở hữu state.
const forecastControl = {
  horizons: [15, 30] as const,
  horizon: 15 as const,
  isRunning: false,
  blockedReason: undefined,
  auto: { isEnabled: false, intervalMinutes: 5, isAutoPlan: false },
  intervals: [2, 5, 10],
  onHorizonChange: vi.fn(),
  onRun: vi.fn(),
  onRefresh: vi.fn(),
  onAutoChange: vi.fn(),
}

function PanelHarness(props: Partial<Parameters<typeof PipelineModal>[0]>) {
  const [tab, setTab] = useState<PipelineTabId>('overview')
  return (
    <>
      {/* Thay cho thanh icon dọc của console — panel không tự giữ tab. */}
      {(['overview', 'agents', 'connect'] as const).map((id) => (
        <button key={id} onClick={() => setTab(id)} type="button">
          {{ overview: 'Tổng quan', agents: 'Agent', connect: 'Sơ đồ' }[id]}
        </button>
      ))}
      <PipelineModal forecastControl={forecastControl} horizonMinutes={15} onClose={vi.fn()} onTabChange={setTab} snapshot={snapshot} tab={tab} {...props} />
    </>
  )
}

function renderPanel(props: Partial<Parameters<typeof PipelineModal>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><PanelHarness {...props} /></QueryClientProvider>)
  return queryClient
}

describe('Autonomous Resolution Pipeline panel', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('opens on the monitoring tab with the observed supply and demand', () => {
    renderPanel()

    expect(screen.getByRole('heading', { name: 'Giám sát hệ thống' })).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('52.4%')).toBeInTheDocument()
  })

  it('marks the 30 minute mark as extrapolated and never as a model output', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: '+30 phút' }))

    expect(screen.getByRole('note')).toHaveTextContent('Ngoại suy — không phải output model')
    expect(screen.getByRole('note')).toHaveTextContent('Không dùng để tạo hoặc duyệt phương án')
  })

  it('projects the forecast horizons from the snapshot instead of the current numbers', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: '+15 phút' }))
    // cầu 30 → 36 và 12 → 12 nên tổng cầu dự báo là 48.
    expect(screen.getByText('48')).toBeInTheDocument()
  })

  it('hides the backend-only metrics at forecast horizons rather than recomputing them', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: '+15 phút' }))

    expect(screen.queryByText('52.4%')).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('moves from an agent card to the flow diagram focused on that agent', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Xem Dispatch trong sơ đồ' }))

    expect(screen.getByRole('heading', { name: 'Sơ đồ luồng & phương án' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Dispatch —/ })).toBeInTheDocument()
  })

  it('keeps the display threshold out of the policy file', async () => {
    renderPanel()

    expect(screen.getByText(/Không ghi vào/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Ngưỡng cảnh báo thiếu hụt/)).toHaveValue('40')
  })

  it('shows the tasks an agent owns when its node is opened in the flow tab', async () => {
    renderPanel({
      tasks: [
        { id: 'forecast.run', owner: 'forecast', label: 'Dự báo cung–cầu', command: 'forecast.run()', result: 'Chờ lệnh chạy dự báo', state: 'waiting' },
        { id: 'approval.gate', owner: 'outside', label: 'Chờ phê duyệt', command: 'approval.gate()', result: '', state: 'idle' },
      ],
    })

    await userEvent.click(screen.getByRole('button', { name: 'Sơ đồ' }))
    await userEvent.click(screen.getByRole('button', { name: /^Forecast —/ }))

    // Danh sách task bung ra ngay trong thẻ agent, không phải một khối riêng dưới sơ đồ.
    expect(screen.getByRole('button', { name: /^Forecast —/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Dự báo cung–cầu')).toBeInTheDocument()
    expect(screen.getByText('forecast.run()')).toBeInTheDocument()
  })

  it('keeps the human gate out of every agent and says why', async () => {
    renderPanel({
      tasks: [
        { id: 'approval.gate', owner: 'outside', label: 'Chờ phê duyệt', command: 'approval.gate()', result: '', state: 'idle' },
      ],
    })

    await userEvent.click(screen.getByRole('button', { name: 'Sơ đồ' }))
    await userEvent.click(screen.getByRole('button', { name: /Ngoài đồ thị agent \(1\)/ }))

    expect(screen.getByText(/không nằm trong đồ thị agent/)).toBeInTheDocument()
  })

  // Băng chế độ agent nói về **lượt chạy tới**; badge routing_mode trên thẻ nói về run đã chạy.
  it('says which path the next run will take, from the gateway preflight', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Agent' }))

    const banner = await screen.findByRole('region', { name: 'Chế độ agent' })
    // Mock adapter chạy không gateway — đúng mặc định của dự án.
    expect(banner).toHaveTextContent('Đường cố định')
    expect(banner).toHaveTextContent('google/gemini-3.7-flash')
  })

  it('lists the zone breakdown ordered by shortage', () => {
    renderPanel()

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Zone 1')
  })
})
