import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OperatorConsoleDashboard, RailActions, ScenarioBar, ZoneCard } from '@/features/operator-console/OperatorConsoleDashboard'
import { currentOperatorReplaySourceAt } from '@/features/operator-console/model/defaultReplay'
import * as replayAnchorHook from '@/features/operator-console/hooks/useCurrentReplayAnchor'
import { proposalCoverageForStage } from '@/features/operator-console/model/proposalCoverage'
import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import { createAgentPlans } from '@/features/operator-data/model/mockProposalEngine'
import type { Zone } from '@/features/operator-data'

/** Ra lệnh bằng cách gõ vào nhật ký agent — hai bước quy trình không còn nút bấm nào.
 *
 * Đi trọn đường thật: ô nhập → `askAgent` của mock adapter → directive → handler mà nút cũ gọi.
 * Nên test vẫn khẳng định đúng thứ nó vẫn khẳng định, cộng thêm một tầng nữa.
 */
async function raLenh(cau: string) {
  await userEvent.type(screen.getByRole('combobox', { name: 'Ra lệnh hoặc hỏi agent' }), `${cau}{Enter}`)
}

function renderDashboard({ withActiveExecution = false }: { withActiveExecution?: boolean } = {}) {
  if (!withActiveExecution) {
    const listCampaigns = mockOperatorAdapter.listCampaigns
    vi.spyOn(mockOperatorAdapter, 'listCampaigns').mockImplementation(async () =>
      (await listCampaigns()).map((campaign) => campaign.status === 'Running' ? { ...campaign, status: 'Closed' as const } : campaign),
    )
  }
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

  it('shows only the active operation and hides forecasting while it is running', async () => {
    renderDashboard({ withActiveExecution: true })

    expect(await screen.findByRole('region', { name: 'Phương án đang chạy' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Nhật ký phương án đang chạy' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Tìm khu vực' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hủy offer đang phát hành' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Chạy dự báo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Horizon dự báo' })).not.toBeInTheDocument()
  })

  it('renders all forecast horizons declared by the server capability', () => {
    const changeHorizon = vi.fn()
    render(<ScenarioBar forecastMinutes={15} horizons={[15, 30]} onForecastChange={changeHorizon} onRefresh={vi.fn()} regime="rain_peak" />)

    expect(screen.getByRole('radio', { name: '15 phút' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '30 phút' })).toBeInTheDocument()
  })

  it('thanh trên cùng chỉ còn bối cảnh và điều khiển', () => {
    // Bốn nhãn bị gỡ vì không giúp người vận hành quyết định gì: "Đội xe" lặp lại con số của
    // biểu đồ cầu–cung, "30/30 zone" là `zones.length` nên luôn bằng 30 kể cả khi thiếu dữ
    // liệu, "MODEL" vẫn còn ở ForecastDrawer và ForecastRunStatus, còn "HORIZON DỰ BÁO" chỉ
    // nhắc lại thứ ba nút bên cạnh đã tự nói.
    render(<ScenarioBar forecastMinutes={15} horizons={[15, 30]} onForecastChange={vi.fn()} onRefresh={vi.fn()} regime="rain_peak" />)

    expect(screen.getByText('Mưa lớn · giờ cao điểm')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Làm mới dữ liệu' })).toBeInTheDocument()
    expect(screen.queryByText(/Đội xe/)).not.toBeInTheDocument()
    expect(screen.queryByText(/zone$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^MODEL/)).not.toBeInTheDocument()
    expect(screen.queryByText('HORIZON DỰ BÁO')).not.toBeInTheDocument()
  })

  it('keeps the selected horizon stable and runs only after explicit confirmation', async () => {
    const baseline = await mockOperatorAdapter.getSnapshot('baseline')
    if (!baseline.ai) throw new Error('Mock snapshot must include AI forecast metadata')
    const fifteenMinuteOnly = {
      ...baseline,
      ai: {
        ...baseline.ai,
        horizons: [15],
        forecastRuns: baseline.ai.forecastRuns?.filter((run) => run.horizonMinutes === 15) ?? [],
      },
    }
    vi.spyOn(mockOperatorAdapter, 'getSnapshot').mockResolvedValue(fifteenMinuteOnly)
    vi.spyOn(mockOperatorAdapter, 'runReplayStep').mockImplementation(async (sourceAt) => ({ ...fifteenMinuteOnly, sourceAt }))
    const generate = vi.spyOn(mockOperatorAdapter, 'generateAiDecision')
    const queryClient = renderDashboard()

    await userEvent.click(await screen.findByRole('radio', { name: '30 phút' }, { timeout: 15_000 }))
    expect(generate).not.toHaveBeenCalled()
    await raLenh('chạy dự báo')
    await waitFor(() => expect(generate).toHaveBeenCalledWith(expect.any(Number), 30))

    queryClient.clear()
  }, 20_000)

  // Bảng chỉ số chính sách thay bảng TIẾN TRÌNH HỆ THỐNG cũ ở cột chỉ huy.
  //
  // Hai test dưới giữ đúng lời hứa của màn đó: ngưỡng kéo được, và giá trị đã kéo THỰC SỰ
  // đi theo lượt tính. Một bảng chỉ đổi con số trên màn hình mà không đổi lượt chạy là thứ
  // tệ hơn không có bảng — người vận hành tin là mình đã siết ngân sách trong khi không.
  it('bảng chỉ số chính sách thay chỗ bảng tiến trình cũ', async () => {
    const queryClient = renderDashboard()

    expect(await screen.findByRole('region', { name: 'Chỉ số chính sách' }, { timeout: 15_000 })).toBeInTheDocument()
    expect(screen.queryByText('TIẾN TRÌNH HỆ THỐNG')).not.toBeInTheDocument()
    queryClient.clear()
  }, 20_000)

  it('gửi ngưỡng đã chỉnh theo lượt tính phương án', async () => {
    const optimize = vi.spyOn(mockOperatorAdapter, 'optimizeAiDecision')
    const queryClient = renderDashboard()

    await screen.findByRole('region', { name: 'Chỉ số chính sách' }, { timeout: 15_000 })
    fireEvent.change(screen.getByLabelText('Ngân sách điều chuyển'), { target: { value: '400000' } })
    await raLenh('chạy dự báo')
    await raLenh('tính phương án')

    await waitFor(() => expect(optimize).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      { budget_cap: 400000 },
    ))
    queryClient.clear()
  }, 25_000)

  // MA-6.8: thao tác của người vận hành phải nằm cùng dòng chảy với việc agent làm. Trước
  // đó nhật ký im bặt đúng lúc con người ra quyết định, và mạch ở §1 đọc không ra.
  it('ghi thao tác của người vận hành vào nhật ký, tại lúc biết kết quả chứ không lúc bấm', async () => {
    const queryClient = renderDashboard()

    await userEvent.click(await screen.findByRole('radio', { name: '30 phút' }, { timeout: 15_000 }))
    const nhatKy = screen.getByRole('log')
    expect(nhatKy).not.toHaveTextContent('NGƯỜI VẬN HÀNH')

    await raLenh('chạy dự báo')

    await waitFor(() => expect(nhatKy).toHaveTextContent('[NGƯỜI VẬN HÀNH] > đã chạy dự báo horizon 30 phút'))
    queryClient.clear()
  }, 20_000)

  it('nói rõ là hỏng khi thao tác thất bại, không ghi như đã xong', async () => {
    vi.spyOn(mockOperatorAdapter, 'generateAiDecision').mockRejectedValue(new Error('Snapshot đã cũ'))
    const queryClient = renderDashboard()

    await userEvent.click(await screen.findByRole('radio', { name: '30 phút' }, { timeout: 15_000 }))
    await raLenh('chạy dự báo')

    const nhatKy = screen.getByRole('log')
    await waitFor(() => expect(nhatKy).toHaveTextContent('chạy dự báo không thành — Snapshot đã cũ'))
    expect(nhatKy).not.toHaveTextContent('đã chạy dự báo horizon')
    queryClient.clear()
  }, 20_000)

  it('nói rõ vì sao không chạy được, thay vì nhận lệnh rồi im', async () => {
    // `runForecastFor` mở đầu bằng một guard `return` im lặng. Với một cái nút thì im lặng còn
    // chấp nhận được — nút đã bị ẩn từ trước. Gõ chữ thì không: người vừa được trả lời "đang
    // chạy dự báo" mà rồi không có gì xảy ra.
    const generate = vi.spyOn(mockOperatorAdapter, 'generateAiDecision')
    const queryClient = renderDashboard({ withActiveExecution: true })
    await screen.findByRole('region', { name: 'Phương án đang chạy' }, { timeout: 15_000 })

    await raLenh('chạy dự báo')

    const nhatKy = screen.getByRole('log')
    await waitFor(() => expect(nhatKy).toHaveTextContent('chạy dự báo không thành — đang có lệnh điều xe'))
    expect(generate).not.toHaveBeenCalled()
    queryClient.clear()
  }, 20_000)

  it('treats a replay bucket at the live edge as fresh even when it was stored earlier', async () => {
    const baseline = await mockOperatorAdapter.getSnapshot('baseline')
    const replaySourceAt = currentOperatorReplaySourceAt(new Date())
    const replaySnapshot = {
      ...baseline,
      generatedAt: '2026-08-16T07:15:00.000Z',
      sourceAt: replaySourceAt,
    }
    vi.spyOn(mockOperatorAdapter, 'getSnapshot').mockResolvedValue(replaySnapshot)
    const replay = vi.spyOn(mockOperatorAdapter, 'runReplayStep').mockImplementation(async (sourceAt) => ({ ...replaySnapshot, sourceAt }))
    const queryClient = renderDashboard()

    await waitFor(() => expect(replay).toHaveBeenCalled())
    expect(screen.queryByText('Snapshot đang được tự động làm mới')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Snapshot đã cũ — cần làm mới' })).not.toBeInTheDocument()

    queryClient.clear()
  })

  it('bypasses the replay cache when the operator manually refreshes the dashboard', async () => {
    const baseline = await mockOperatorAdapter.getSnapshot('baseline')
    const replay = vi.spyOn(mockOperatorAdapter, 'runReplayStep').mockImplementation(async (sourceAt) => ({ ...baseline, sourceAt }))
    const queryClient = renderDashboard()

    await waitFor(() => expect(replay).toHaveBeenCalled())
    const callsBeforeRefresh = replay.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Làm mới dữ liệu' }))
    await waitFor(() => expect(replay.mock.calls.length).toBeGreaterThan(callsBeforeRefresh))

    queryClient.clear()
  })

  it('keeps planning progress pinned when the live replay bucket advances', async () => {
    const baseline = await mockOperatorAdapter.getSnapshot('baseline')
    vi.spyOn(mockOperatorAdapter, 'listPlans').mockResolvedValue([])
    vi.spyOn(mockOperatorAdapter, 'listCampaigns').mockResolvedValue([])
    vi.spyOn(mockOperatorAdapter, 'listDispatch').mockResolvedValue([])
    const initialAnchor = currentOperatorReplaySourceAt(new Date())
    const nextAnchor = new Date(Date.parse(initialAnchor) + 5 * 60_000).toISOString()
    let replayAnchor = initialAnchor
    vi.spyOn(replayAnchorHook, 'useCurrentReplayAnchor').mockImplementation(() => replayAnchor)
    vi.spyOn(mockOperatorAdapter, 'getSnapshot').mockResolvedValue({ ...baseline, sourceAt: initialAnchor })
    const replay = vi.spyOn(mockOperatorAdapter, 'runReplayStep').mockImplementation(async (sourceAt) => ({ ...baseline, sourceAt }))
    const generate = vi.spyOn(mockOperatorAdapter, 'generateAiDecision')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const dashboard = () => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><OperatorConsoleDashboard /></MemoryRouter>
      </QueryClientProvider>
    )
    const view = render(dashboard())

    await waitFor(() => expect(replay).toHaveBeenCalled())
    await raLenh('chạy dự báo')
    await waitFor(() => expect(generate).toHaveBeenCalled())
    // Bước kế cũng đã chuyển sang gõ lệnh, nên chỗ này nói ra câu cần gõ chứ không còn nút.
    expect(await screen.findByText('tính phương án')).toBeInTheDocument()
    const replayCallsDuringPlanning = replay.mock.calls.length

    replayAnchor = nextAnchor
    await act(async () => {
      view.rerender(dashboard())
      await Promise.resolve()
    })

    expect(replay).toHaveBeenCalledTimes(replayCallsDuringPlanning)
    expect(screen.getByText('tính phương án')).toBeInTheDocument()
    queryClient.clear()
  })

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
    expect(screen.getByText(/DỮ LIỆU GHI NHẬN/, { selector: '.nf-zone-card > small' })).toBeInTheDocument()
    queryClient.clear()
  }, 20_000)

  it('shows observed supply and demand separately from the p50 and p90 forecast', () => {
    const observed: Zone = {
      id: 'AI-Z02', aiZoneId: 2, zoneCode: 'AI-Z02', label: 'Hoàn Kiếm', tier: 'core', areaKm2: 5.29,
      center: [105.85, 21.03], boundary: [], dataStatus: 'live', supply: 33, demand: 32, gap: 0,
      severity: 'Low', confidence: null, rainMmH: 0.35, rainForecast15: 0.4,
      rainForecast30: 0.5, forecast15: 32, forecast30: 32,
    }
    const forecast = { ...observed, supply: 33, demand: 32, operationalGap: 5, confidence: 87 }

    render(<ZoneCard forecastTime="22:45" forecastZone={forecast} observationTime="22:40" onClose={vi.fn()} zone={observed} />)

    expect(screen.getByText('Cung ghi nhận').parentElement).toHaveTextContent('33')
    expect(screen.getByText('Cầu ghi nhận').parentElement).toHaveTextContent('32')
    expect(screen.getByText('Chênh lệch ghi nhận').parentElement).toHaveTextContent('+1')
    expect(screen.getByText('p50: cung 33 · cầu 32 · chênh lệch +1')).toBeInTheDocument()
    expect(screen.getByText('Rủi ro p90: thiếu 5 xe')).toBeInTheDocument()
    expect(screen.getByText('Màu bản đồ ở chế độ dự báo lấy theo rủi ro p90.')).toBeInTheDocument()
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

  it('never offers approval for an expired proposal', () => {
    const plan = {
      ...createAgentPlans('rain-peak')[0]!,
      status: 'UnderReview' as const,
      inputFreshUntil: '2026-08-12T08:19:59Z',
    }
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
      reviewNow={new Date('2026-08-12T08:20:00Z')}
      stage="plan"
    />)

    expect(screen.getByRole('button', { name: 'Tính lại phương án' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Phê duyệt phương án' })).not.toBeInTheDocument()
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

  it('shows a completed no-action result when policy finds no hotspot', async () => {
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
      optimizationStopReason="NO_POLICY_HOTSPOT"
      plan={undefined}
      stage="not_required"
    />)

    expect(screen.getByText('Không cần điều chuyển')).toBeInTheDocument()
    expect(screen.getByText('NO_POLICY_HOTSPOT')).toBeInTheDocument()
    expect(screen.getByText(/không có proposal, lệnh điều chuyển hoặc campaign/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Xem lại kết quả dự báo' }))
    expect(action).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Tính phương án điều chuyển' })).not.toBeInTheDocument()
  })

  it('explains an optimizer result with no operational solution', () => {
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
      optimizationStopReason="NO_SOLUTION"
      plan={undefined}
      stage="not_required"
    />)

    expect(screen.getByText('Chưa có phương án khả thi')).toBeInTheDocument()
    expect(screen.getByText(/chưa tìm thấy nguồn xe hoặc hành động an toàn/i)).toBeInTheDocument()
    expect(screen.getByText('NO_SOLUTION')).toBeInTheDocument()
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

describe('operator console dashboard layout', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('opens the agent flow panel from the header chip', async () => {
    renderDashboard()
    await screen.findByRole('complementary', { name: 'Biểu đồ vận hành' })

    expect(screen.queryByRole('region', { name: 'Autonomous Resolution Pipeline' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Luồng agent/ }))

    expect(await screen.findByRole('region', { name: 'Autonomous Resolution Pipeline' })).toBeInTheDocument()
  })

  it('charts the live per-zone imbalance beside the map', async () => {
    renderDashboard()

    const insights = await screen.findByRole('complementary', { name: 'Biểu đồ vận hành' })
    expect(within(insights).getByRole('img', { name: 'Biểu đồ thiếu và dư xe theo zone' })).toBeInTheDocument()
  })

  // Cột trái là biểu đồ, cột phải là sức khỏe mạng lưới — mỗi khối đúng một chỗ.
  it('keeps the trend charts on the left and network health on the right', async () => {
    renderDashboard()

    const charts = await screen.findByRole('complementary', { name: 'Biểu đồ vận hành' })
    expect(within(charts).getByRole('region', { name: 'Xu hướng cầu và cung trong ngày' })).toBeInTheDocument()
    expect(within(charts).getByRole('region', { name: 'Tác động của AI' })).toBeInTheDocument()
    expect(within(charts).queryByRole('region', { name: 'Sức khỏe mạng lưới' })).not.toBeInTheDocument()

    expect(await screen.findByRole('region', { name: 'Sức khỏe mạng lưới' })).toBeInTheDocument()
  })
})
