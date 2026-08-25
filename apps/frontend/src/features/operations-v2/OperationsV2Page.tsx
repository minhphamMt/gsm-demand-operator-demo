import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Bell,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CloudRain,
  Command,
  Eye,
  GitCompareArrows,
  Layers3,
  Map,
  Menu,
  Play,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { dispatchPlans, agents, executionEvents, FORECAST_HORIZONS, operationsDemandTrendAtHorizon, operationsEtaTrendAtHorizon, operationsNetworkAtHorizon, operationsZoneBalanceAtHorizon, operationsZones, operationsZonesAtHorizon, updatedPlan, zoneById } from './data/mockData'
import { OperationsLineChart, ZoneBalanceChart } from './components/OperationsCharts'
import { OperationsMap } from './components/OperationsMap'
import { AgentStateIcon, DonutMetric, MetricValue, PlanCard, SectionHeading, StatusPill } from './components/OperationsPrimitives'
import type { ActiveScreen, AgentState, AgentStep, DispatchPlan, FlowStage, ForecastHorizon, RejectReason } from './types'
import { agentStateLabels, flowStageLabels, rejectReasonLabels, statusSeverityLabels, zoneStatusLabels } from './uiLabels'
import './operations-v2.css'

const navItems: Array<{ id: ActiveScreen; label: string; shortLabel: string }> = [
  { id: 'wall', label: 'Bảng tổng quan', shortLabel: 'Tổng quan' },
  { id: 'map', label: 'Bản đồ trực tiếp', shortLabel: 'Bản đồ' },
  { id: 'pipeline', label: 'Luồng AI', shortLabel: 'Tác tử' },
  { id: 'plans', label: 'Chiến lược', shortLabel: 'Phương án' },
  { id: 'review', label: 'Duyệt phương án', shortLabel: 'Duyệt' },
  { id: 'execution', label: 'Thực thi', shortLabel: 'Điều phối' },
]

const agentRunningProgress: Record<string, number> = { forecast: 58, traffic: 46, supply: 72, dispatch: 62, optimization: 28 }

const stageLabels: Record<FlowStage, string> = flowStageLabels
const agentNameLabels: Record<string, string> = { forecast: 'Tác tử dự báo', traffic: 'Tác tử giao thông', supply: 'Tác tử nguồn xe', dispatch: 'Tác tử điều phối', optimization: 'Tác tử tối ưu' }
const agentOutputLabels: Record<string, string> = { forecast: 'Phát hiện nhu cầu tăng tại 3 khu vực', traffic: 'Ảnh hưởng mưa: thời gian di chuyển +15%', supply: 'Nguồn xe khả dụng đang thiếu', dispatch: 'Đang đánh giá các phương án điều chuyển', optimization: 'Đang chờ ràng buộc điều phối' }
const agentDetailLabels: Record<string, string> = { forecast: 'Độ tin cậy 94% · dự báo +30 phút', traffic: 'Đã nhận diện 3 hành lang ùn tắc', supply: 'Khu vực D thiếu 258 xe', dispatch: '12 phương án điều chuyển · đã chọn 2', optimization: 'Sẽ so sánh 3 phương án phản hồi' }
const executionEventLabels = [
  ['Bắt đầu điều chuyển xe', 'Khu vực D · đã điều phối 32 xe'],
  ['Người vận hành đã duyệt phương án B', 'Mạng lưới · đã ghi nhận phê duyệt'],
  ['Đã kích hoạt định tuyến thích ứng', 'Khu vực A → D · tuyến RV-204'],
  ['Đã nhận tín hiệu thời tiết', 'Mạng lưới · tác động thời gian +15%'],
] as const

export function OperationsV2Page() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('wall')
  const [flowStage, setFlowStage] = useState<FlowStage>('DEMAND_WARNING')
  const [horizon, setHorizon] = useState<ForecastHorizon>(0)
  const [selectedZoneId, setSelectedZoneId] = useState('zone-d')
  const [selectedPlanId, setSelectedPlanId] = useState('plan-b')
  const [planActions, setPlanActions] = useState<Record<string, boolean>>(() => actionStateFor(dispatchPlans[1]!))
  const [shortageLayer, setShortageLayer] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [showChanges, setShowChanges] = useState(false)
  const [showModify, setShowModify] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState<RejectReason>('Operational concern')
  const [rejectNote, setRejectNote] = useState('')
  const [customQuantity, setCustomQuantity] = useState(32)
  const [customTargetZone, setCustomTargetZone] = useState('zone-d')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const displayZones = operationsZonesAtHorizon(horizon)
  const selectedPlan = dispatchPlans.find((plan) => plan.id === selectedPlanId) ?? dispatchPlans[1]!
  const selectedZone = displayZones.find((zone) => zone.id === selectedZoneId) ?? displayZones[3]!
  const selectedActionCount = Object.values(planActions).filter(Boolean).length
  const canApprove = selectedActionCount > 0
  const runtimeAgents = agentsAtStage(flowStage)

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 3600)
  }

  function navigate(screen: ActiveScreen) {
    setActiveScreen(screen)
    setMobileNavOpen(false)
  }

  function handleHorizonChange(minutes: ForecastHorizon) {
    setHorizon(minutes)
    if (minutes > 0 && flowStage !== 'EXECUTING' && flowStage !== 'UPDATE_APPROVED') setFlowStage('FORECAST')
  }

  function startAnalysis() {
    if (flowStage === 'ANALYZING') return
    setActiveScreen('pipeline')
    setFlowStage('ANALYZING')
    window.setTimeout(() => {
      setFlowStage('PLAN_READY')
      setActiveScreen('plans')
      showToast('ĐÃ SẴN SÀNG 3 PHƯƠNG ÁN ĐIỀU PHỐI')
    }, 850)
  }

  function handleStageAction() {
    if (flowStage === 'PLAN_READY') { navigate('plans'); return }
    if (flowStage === 'PLAN_REVIEW') { navigate('review'); return }
    if (flowStage === 'DISPATCHING' || flowStage === 'EXECUTING' || flowStage === 'NEW_DATA' || flowStage === 'REPLAN_READY' || flowStage === 'UPDATE_APPROVED') { navigate('execution'); return }
    startAnalysis()
  }

  function openReview() {
    if (flowStage === 'PLAN_READY' || flowStage === 'PLAN_REVIEW') { setFlowStage('PLAN_REVIEW'); navigate('review'); return }
    setActiveScreen('pipeline')
    showToast('Hãy chạy luồng agent trước khi mở cổng duyệt')
  }

  function selectPlan(plan: DispatchPlan) {
    setSelectedPlanId(plan.id)
    setPlanActions(actionStateFor(plan))
    setCustomQuantity(plan.actions[0]?.quantity ?? 0)
    setCustomTargetZone(plan.actions[0]?.targetZoneId ?? 'zone-d')
  }

  function toggleAction(actionId: string) {
    setPlanActions((current) => ({ ...current, [actionId]: !current[actionId] }))
  }

  function approvePlan() {
    if (!canApprove) return
    setFlowStage('DISPATCHING')
    setActiveScreen('execution')
    showToast('ĐÃ DUYỆT PHƯƠNG ÁN — BẮT ĐẦU ĐIỀU PHỐI')
    window.setTimeout(() => setFlowStage('EXECUTING'), 720)
  }

  function ingestNewData() {
    setFlowStage('NEW_DATA')
    setActiveScreen('execution')
    showToast('ĐÃ NHẬN DỮ LIỆU MỚI')
    window.setTimeout(() => setFlowStage('REPLAN_READY'), 900)
  }

  function approveUpdate() {
    setFlowStage('UPDATE_APPROVED')
    setShowChanges(false)
    showToast('ĐÃ DUYỆT PHƯƠNG ÁN V2 — CẬP NHẬT ĐIỀU PHỐI')
  }

  function submitReject() {
    setShowReject(false)
    setFlowStage('DEMAND_WARNING')
    showToast(`ĐÃ TỪ CHỐI PHƯƠNG ÁN · ${rejectReasonLabels[rejectReason].toUpperCase()}`)
  }

  return <div className="operations-v2">
    <OperationsHeader activeScreen={activeScreen} agents={runtimeAgents} flowStage={flowStage} mobileNavOpen={mobileNavOpen} onNavigate={navigate} onToggleMobileNav={() => setMobileNavOpen((value) => !value)} />
    <main className={`operations-v2__main ${activeScreen === 'wall' ? 'operations-v2__main--wall' : ''}`}>
      <div className="operations-v2__intro">
        <div><div className="ops-kicker"><span className="ops-kicker__pulse" /> TRUNG TÂM ĐIỀU PHỐI / HÀ NỘI · 18:42 ICT</div><h1>{screenTitle(activeScreen)}</h1><p>{screenDescription(activeScreen)}</p></div>
        <div className="ops-intro-actions"><AgentSummary agents={runtimeAgents} onOpen={() => navigate('pipeline')} /><span className="human-loop"><ShieldCheck size={14} /> AI ĐỀ XUẤT · CON NGƯỜI QUYẾT ĐỊNH</span><button className="ops-button ops-button--ghost" onClick={() => showToast('ĐÃ LÀM MỚI ẢNH CHỤP · dữ liệu mô phỏng cố định')} type="button"><RefreshCw size={14} /> Làm mới</button></div>
      </div>
      <StageRibbon flowStage={flowStage} onRunFlow={handleStageAction} />
      {activeScreen === 'wall' && <WallBoard horizon={horizon} flowStage={flowStage} selectedZoneId={selectedZoneId} shortageLayer={shortageLayer} zones={displayZones} onHorizonChange={handleHorizonChange} onNavigate={navigate} onOpenReview={openReview} onZoneSelect={setSelectedZoneId} onToggleShortage={() => setShortageLayer((value) => !value)} />}
      {activeScreen === 'map' && <LiveMapScreen flowStage={flowStage} horizon={horizon} selectedZoneId={selectedZoneId} shortageLayer={shortageLayer} zones={displayZones} onHorizonChange={handleHorizonChange} onNavigate={navigate} onToggleShortage={() => setShortageLayer((value) => !value)} onZoneSelect={setSelectedZoneId} selectedZone={selectedZone} />}
      {activeScreen === 'pipeline' && <PipelineScreen agents={runtimeAgents} flowStage={flowStage} onGeneratePlans={() => { if (flowStage === 'DEMAND_WARNING' || flowStage === 'FORECAST') { startAnalysis(); return } if (flowStage === 'ANALYZING') return; setFlowStage('PLAN_READY'); setActiveScreen('plans'); showToast('ĐÃ SẴN SÀNG 3 PHƯƠNG ÁN ĐIỀU PHỐI') }} />}
      {activeScreen === 'plans' && <PlansScreen selectedPlanId={selectedPlanId} reviewReady={flowStage === 'PLAN_READY' || flowStage === 'PLAN_REVIEW'} onReview={openReview} onSelectPlan={selectPlan} />}
      {activeScreen === 'review' && <ReviewScreen plan={selectedPlan} actionState={planActions} canApprove={canApprove} reviewReady={flowStage === 'PLAN_REVIEW'} customQuantity={customQuantity} customTargetZone={customTargetZone} onApprove={approvePlan} onModify={() => setShowModify(true)} onReject={() => setShowReject(true)} onToggleAction={toggleAction} />}
      {activeScreen === 'execution' && <ExecutionScreen flowStage={flowStage} horizon={horizon} onIngestNewData={ingestNewData} onNavigate={navigate} onShowChanges={() => setShowChanges(true)} onShowEventLog={() => showToast('Đã hiển thị 4 sự kiện gần nhất · nhật ký mô phỏng')} onApproveUpdate={approveUpdate} />}
    </main>
    {toast && <div aria-live="polite" className="operations-toast"><CircleCheck size={16} /><div><strong>{toast}</strong><span>Đã cập nhật trạng thái mô phỏng · không gọi backend</span></div><button aria-label="Đóng thông báo" onClick={() => setToast(null)} type="button"><X size={14} /></button></div>}
    {showChanges && <PlanDiff onClose={() => setShowChanges(false)} onApprove={approveUpdate} />}
    {showModify && <ModifyPanel quantity={customQuantity} targetZone={customTargetZone} onClose={() => setShowModify(false)} onSave={(quantity, target) => { setCustomQuantity(quantity); setCustomTargetZone(target); setShowModify(false); showToast('ĐÃ SỬA PHƯƠNG ÁN · bản xem trước đã cập nhật') }} />}
    {showReject && <RejectPanel note={rejectNote} reason={rejectReason} onClose={() => setShowReject(false)} onNoteChange={setRejectNote} onReasonChange={setRejectReason} onSubmit={submitReject} />}
  </div>
}

function agentsAtStage(flowStage: FlowStage): AgentStep[] {
  const states: Record<string, AgentState> = { forecast: 'DONE', traffic: 'DONE', supply: 'WARNING', dispatch: 'DONE', optimization: 'DONE' }
  if (flowStage === 'DEMAND_WARNING') Object.assign(states, { forecast: 'WARNING', traffic: 'DONE', supply: 'WARNING', dispatch: 'PENDING', optimization: 'PENDING' })
  if (flowStage === 'FORECAST') Object.assign(states, { forecast: 'RUNNING', traffic: 'DONE', supply: 'WARNING', dispatch: 'PENDING', optimization: 'PENDING' })
  if (flowStage === 'ANALYZING') Object.assign(states, { forecast: 'DONE', traffic: 'DONE', supply: 'WARNING', dispatch: 'RUNNING', optimization: 'RUNNING' })
  if (flowStage === 'NEW_DATA') Object.assign(states, { forecast: 'RUNNING', traffic: 'RUNNING', supply: 'WARNING', dispatch: 'PENDING', optimization: 'PENDING' })
  if (flowStage === 'DISPATCHING') Object.assign(states, { forecast: 'DONE', traffic: 'DONE', supply: 'WARNING', dispatch: 'RUNNING', optimization: 'DONE' })

  return agents.map((agent) => {
    const state = states[agent.id] ?? agent.state
    const output = state === 'PENDING' ? 'Đang chờ đầu vào từ tác tử trước' : agentOutputLabels[agent.id] ?? agent.output
    const detail = state === 'RUNNING' ? 'Đang xử lý dữ liệu trong phiên mô phỏng hiện tại' : agentDetailLabels[agent.id] ?? agent.detail
    const { progress: _progress, ...agentWithoutProgress } = agent
    return state === 'RUNNING' ? { ...agentWithoutProgress, state, output, detail, progress: agentRunningProgress[agent.id] ?? 40 } : { ...agentWithoutProgress, state, output, detail }
  })
}

function summarizeAgents(runtimeAgents: AgentStep[]) {
  return runtimeAgents.reduce((summary, agent) => {
    if (agent.state === 'RUNNING') summary.running += 1
    if (agent.state === 'DONE') summary.done += 1
    if (agent.state === 'WARNING') summary.warning += 1
    if (agent.state === 'PENDING') summary.pending += 1
    return summary
  }, { running: 0, done: 0, warning: 0, pending: 0 })
}

function AgentSummary({ agents: runtimeAgents, onOpen }: { agents: AgentStep[]; onOpen: () => void }) {
  const summary = summarizeAgents(runtimeAgents)
  return <button aria-label="Mở luồng của các agent" className="agent-summary" onClick={onOpen} type="button"><span className="agent-summary__icon"><Bot size={14} /></span><span><strong>5 AGENT ĐANG THEO DÕI</strong><small>{summary.running > 0 ? `${summary.running} đang xử lý` : `${summary.done} đã hoàn tất`} · {summary.warning} cảnh báo</small></span><ChevronRight size={13} /></button>
}

function OperationsHeader({ activeScreen, agents: runtimeAgents, flowStage, mobileNavOpen, onNavigate, onToggleMobileNav }: { activeScreen: ActiveScreen; agents: AgentStep[]; flowStage: FlowStage; mobileNavOpen: boolean; onNavigate: (screen: ActiveScreen) => void; onToggleMobileNav: () => void }) {
  const summary = summarizeAgents(runtimeAgents)
  return <>
    <header className="operations-header"><div className="operations-brand"><span className="operations-brand__mark"><Zap size={17} /></span><div><strong>NOVAFOUR <em>OPS</em></strong><small>TRUNG TÂM ĐIỀU PHỐI · V2</small></div></div><nav aria-label="Điều hướng trung tâm điều phối" className="operations-nav">{navItems.map((item) => <button className={activeScreen === item.id ? 'is-active' : ''} key={item.id} onClick={() => onNavigate(item.id)} type="button"><span>{item.label}</span><small>{item.shortLabel}</small></button>)}</nav><div className="operations-header__tools"><div className="ops-search"><Search size={14} /><span>Tìm khu vực, phương án, xe</span><kbd><Command size={10} /> K</kbd></div><button aria-label="Thông báo" className="icon-button" onClick={() => undefined} type="button"><Bell size={16} /><i /></button><button aria-label="Cài đặt" className="icon-button" onClick={() => undefined} type="button"><Settings2 size={16} /></button><div className="operator-avatar">LT</div></div><div className="operations-status"><span className="operations-status__line"><span className="status-dot" /> <strong>MÔ PHỎNG TRỰC TIẾP</strong></span><small>{stageLabels[flowStage]}</small><button className="operations-status__agent" onClick={() => onNavigate('pipeline')} type="button"><Bot size={12} /> {summary.running > 0 ? `${summary.running} agent đang chạy` : `${summary.done} agent đã hoàn tất`}<span className="operations-status__warning">{summary.warning} cảnh báo</span></button></div><button aria-expanded={mobileNavOpen} aria-label={mobileNavOpen ? 'Đóng menu' : 'Mở menu'} className="mobile-menu-button" onClick={onToggleMobileNav} type="button"><Menu size={18} /></button></header>
    <nav aria-hidden={!mobileNavOpen} aria-label="Điều hướng mobile" className={`mobile-nav-panel ${mobileNavOpen ? 'is-open' : ''}`}>{navItems.map((item) => <button className={activeScreen === item.id ? 'is-active' : ''} key={item.id} onClick={() => onNavigate(item.id)} type="button"><span>{item.label}</span><small>{item.shortLabel}</small></button>)}</nav>
  </>
}

function StageRibbon({ flowStage, onRunFlow }: { flowStage: FlowStage; onRunFlow: () => void }) {
  const stages: Array<{ id: FlowStage; label: string }> = [
    { id: 'DEMAND_WARNING', label: 'Phát hiện' }, { id: 'FORECAST', label: 'Dự báo' }, { id: 'ANALYZING', label: 'Phân tích' }, { id: 'PLAN_READY', label: 'Đề xuất' }, { id: 'PLAN_REVIEW', label: 'Phê duyệt' }, { id: 'EXECUTING', label: 'Thực thi' },
  ]
  const currentIndex = stages.findIndex((stage) => stage.id === flowStage)
  const progressIndex = flowStage === 'DISPATCHING' ? 5 : flowStage === 'NEW_DATA' || flowStage === 'REPLAN_READY' || flowStage === 'UPDATE_APPROVED' ? 5 : Math.max(0, currentIndex)
  const isAnalyzing = flowStage === 'ANALYZING'
  const actionLabel = isAnalyzing ? 'Agent đang phân tích…' : flowStage === 'PLAN_READY' ? 'Mở phương án' : flowStage === 'PLAN_REVIEW' ? 'Mở cổng duyệt' : ['DISPATCHING', 'EXECUTING', 'NEW_DATA', 'REPLAN_READY', 'UPDATE_APPROVED'].includes(flowStage) ? 'Mở điều phối' : 'Chạy luồng mô phỏng'
  return <section className="stage-ribbon"><div className="stage-ribbon__copy"><span className="section-eyebrow">LUỒNG TRỰC TIẾP · 5 TÁC TỬ AI</span><strong>{stageLabels[flowStage]}</strong><small>Agent đề xuất · người vận hành luôn giữ quyền phê duyệt</small></div><div className="stage-ribbon__steps">{stages.map((stage, index) => <div className={`workflow-step ${index < progressIndex ? 'is-done' : ''} ${index === progressIndex ? 'is-current' : ''}`} key={stage.id}><span>{index < progressIndex ? <Check size={12} /> : index + 1}</span><small>{stage.label}</small></div>)}</div><button className="ops-button ops-button--accent" disabled={isAnalyzing} onClick={onRunFlow} type="button"><Play size={13} /> {actionLabel}</button></section>
}

function WallBoard({ horizon, flowStage, selectedZoneId, shortageLayer, zones, onHorizonChange, onNavigate, onOpenReview, onToggleShortage, onZoneSelect }: { horizon: ForecastHorizon; flowStage: FlowStage; selectedZoneId: string; shortageLayer: boolean; zones: typeof operationsZones; onHorizonChange: (value: ForecastHorizon) => void; onNavigate: (screen: ActiveScreen) => void; onOpenReview: () => void; onToggleShortage: () => void; onZoneSelect: (id: string) => void }) {
  const atExecution = flowStage === 'EXECUTING' || flowStage === 'DISPATCHING'
  const network = operationsNetworkAtHorizon(horizon)
  const demandChart = operationsDemandTrendAtHorizon(horizon)
  const etaChart = operationsEtaTrendAtHorizon(horizon)
  const balanceChart = operationsZoneBalanceAtHorizon(horizon)
  return <div className="wall-board">
    <aside className="wall-board__left"><ChartPanel eyebrow="NHU CẦU / 24 GIỜ" title={horizon > 0 ? 'Nhu cầu dự báo' : 'Nhu cầu hiện tại'} meta="cuốc / giờ" accent="#4bcbbb"><OperationsLineChart data={demandChart} color="#4bcbbb" unit="" /></ChartPanel><ChartPanel eyebrow="ETA TRUNG BÌNH / 24 GIỜ" title="ETA trung bình" meta="phút" accent="#7fa9f5"><OperationsLineChart data={etaChart} color="#7fa9f5" unit=" phút" /></ChartPanel><ChartPanel eyebrow="NGUỒN XE / NHU CẦU" title="Rủi ro theo khu vực" meta="xe" accent="#ed9a65"><ZoneBalanceChart data={balanceChart} /></ChartPanel></aside>
    <section className="wall-board__center"><div className="map-panel map-panel--wall"><div className="map-panel__head"><div><span className="section-eyebrow">S0 · BẢNG TỔNG QUAN / TOÀN CẢNH THÀNH PHỐ</span><h2>Bản đồ điều phối trực tiếp</h2></div><div className="map-panel__actions"><span className="map-signal"><i /> {network.supply.toLocaleString('vi-VN')} xe đang trực tuyến</span><button className="ops-button ops-button--ghost" onClick={() => onNavigate('map')} type="button"><Eye size={14} /> Mở bản đồ chi tiết</button></div></div><OperationsMap compact flowStage={flowStage} horizon={horizon} onZoneSelect={onZoneSelect} selectedZoneId={selectedZoneId} showShortage={shortageLayer} zones={zones} /><ForecastTimeline horizon={horizon} onChange={onHorizonChange} /><div className="map-bottom-note"><span><AlertTriangle size={13} /> Khu vực D đang có rủi ro thiếu xe cao nhất</span><button onClick={onOpenReview} type="button">Mở phương án xử lý <ChevronRight size={13} /></button></div></div></section>
    <aside className="wall-board__right"><section className="wall-panel wall-panel--gauges"><SectionHeading eyebrow="SỨC KHỎE MẠNG LƯỚI" title="Tổng quan nhanh" action={<span className="live-caption"><i /> TRỰC TIẾP</span>} /><div className="gauge-row"><DonutMetric label="Độ phủ nguồn xe" tone="teal" value={78} /><DonutMetric label="Độ ổn định" tone="blue" value={84} /><DonutMetric label="Độ tin cậy AI" tone="amber" value={94} /></div></section><section className="wall-panel wall-panel--kpi"><SectionHeading eyebrow="NHỊP MẠNG LƯỚI" title="Chỉ số chính" /><div className="kpi-hero"><MetricValue emphasis label={horizon > 0 ? 'Nhu cầu dự báo' : 'Cuốc đang hoạt động'} note="toàn mạng lưới Hà Nội" value={network.demand.toLocaleString('vi-VN')} /><MetricValue label="Tổng nguồn xe" value={network.supply.toLocaleString('vi-VN')} delta={4.8} /><MetricValue label="ETA trung bình" value={`${network.eta.toLocaleString('vi-VN')} phút`} delta={-8.4} /></div></section><section className="wall-panel wall-panel--risk"><SectionHeading eyebrow="XẾP HẠNG RỦI RO" title="Danh sách cần theo dõi" action={<button aria-label="Mở bản đồ trực tiếp" className="text-button" onClick={() => onNavigate('map')} type="button">Xem tất cả <ChevronRight size={13} /></button>} /><ZoneRiskTable zones={zones} selectedZoneId={selectedZoneId} onSelect={onZoneSelect} /></section><div className="wall-panel__footer"><span><Layers3 size={13} /> {shortageLayer ? 'Đang hiển thị lớp thiếu xe' : 'Đã ẩn lớp thiếu xe'}</span><button className={`switch ${shortageLayer ? 'is-on' : ''}`} onClick={onToggleShortage} role="switch" aria-checked={shortageLayer} type="button"><i /></button></div></aside>
    {atExecution && <div className="execution-edge-label"><Activity size={13} /> ADAPTIVE ROUTING ACTIVE</div>}
  </div>
}

function LiveMapScreen({ flowStage, horizon, selectedZoneId, shortageLayer, zones, onHorizonChange, onNavigate, onToggleShortage, onZoneSelect, selectedZone }: { flowStage: FlowStage; horizon: ForecastHorizon; selectedZoneId: string; shortageLayer: boolean; zones: typeof operationsZones; onHorizonChange: (value: ForecastHorizon) => void; onNavigate: (screen: ActiveScreen) => void; onToggleShortage: () => void; onZoneSelect: (id: string) => void; selectedZone: typeof operationsZones[number] }) {
  const network = operationsNetworkAtHorizon(horizon)
  const etaTrend = operationsEtaTrendAtHorizon(horizon)
  return <div className="live-map-screen"><section className="map-panel map-panel--large"><div className="map-panel__head"><div><span className="section-eyebrow">S1 · GÓC NHÌN ĐIỀU PHỐI</span><h2>Bản đồ điều phối trực tiếp</h2></div><div className="map-panel__actions"><span className="forecast-context"><span className={horizon > 0 ? 'is-forecast' : ''}>{horizon > 0 ? `DỰ BÁO +${horizon} PHÚT` : 'TRỰC TIẾP HIỆN TẠI'}</span></span><button className="ops-button ops-button--ghost" onClick={() => onNavigate('pipeline')} type="button"><Bot size={14} /> Mở luồng AI</button></div></div><OperationsMap flowStage={flowStage} horizon={horizon} onZoneSelect={onZoneSelect} selectedZoneId={selectedZoneId} showShortage={shortageLayer} zones={zones} /><ForecastTimeline horizon={horizon} onChange={onHorizonChange} /></section><aside className="monitor-panel"><div className="monitor-panel__head"><div><span className="section-eyebrow">AI GIÁM SÁT</span><h2><i className="ai-pulse" /> Tín hiệu vận hành</h2></div><span className="monitor-live">TỰ LÀM MỚI · 15 GIÂY</span></div><div className="weather-card"><div className="weather-card__icon"><CloudRain size={19} /></div><div><strong>Mưa đang tiến vào</strong><span>Hành lang phía tây · mức vừa</span></div><b>+15%<small>thời gian di chuyển</small></b></div><div className="monitor-metrics"><MetricValue label="Tổng nguồn xe" value={network.supply.toLocaleString('vi-VN')} note="+4,8% so với nền" /><MetricValue label={horizon > 0 ? 'Nhu cầu dự báo' : 'Nhu cầu hiện tại'} value={network.demand.toLocaleString('vi-VN')} note={horizon > 0 ? `tại mốc +${horizon} phút` : 'mạng lưới trực tiếp'} /><MetricValue label="ETA trung bình" value={`${network.eta.toLocaleString('vi-VN')} phút`} note="trên các cuốc đang chạy" /></div><div className="monitor-chart"><SectionHeading eyebrow="XU HƯỚNG / ETA" title="ETA trung bình" /><div className="monitor-chart__canvas"><OperationsLineChart data={etaTrend} color="#7fa9f5" unit=" phút" /></div></div><div className="monitor-toggle"><div><span><AlertTriangle size={14} /> Rủi ro thiếu xe</span><small>Hiển thị lớp dự báo thiếu xe</small></div><button className={`switch ${shortageLayer ? 'is-on' : ''}`} onClick={onToggleShortage} role="switch" aria-checked={shortageLayer} type="button"><i /></button></div><div className="monitor-zone-list"><SectionHeading eyebrow="RỦI RO KHU VỰC / CAO → THẤP" title="Khu vực ưu tiên" /><ZoneRiskTable zones={zones} onSelect={onZoneSelect} selectedZoneId={selectedZoneId} compact /></div><div className="selected-zone-card"><div className="selected-zone-card__title"><StatusPill status={selectedZone.status} /><span>Khu vực đang xem</span></div><strong>{selectedZone.name}</strong><div className="selected-zone-card__metrics"><span><b>{selectedZone.demand}</b> nhu cầu</span><span><b>{selectedZone.supply}</b> nguồn xe</span><span><b>{selectedZone.eta}</b> phút ETA</span></div></div></aside></div>
}

function ForecastTimeline({ horizon, onChange }: { horizon: ForecastHorizon; onChange: (value: ForecastHorizon) => void }) {
  return <div className="forecast-timeline"><div><span className="section-eyebrow">DÒNG THỜI GIAN DỰ BÁO</span><strong>{horizon > 0 ? `Đang xem nhu cầu dự báo · +${horizon} phút` : 'Đang xem nhu cầu hiện tại'}</strong></div><div className="timeline-steps">{FORECAST_HORIZONS.map((item) => <button className={horizon === item.minutes ? 'is-active' : ''} key={item.minutes} onClick={() => onChange(item.minutes)} type="button"><span>{item.minutes === 0 ? <CircleCheck size={13} /> : `+${item.minutes}`}</span><small>{item.label === 'NOW' ? 'HIỆN TẠI' : 'PHÚT'}</small></button>)}</div></div>
}

function PipelineScreen({ agents: runtimeAgents, flowStage, onGeneratePlans }: { agents: AgentStep[]; flowStage: FlowStage; onGeneratePlans: () => void }) {
  const summary = summarizeAgents(runtimeAgents)
  const runLabel = flowStage === 'ANALYZING' || summary.running > 0 ? 'ĐANG PHỐI HỢP' : flowStage === 'DEMAND_WARNING' ? 'CHỜ KÍCH HOẠT' : 'ĐÃ PHÂN TÍCH XONG'
  const dispatchAgent = runtimeAgents.find((agent) => agent.id === 'dispatch')
  const canShowDispatchActions = dispatchAgent?.state !== 'PENDING'
  const actionLabel = flowStage === 'DEMAND_WARNING' || flowStage === 'FORECAST' ? 'Kích hoạt phân tích agent' : 'Tạo phương án điều phối'
  return <div className="pipeline-screen"><section className="pipeline-main"><div className="screen-section-head"><div><span className="section-eyebrow">S2 · SUY LUẬN MINH BẠCH</span><h2>Luồng xử lý tự động</h2><p>Mọi kết quả của tác tử đều hiển thị trước khi phương án được duyệt.</p></div><span className="pipeline-status"><i /> {runLabel}</span></div><div className="agent-run-summary"><span className="agent-run-summary__icon"><Bot size={17} /></span><div><span className="section-eyebrow">AGENT RUN · RUN-2026-0822-1842</span><strong>{summary.done}/5 hoàn tất · {summary.running} đang chạy · {summary.warning} cảnh báo</strong><small>5 tác tử phối hợp trên cùng một phiên dữ liệu; chưa agent nào được phép tự điều phối.</small></div><span className="agent-run-summary__mode">HUMAN-IN-THE-LOOP</span></div><div className="agent-pipeline">{runtimeAgents.map((agent, index) => <div className={`agent-row agent-row--${agent.state.toLowerCase()}`} key={agent.id}><div className="agent-row__line"><div className="agent-number">0{index + 1}</div><AgentStateIcon state={agent.state} /></div><div className="agent-row__body"><div className="agent-row__head"><div className="agent-row__identity"><span className="agent-row__badge"><Bot size={10} /> AGENT 0{index + 1}</span><strong>{agentNameLabels[agent.id] ?? agent.name}</strong></div><span>{agentStateLabels[agent.state]}</span></div><p>{agent.output}</p><small>{agent.detail}</small>{agent.id === 'dispatch' && canShowDispatchActions && <div className="dispatch-actions"><label><input defaultChecked type="checkbox" /><span>Điều chuyển <b>32 xe</b> đến khu vực D</span></label><label><input defaultChecked type="checkbox" /><span>Điều chuyển <b>18 xe</b> đến khu vực C</span></label><label><input type="checkbox" /><span>Điều chuyển <b>8 xe</b> đến khu vực D</span></label></div>}{agent.progress !== undefined && <div className="agent-progress"><i style={{ width: `${agent.progress}%` }} /><span>{agent.progress}%</span></div>}</div></div>)}</div><div className="pipeline-footer"><div><ShieldCheck size={17} /><span><strong>Cổng phê duyệt của người vận hành</strong><small>AI không thể bắt đầu điều phối nếu chưa có quyết định của người vận hành.</small></span></div><button className="ops-button ops-button--accent" onClick={onGeneratePlans} type="button"><Sparkles size={14} /> {actionLabel}</button></div></section><aside className="pipeline-side"><div className="side-callout"><span className="side-callout__icon"><CircleAlert size={17} /></span><span className="section-eyebrow">TÍN HIỆU CHÍNH</span><h3>Thiếu xe tại khu vực D</h3><p>Nhu cầu đang tăng nhanh hơn khả năng bổ sung xe từ các khu vực lân cận.</p><div className="signal-number"><strong>258</strong><span>xe thiếu dự kiến<br />sau +20 phút</span></div></div><div className="pipeline-trace"><span className="section-eyebrow">MÃ LẦN CHẠY</span><code>RUN-2026-0822-1842</code><span className="trace-divider" /><span className="section-eyebrow">KHUNG MÔ HÌNH</span><strong>HIỆN TẠI → +30 PHÚT</strong><span className="trace-divider" /><span className="section-eyebrow">NGUỒN DỮ LIỆU</span><strong>PHÁT LẠI MÔ PHỎNG · CỐ ĐỊNH</strong></div></aside></div>
}

function PlansScreen({ selectedPlanId, reviewReady, onReview, onSelectPlan }: { selectedPlanId: string; reviewReady: boolean; onReview: () => void; onSelectPlan: (plan: DispatchPlan) => void }) {
  const selected = dispatchPlans.find((plan) => plan.id === selectedPlanId) ?? dispatchPlans[1]!
  return <div className="plans-screen"><div className="screen-section-head"><div><span className="section-eyebrow">S3 · BỘ TẠO CHIẾN LƯỢC</span><h2>So sánh các phương án xử lý</h2><p>Ba phương án được đánh giá trên cùng một bộ tiêu chí. Dữ liệu được mô phỏng để dễ kiểm tra.</p></div><div className="plan-criteria"><span><SlidersHorizontal size={13} /> Bộ tiêu chí chung</span><small>Xe · ETA · Chi phí · Quãng đường · Độ phủ</small></div></div><div className="plans-grid">{dispatchPlans.map((plan) => <PlanCard key={plan.id} onSelect={() => onSelectPlan(plan)} plan={plan} selected={plan.id === selectedPlanId} />)}</div><div className="plan-comparison"><div className="plan-comparison__copy"><span className="section-eyebrow">PHƯƠNG ÁN ĐANG CHỌN</span><h3>{selected.label} · {selected.isRecommended ? 'Phương án được khuyến nghị' : 'Lựa chọn của người vận hành'}</h3><p>Điều chuyển <strong>{selected.vehicles} xe</strong> và cải thiện ETA dự kiến <strong>{selected.etaImprovement} phút</strong>.</p></div><div className="plan-comparison__bars"><ComparisonBar label="Độ phủ" value={selected.coverage} max={100} display={`${selected.coverage}%`} /><ComparisonBar label="Giảm rủi ro" value={selected.serviceRiskReduction} max={40} display={`${selected.serviceRiskReduction}%`} /><ComparisonBar label="Quãng đường điều chuyển" value={selected.relocationDistance} max={40} display={`${selected.relocationDistance} km`} inverse /></div><button className="ops-button ops-button--accent" disabled={!reviewReady} onClick={onReview} type="button">{reviewReady ? `Duyệt ${selected.label}` : 'Chờ agent hoàn tất'} <ArrowRight size={14} /></button></div></div>
}

function ComparisonBar({ label, value, max, display, inverse = false }: { label: string; value: number; max: number; display: string; inverse?: boolean }) {
  return <div className="comparison-bar"><div><span>{label}</span><b>{display}</b></div><i><em className={inverse ? 'is-inverse' : ''} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></i></div>
}

function ReviewScreen({ plan, actionState, canApprove, reviewReady, customQuantity, customTargetZone, onApprove, onModify, onReject, onToggleAction }: { plan: DispatchPlan; actionState: Record<string, boolean>; canApprove: boolean; reviewReady: boolean; customQuantity: number; customTargetZone: string; onApprove: () => void; onModify: () => void; onReject: () => void; onToggleAction: (actionId: string) => void }) {
  if (!reviewReady) return <div className="execution-empty-screen"><section className="execution-empty-state"><div className="execution-empty-state__icon"><Bot size={24} /></div><span className="section-eyebrow">S4 · CỔNG PHÊ DUYỆT CON NGƯỜI</span><h2>Chưa có phương án để duyệt</h2><p>Các agent cần hoàn tất phân tích và tạo phương án trước khi bạn có thể phê duyệt điều phối.</p><div className="execution-empty-state__steps"><span><b>1</b> Chạy luồng agent</span><span><b>2</b> So sánh phương án</span><span><b>3</b> Kiểm tra và duyệt</span></div></section></div>
  return <div className="review-screen"><section className="review-main"><div className="screen-section-head"><div><span className="section-eyebrow">S4 · CỔNG PHÊ DUYỆT CON NGƯỜI</span><h2>Duyệt phương án điều phối</h2><p>Kiểm tra đề xuất và các hành động đã chọn trước khi bắt đầu thực thi.</p></div><span className="approval-required"><ShieldCheck size={14} /> CẦN QUYẾT ĐỊNH CỦA BẠN</span></div><div className="review-summary"><div className="review-summary__plan"><span className="recommended-badge"><Check size={11} /> KHUYẾN NGHỊ</span><strong>{plan.label}</strong><span>phiên bản {plan.version} · AI tin cậy {plan.aiConfidence}%</span></div><div className="review-summary__metrics"><MetricValue label="Cải thiện ETA dự kiến" value={`-${plan.etaImprovement} phút`} emphasis /><MetricValue label="Giảm rủi ro dịch vụ" value={`${plan.serviceRiskReduction}%`} /><MetricValue label="Độ phủ dự kiến" value={`${plan.coverage}%`} /></div></div><div className="review-grid"><div className="review-reasons"><SectionHeading eyebrow="VÌ SAO CHỌN PHƯƠNG ÁN NÀY" title="Cơ sở đề xuất" />{plan.reasons.map((reason) => <div className="reason-row" key={reason.id}><span className={`reason-icon reason-icon--${reason.severity.toLowerCase()}`}><AlertTriangle size={13} /></span><div><strong>{reason.id === 'demand-spike' ? 'Nhu cầu tăng đột biến' : reason.id === 'rain' ? 'Mưa đang tiến vào' : 'Nguồn xe lân cận chưa đủ'}</strong><p>{reason.id === 'demand-spike' ? 'Nhu cầu tại khu vực D cao gấp 3,2 lần nền 30 phút gần nhất.' : reason.id === 'rain' ? 'Mô hình thời tiết dự báo thời gian di chuyển tăng 15%.' : 'Các khu vực liền kề không thể tự bù phần thiếu hụt dự kiến.'}</p></div><span className={`severity-label severity-label--${reason.severity.toLowerCase()}`}>{statusSeverityLabels[reason.severity]}</span></div>)}</div><div className="review-actions"><SectionHeading eyebrow="HÀNH ĐỘNG ĐIỀU PHỐI" title="Sẽ thực hiện gì" action={<span className="action-count">{Object.values(actionState).filter(Boolean).length} đã chọn</span>} />{plan.actions.map((action) => <label className={`action-row ${actionState[action.id] ? 'is-selected' : ''}`} key={action.id}><input checked={Boolean(actionState[action.id])} onChange={() => onToggleAction(action.id)} type="checkbox" /><span className="action-check"><Check size={13} /></span><span className="action-copy"><strong>Điều chuyển {action.quantity} xe</strong><small>{zoneById[action.sourceZoneId]?.name} <ArrowRight size={11} /> {zoneById[action.targetZoneId]?.name}</small></span><b>{action.etaImpact.replace(' min', ' phút')}</b></label>)}<div className="review-edit-note"><GitCompareArrows size={14} /><span>{customQuantity} xe đang xem trước đến {zoneById[customTargetZone]?.name ?? 'khu vực đích'}{customQuantity !== plan.actions[0]?.quantity || customTargetZone !== plan.actions[0]?.targetZoneId ? ' · đã chỉnh sửa' : ''}</span></div></div></div><div className="review-actions-bar"><button className="ops-button ops-button--danger" onClick={onReject} type="button"><CircleAlert size={14} /> Từ chối</button><button className="ops-button ops-button--ghost" onClick={onModify} type="button"><SlidersHorizontal size={14} /> Chỉnh sửa</button><button className="ops-button ops-button--accent ops-button--approve" disabled={!canApprove} onClick={onApprove} type="button"><Check size={15} /> Duyệt và điều phối</button></div>{!canApprove && <p className="button-hint"><CircleAlert size={13} /> Chọn ít nhất một hành động để bật nút phê duyệt.</p>}</section><aside className="review-side"><div className="mini-map-card"><div className="mini-map-card__head"><span className="section-eyebrow">XEM TRƯỚC TUYẾN ĐIỀU PHỐI</span><span><i /> {plan.vehicles} xe</span></div><OperationsMap compact flowStage="PLAN_REVIEW" horizon={20} onZoneSelect={() => undefined} selectedZoneId="zone-d" zones={operationsZones} /></div><div className="review-policy"><ShieldCheck size={16} /><div><strong>Quyết định có thể kiểm tra</strong><span>Lưu người duyệt, thời gian, hành động đã chọn và phiên bản phương án.</span></div></div></aside></div>
}

function ExecutionScreen({ flowStage, horizon, onIngestNewData, onNavigate, onShowChanges, onShowEventLog, onApproveUpdate }: { flowStage: FlowStage; horizon: ForecastHorizon; onIngestNewData: () => void; onNavigate: (screen: ActiveScreen) => void; onShowChanges: () => void; onShowEventLog: () => void; onApproveUpdate: () => void }) {
  const hasActiveDispatch = ['DISPATCHING', 'EXECUTING', 'NEW_DATA', 'REPLAN_READY', 'UPDATE_APPROVED'].includes(flowStage)
  if (!hasActiveDispatch) return <div className="execution-empty-screen"><section className="execution-empty-state"><div className="execution-empty-state__icon"><ShieldCheck size={24} /></div><span className="section-eyebrow">S5 · GIÁM SÁT THỰC THI</span><h2>Chưa có phiên điều phối đang chạy</h2><p>Phương án chỉ bắt đầu chạy sau khi người vận hành chọn hành động và bấm “Duyệt và điều phối”.</p><div className="execution-empty-state__steps"><span><b>1</b> Phân tích dữ liệu</span><span><b>2</b> Chọn phương án</span><span><b>3</b> Phê duyệt</span></div><button className="ops-button ops-button--accent" onClick={() => onNavigate('plans')} type="button"><ArrowRight size={14} /> Mở phương án điều phối</button></section></div>
  const replanning = flowStage === 'NEW_DATA'
  const replanReady = flowStage === 'REPLAN_READY'
  const approved = flowStage === 'UPDATE_APPROVED'
  return <div className="execution-screen"><section className="execution-map-panel"><div className="map-panel__head"><div><span className="section-eyebrow">S5 · GIÁM SÁT THỰC THI</span><h2>{approved ? 'Phương án V2 đang hoạt động' : 'Định tuyến thích ứng đang chạy'}</h2></div><div className="execution-state"><span className={`execution-state__dot ${replanReady ? 'is-attention' : ''}`} />{approved ? 'PHƯƠNG ÁN V2 ĐANG CHẠY' : replanReady ? 'SẴN SÀNG CẬP NHẬT' : 'ĐANG ĐIỀU PHỐI'}</div></div><OperationsMap flowStage={flowStage} horizon={horizon || 20} onZoneSelect={() => undefined} selectedZoneId="zone-d" zones={operationsZones} /><div className="execution-progress"><div><span>PHƯƠNG ÁN B · PHIÊN BẢN 1</span><strong>{approved ? '100%' : replanReady ? '76%' : '54%'}</strong></div><i><em style={{ width: approved ? '100%' : replanReady ? '76%' : '54%' }} /></i><small>{approved ? 'Đã áp dụng cập nhật sau khi người vận hành phê duyệt' : '32 trên 58 xe đã tới hành lang mục tiêu'}</small></div></section><aside className="execution-side"><div className="execution-side__head"><span className="section-eyebrow">TRẠNG THÁI ĐIỀU PHỐI</span><span className="live-caption"><i /> TRỰC TIẾP</span></div><div className="execution-stat-grid"><MetricValue emphasis label="Xe đang di chuyển" value={approved ? '64' : '32 / 58'} /><MetricValue label="ETA hiện tại" value={approved ? '6,2 phút' : '7,1 phút'} note="-2,7 phút so với đầu kỳ" /><MetricValue label="Khu vực đích" value="Khu vực D" note="Hai Bà Trưng" /><MetricValue label="Trạng thái tuyến" value="Đúng tiến độ" note="RV-204" /></div>{replanning && <div className="replan-card replan-card--running"><div className="replan-card__head"><RefreshCw size={15} /><strong>Đã nhận dữ liệu mới</strong><span>HIỆN TẠI</span></div><p>Tín hiệu nhu cầu và thời tiết mới đã kích hoạt dự báo lại. Phương án hiện tại vẫn đang chạy.</p><ReplanProgress current="CẬP NHẬT DỰ BÁO" /></div>}{replanReady && <UpdatedRecommendation onShowChanges={onShowChanges} onApprove={onApproveUpdate} />}{approved && <div className="approved-update"><CircleCheck size={18} /><strong>PHƯƠNG ÁN V2 ĐANG CHẠY</strong><span>Cập nhật đã được người vận hành duyệt và trở thành phương án điều phối hiện tại.</span></div>}<div className="execution-log"><SectionHeading eyebrow="NHẬT KÝ SỰ KIỆN" title="Sự kiện mới nhất" action={<button className="text-button" onClick={onShowEventLog} type="button">Xem tất cả <ChevronRight size={13} /></button>} />{executionEvents.map((event, eventIndex) => <div className="execution-event" key={`${event.time}-${event.event}`}><time>{event.time}</time><span className={`event-marker event-marker--${event.status.toLowerCase().replace(' ', '-')}`} /><div><strong>{executionEventLabels[eventIndex]?.[0] ?? event.event}</strong><small>{executionEventLabels[eventIndex]?.[1] ?? `${event.zone} · ${event.detail}`}</small></div></div>)}</div><div className="execution-side__footer">{!replanReady && !approved && <button className="ops-button ops-button--accent" onClick={onIngestNewData} type="button"><Zap size={14} /> Mô phỏng dữ liệu mới</button>}{replanReady && <button className="ops-button ops-button--ghost" onClick={() => onNavigate('map')} type="button"><Map size={14} /> Quay lại bản đồ trực tiếp</button>}</div></aside></div>
}

function UpdatedRecommendation({ onShowChanges, onApprove }: { onShowChanges: () => void; onApprove: () => void }) {
  return <div className="updated-recommendation"><div className="updated-recommendation__head"><span className="section-eyebrow">S6 · ĐỀ XUẤT CẬP NHẬT</span><span className="recommended-badge"><Sparkles size={11} /> PHƯƠNG ÁN V2</span></div><h3>Cập nhật phương án đang chạy?</h3><p>Rủi ro dịch vụ dự kiến <strong className="risk-reduction"><ArrowDownRight size={14} /> giảm {updatedPlan.serviceRiskReduction}%</strong> so với phương án hiện tại.</p><div className="updated-recommendation__reasoning"><strong>Cơ sở cập nhật</strong><ul><li>Phát hiện ảnh hưởng mưa ở hành lang phía tây.</li><li>Dự báo nhu cầu tại khu vực D tăng.</li><li>Nguồn xe lân cận không đủ bù thiếu hụt.</li></ul></div><div className="updated-recommendation__metrics"><span><b>{updatedPlan.vehicles}</b> xe</span><span><b>{updatedPlan.etaImprovement} phút</b> cải thiện ETA</span><span><b>{updatedPlan.coverage}%</b> độ phủ</span></div><div className="updated-recommendation__actions"><button className="ops-button ops-button--ghost" onClick={onShowChanges} type="button"><GitCompareArrows size={14} /> Xem thay đổi</button><button className="ops-button ops-button--accent" onClick={onApprove} type="button"><Check size={14} /> Duyệt cập nhật</button></div></div>
}

function ReplanProgress({ current }: { current: string }) {
  return <div className="replan-progress"><div><span>DỮ LIỆU MỚI</span><b>100%</b></div><i><em style={{ width: '100%' }} /></i><div><span>{current}</span><b>62%</b></div><i><em style={{ width: '62%' }} /></i><div><span>ĐIỀU PHỐI</span><b>0%</b></div><i><em style={{ width: '0%' }} /></i></div>
}

function ChartPanel({ eyebrow, title, meta, accent, children }: { eyebrow: string; title: string; meta: string; accent: string; children: ReactNode }) {
  return <section className="chart-panel"><div className="chart-panel__head"><div><span className="section-eyebrow">{eyebrow}</span><strong>{title}</strong></div><span style={{ color: accent }}>{meta}</span></div><div className="chart-panel__canvas">{children}</div></section>
}

function ZoneRiskTable({ zones = operationsZones, selectedZoneId, onSelect, compact = false }: { zones?: typeof operationsZones; selectedZoneId: string; onSelect: (id: string) => void; compact?: boolean }) {
  const sortedZones = zones.slice().sort((a, b) => b.risk - a.risk)
  return <div className={`zone-risk-table ${compact ? 'zone-risk-table--compact' : ''}`}><div className="zone-risk-table__head"><span>KHU VỰC</span><span>TRẠNG THÁI</span><span>NHU CẦU</span><span>ETA</span><span>RỦI RO</span></div>{sortedZones.slice(0, compact ? 5 : 6).map((zone) => <button className={selectedZoneId === zone.id ? 'is-selected' : ''} key={zone.id} onClick={() => onSelect(zone.id)} type="button"><span className="zone-name"><i className={`zone-risk-dot zone-risk-dot--${zone.status.toLowerCase()}`} />{zone.name}</span><StatusPill status={zone.status} /><span>{zone.demand}</span><span>{zone.eta} phút</span><strong>{zone.risk}%</strong></button>)}</div>
}

function PlanDiff({ onClose, onApprove }: { onClose: () => void; onApprove: () => void }) {
  return <div className="overlay"><section aria-labelledby="diff-title" className="dialog-panel"><div className="dialog-panel__head"><div><span className="section-eyebrow">SỬA ĐỔI PHƯƠNG ÁN · SO SÁNH</span><h2 id="diff-title">Phương án V2 đã thay đổi gì?</h2></div><button aria-label="Đóng" className="icon-button" onClick={onClose} type="button"><X size={16} /></button></div><p className="dialog-intro">Phương án hiện tại vẫn chạy cho đến khi bạn chủ động duyệt bản cập nhật.</p><div className="diff-table"><div className="diff-table__head"><span>CHỈ SỐ</span><span>PHƯƠNG ÁN HIỆN TẠI</span><span>PHƯƠNG ÁN V2</span><span>THAY ĐỔI</span></div>{[['Số xe', '58', '64', '+6'], ['Cải thiện ETA', '-4,1 phút', '-4,6 phút', '+0,5 phút'], ['Khu vực đích', 'Khu vực D', 'Khu vực D + C', 'mở rộng'], ['Rủi ro dịch vụ', '42%', '31%', '-11%']].map((row) => <div className="diff-table__row" key={row[0]}><strong>{row[0]}</strong><span>{row[1]}</span><b>{row[2]}</b><em>{row[3]}</em></div>)}</div><div className="dialog-policy"><ShieldCheck size={16} /><span>Cổng phê duyệt thứ hai · không tự động áp dụng</span></div><div className="dialog-actions"><button className="ops-button ops-button--ghost" onClick={onClose} type="button">Giữ phương án hiện tại</button><button className="ops-button ops-button--accent" onClick={onApprove} type="button"><Check size={14} /> Duyệt cập nhật</button></div></section></div>
}

function ModifyPanel({ quantity, targetZone, onClose, onSave }: { quantity: number; targetZone: string; onClose: () => void; onSave: (quantity: number, target: string) => void }) {
  const [nextQuantity, setNextQuantity] = useState(quantity)
  const [nextTarget, setNextTarget] = useState(targetZone)
  return <div className="overlay"><section aria-labelledby="modify-title" className="dialog-panel dialog-panel--small"><div className="dialog-panel__head"><div><span className="section-eyebrow">CHỈNH SỬA · CHỈ XEM TRƯỚC</span><h2 id="modify-title">Điều chỉnh hành động điều phối</h2></div><button aria-label="Đóng" className="icon-button" onClick={onClose} type="button"><X size={16} /></button></div><p className="dialog-intro">Bản mô phỏng chỉ cập nhật phần xem trước, không chạy lại mô hình tối ưu.</p><label className="form-field"><span>Số lượng xe</span><input min="1" onChange={(event) => setNextQuantity(Number(event.target.value))} type="number" value={nextQuantity} /></label><label className="form-field"><span>Khu vực đích</span><select onChange={(event) => setNextTarget(event.target.value)} value={nextTarget}>{operationsZones.filter((zone) => zone.status !== 'BALANCED').map((zone) => <option key={zone.id} value={zone.id}>{zone.name} · {zoneStatusLabels[zone.status]}</option>)}</select></label><div className="dialog-actions"><button className="ops-button ops-button--ghost" onClick={onClose} type="button">Hủy</button><button className="ops-button ops-button--accent" onClick={() => onSave(nextQuantity, nextTarget)} type="button"><Check size={14} /> Lưu xem trước</button></div></section></div>
}

function RejectPanel({ note, reason, onClose, onNoteChange, onReasonChange, onSubmit }: { note: string; reason: RejectReason; onClose: () => void; onNoteChange: (value: string) => void; onReasonChange: (value: RejectReason) => void; onSubmit: () => void }) {
  const reasons: RejectReason[] = ['Cost too high', 'Too many vehicles moved', 'ETA benefit too low', 'Operational concern', 'Other']
  return <div className="overlay"><section aria-labelledby="reject-title" className="dialog-panel dialog-panel--small"><div className="dialog-panel__head"><div><span className="section-eyebrow">TỪ CHỐI PHƯƠNG ÁN</span><h2 id="reject-title">Vì sao phương án này chưa phù hợp?</h2></div><button aria-label="Đóng" className="icon-button" onClick={onClose} type="button"><X size={16} /></button></div><div className="reject-options">{reasons.map((item) => <label key={item}><input checked={reason === item} onChange={() => onReasonChange(item)} name="reject-reason" type="radio" value={item} /><span>{rejectReasonLabels[item]}</span></label>)}</div>{reason === 'Other' && <textarea aria-label="Ghi chú bổ sung" onChange={(event) => onNoteChange(event.target.value)} placeholder="Thêm ghi chú vận hành (không bắt buộc)" value={note} />}{reason !== 'Other' && <p className="dialog-intro">Lý do này sẽ được ghi vào nhật ký kiểm toán cho lần lập phương án tiếp theo.</p>}<div className="dialog-actions"><button className="ops-button ops-button--ghost" onClick={onClose} type="button">Tiếp tục xem</button><button className="ops-button ops-button--danger" onClick={onSubmit} type="button"><CircleAlert size={14} /> Từ chối phương án</button></div></section></div>
}

function screenTitle(screen: ActiveScreen) {
  return screen === 'wall' ? 'Bảng điều hành toàn mạng lưới' : screen === 'map' ? 'Bản đồ điều phối trực tiếp' : screen === 'pipeline' ? 'Luồng xử lý tự động' : screen === 'plans' ? 'Chiến lược phản hồi' : screen === 'review' ? 'Duyệt phương án điều phối' : 'Giám sát thực thi'
}

function screenDescription(screen: ActiveScreen) {
  return screen === 'wall' ? 'Toàn cảnh nhiều thông tin dành cho phòng điều hành.' : screen === 'map' ? 'Theo dõi nguồn xe, nhu cầu và rủi ro dự báo theo từng khu vực.' : screen === 'pipeline' ? 'Xem các tác tử AI đang phân tích gì trước khi đề xuất phương án.' : screen === 'plans' ? 'So sánh các lựa chọn trên cùng bộ tiêu chí vận hành.' : screen === 'review' ? 'AI đề xuất. Người vận hành quyết định điều gì được đưa vào thực tế.' : 'Theo dõi tiến độ điều chuyển và phản hồi các tín hiệu mới.'
}

function actionStateFor(plan: DispatchPlan) {
  return Object.fromEntries(plan.actions.map((action) => [action.id, action.selected]))
}
