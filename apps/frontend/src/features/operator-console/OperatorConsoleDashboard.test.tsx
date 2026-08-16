import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OperatorConsoleDashboard, RailActions, ScenarioBar, ZoneCard } from '@/features/operator-console/OperatorConsoleDashboard'
import { proposalCoverageForStage } from '@/features/operator-console/model/proposalCoverage'
import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import { createAgentPlans } from '@/features/operator-data/model/mockProposalEngine'
import type { Zone } from '@/features/operator-data'

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><MemoryRouter><OperatorConsoleDashboard /></MemoryRouter></QueryClientProvider>)
  return queryClient
}

describe('operator console safety states', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('keeps the operator in a retryable degraded state when the snapshot API is unavailable', async () => {
    vi.spyOn(mockOperatorAdapter, 'getSnapshot').mockRejectedValue(new Error('database unavailable'))
    const queryClient = renderDashboard()

    expect(await screen.findByText('Không thể nạp snapshot vận hành.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    queryClient.clear()
  })

  it('renders all forecast horizons declared by the server capability', () => {
    const changeHorizon = vi.fn()
    render(<ScenarioBar fleet={214} forecastMinutes={5} generatedAt="2026-08-14T08:55:00Z" horizons={[5, 10, 15]} modelVersion="lgbm" onForecastChange={changeHorizon} onRefresh={vi.fn()} regime="rain_peak" zoneCount={30} />)

    expect(screen.getByRole('radio', { name: '5 phút' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '10 phút' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '15 phút' })).toBeInTheDocument()
  })

  it('keeps the selected horizon stable and runs only after explicit confirmation', async () => {
    const baseline = await mockOperatorAdapter.getSnapshot('baseline')
    if (!baseline.ai) throw new Error('Mock snapshot must include AI forecast metadata')
    const fiveMinuteOnly = {
      ...baseline,
      ai: {
        ...baseline.ai,
        horizons: [5],
        forecastRuns: baseline.ai.forecastRuns?.filter((run) => run.horizonMinutes === 5) ?? [],
      },
    }
    vi.spyOn(mockOperatorAdapter, 'getSnapshot').mockResolvedValue(fiveMinuteOnly)
    vi.spyOn(mockOperatorAdapter, 'runReplayStep').mockImplementation(async (sourceAt) => ({ ...fiveMinuteOnly, sourceAt }))
    const generate = vi.spyOn(mockOperatorAdapter, 'generateAiDecision')
    const queryClient = renderDashboard()

    await userEvent.click(await screen.findByRole('radio', { name: '15 phút' }, { timeout: 15_000 }))
    expect(generate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Chạy dự báo cung–cầu' }))
    await waitFor(() => expect(generate).toHaveBeenCalledWith(expect.any(Number), 15))

    queryClient.clear()
  }, 20_000)

  it('switches between the city and core map views', async () => {
    const queryClient = renderDashboard()
    const core = await screen.findByRole('radio', { name: 'Vùng lõi' }, { timeout: 15_000 })
    const city = screen.getByRole('radio', { name: 'Toàn thành phố' })

    expect(city).toBeChecked()
    await userEvent.click(core)
    expect(core).toBeChecked()
    await userEvent.click(city)
    expect(city).toBeChecked()

    queryClient.clear()
  }, 20_000)

  it('keeps zone search and details usable when Mapbox is unavailable', async () => {
    const queryClient = renderDashboard()

    expect(await screen.findByText('Chưa cấu hình Mapbox', {}, { timeout: 15_000 })).toBeInTheDocument()
    const zoneButton = await screen.findByRole('button', { name: /Ba Đình/ })
    await userEvent.click(zoneButton)
    expect(screen.getByText('CHI TIẾT KHU VỰC')).toBeInTheDocument()
    queryClient.clear()
  }, 20_000)

  it('does not mix the p50 supply-demand difference with the conservative p90 deficit', () => {
    const zone: Zone = {
      id: 'AI-Z09', aiZoneId: 9, zoneCode: 'AI-Z09', label: 'Long Biên', tier: 'ring', areaKm2: 59.93,
      center: [105.9, 21.04], boundary: [], dataStatus: 'live', supply: 11, demand: 22, gap: 11,
      operationalGap: 18, severity: 'Critical', confidence: null, rainMmH: 0.38, rainForecast15: 0.4,
      rainForecast30: 0.5, forecast15: 22, forecast30: 22,
    }

    render(<ZoneCard onClose={vi.fn()} zone={zone} />)

    expect(screen.getByText('Chênh lệch p50').parentElement).toHaveTextContent('-11')
    expect(screen.getByText('Thiếu hụt thận trọng p90: 18 xe (dùng để kiểm tra policy)')).toBeInTheDocument()
  })

  it('shows expected activation coverage instead of a misleading 0% relocation value', () => {
    const source = createAgentPlans('rain-peak')[0]!
    const plan = {
      ...source,
      moves: [],
      metrics: { ...source.metricsBefore },
      metricsAfterActivation: { ...source.metricsBefore, residualGap: 0 },
    }

    expect(proposalCoverageForStage(plan, 'plan')).toEqual({
      label: 'MỨC PHỦ MỤC TIÊU',
      percent: 0,
    })
    expect(proposalCoverageForStage(plan, 'activation_draft')).toEqual({
      label: 'MỨC PHỦ KỲ VỌNG',
      percent: 100,
    })
  })

  it('does not simulate completion when relocation dispatch is unavailable', () => {
    const plan = { ...createAgentPlans('rain-peak')[0]!, status: 'Approved' as const }
    const action = vi.fn()

    render(<RailActions
      campaign={undefined}
      forecastReady
      isGenerating={false}
      isOptimizing={false}
      isScanning={false}
      onActivate={action}
      onApprove={action}
      onGenerate={action}
      onOpenCampaign={action}
      onOpenPlan={action}
      onOptimize={action}
      onPrepareActivation={action}
      onReject={action}
      plan={plan}
      stage="approved"
    />)

    expect(screen.getByRole('button', { name: 'Chưa kết nối phát lệnh điều chuyển' })).toBeDisabled()
    expect(screen.getByText(/không tự đánh dấu hoàn tất/i)).toBeInTheDocument()
  })

  it('shows expected hybrid coverage from the plan stage', () => {
    const source = createAgentPlans('rain-peak')[0]!
    const plan = {
      ...source,
      planMode: 'HYBRID' as const,
      metricsBefore: { ...source.metricsBefore, residualGap: 43 },
      metrics: { ...source.metrics, residualGap: 41 },
      metricsAfterActivation: { ...source.metrics, residualGap: 15.8 },
    }

    expect(proposalCoverageForStage(plan, 'plan')).toEqual({
      label: 'MỨC PHỦ KỲ VỌNG',
      percent: 63,
    })
  })

  it('blocks model actions while a source zone has no observation', () => {
    const action = vi.fn()
    render(<RailActions
      campaign={undefined}
      dataComplete={false}
      forecastReady={false}
      isGenerating={false}
      isOptimizing={false}
      isScanning={false}
      missingZoneCount={1}
      onActivate={action}
      onApprove={action}
      onGenerate={action}
      onOpenCampaign={action}
      onOpenPlan={action}
      onOptimize={action}
      onPrepareActivation={action}
      onReject={action}
      plan={undefined}
      stage="observe"
    />)
    expect(screen.getByRole('button', { name: 'Chờ dữ liệu zone đầy đủ' })).toBeDisabled()
    expect(screen.getByText(/thiếu dữ liệu nguồn ở 1 zone/i)).toBeInTheDocument()
  })

  it('blocks a new plan and links to the active execution', async () => {
    const optimize = vi.fn()
    const openExecution = vi.fn()
    const action = vi.fn()
    render(<RailActions
      campaign={undefined}
      forecastReady
      hasActiveExecution
      isGenerating={false}
      isOptimizing={false}
      isScanning={false}
      onActivate={action}
      onApprove={action}
      onGenerate={action}
      onOpenCampaign={action}
      onOpenExecution={openExecution}
      onOpenPlan={action}
      onOptimize={optimize}
      onPrepareActivation={action}
      onReject={action}
      plan={undefined}
      stage="forecast"
    />)

    await userEvent.click(screen.getByRole('button', { name: 'Mở phương án đang vận hành' }))
    expect(openExecution).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Tính phương án điều chuyển' })).not.toBeInTheDocument()
    expect(optimize).not.toHaveBeenCalled()
  })

  it('keeps a stale snapshot view-only and blocks model actions with a reason', () => {
    const action = vi.fn()
    render(<RailActions
      campaign={undefined}
      forecastReady={false}
      isGenerating={false}
      isOptimizing={false}
      isScanning={false}
      onActivate={action}
      onApprove={action}
      onGenerate={action}
      onOpenCampaign={action}
      onOpenPlan={action}
      onOptimize={action}
      onPrepareActivation={action}
      onReject={action}
      plan={undefined}
      snapshotStale
      stage="observe"
    />)
    expect(screen.getByRole('button', { name: 'Snapshot đã cũ — cần làm mới' })).toBeDisabled()
    expect(screen.getByText(/vẫn có thể xem bản đồ/i)).toBeInTheDocument()
  })

  it('requires approval before a no-relocation activation can be released', async () => {
    const plan = { ...createAgentPlans('rain-peak')[0]!, moves: [] }
    const approve = vi.fn()
    const activate = vi.fn()
    const action = vi.fn()

    const view = render(<RailActions
      campaign={undefined}
      forecastReady
      isGenerating={false}
      isOptimizing={false}
      isScanning={false}
      onActivate={activate}
      onApprove={approve}
      onGenerate={action}
      onOpenCampaign={action}
      onOpenPlan={action}
      onOptimize={action}
      onPrepareActivation={action}
      onReject={action}
      plan={plan}
      stage="activation_draft"
    />)

    await userEvent.click(screen.getByRole('button', { name: 'Phê duyệt bản nháp activation' }))
    expect(approve).toHaveBeenCalledOnce()
    expect(activate).not.toHaveBeenCalled()

    view.rerender(<RailActions
      campaign={undefined}
      forecastReady
      isGenerating={false}
      isOptimizing={false}
      isScanning={false}
      onActivate={activate}
      onApprove={approve}
      onGenerate={action}
      onOpenCampaign={action}
      onOpenPlan={action}
      onOptimize={action}
      onPrepareActivation={action}
      onReject={action}
      plan={{ ...plan, status: 'Approved' }}
      stage="approved"
    />)

    await userEvent.click(screen.getByRole('button', { name: 'Phát hành offer activation' }))
    expect(activate).toHaveBeenCalledOnce()
  })
})
