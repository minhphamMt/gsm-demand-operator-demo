import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Circle, CloudRain, Pause, Search, X } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { campaignsQuery, plansQuery, snapshotQuery, useOperatorActions } from '@/features/operator-data'
import type { Campaign, Proposal, Zone } from '@/features/operator-data'
import { projectZonesAtMinute } from '@/features/operator-dashboard/model/forecastProjection'
import { Skeleton } from '@/shared/components/ui/FeedbackStates'
import { routes } from '@/shared/config/routes'
import { formatNumber } from '@/shared/lib/format'
import './operator-dashboard.css'

const OperatorMap = lazy(() => import('@/features/operator-map/components/OperatorMap').then(({ OperatorMap: MapComponent }) => ({ default: MapComponent })))
type MapLayer = 'gap' | 'demand' | 'supply'
type MapView = 'city' | 'core'
type MapSource = 'observed' | 'forecast'
type DialogKind = 'approve' | 'activate' | 'reject' | null

export function OperatorConsoleDashboard() {
  const navigate = useNavigate()
  const [forecastMinutes, setForecastMinutes] = useState<15 | 30>(30)
  const [selectedZoneId, setSelectedZoneId] = useState<string>()
  const [search, setSearch] = useState('')
  const [finderOpen, setFinderOpen] = useState(true)
  const [layer, setLayer] = useState<MapLayer>('gap')
  const [mapView, setMapView] = useState<MapView>('city')
  const [mapSource, setMapSource] = useState<MapSource>('observed')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [railOpen, setRailOpen] = useState(true)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [rejectNote, setRejectNote] = useState('')
  const snapshot = useQuery(snapshotQuery('baseline'))
  const plans = useQuery(plansQuery())
  const campaigns = useQuery(campaignsQuery())
  const actions = useOperatorActions()

  const plan = useMemo(() => latestAgentPlan(plans.data), [plans.data])
  const campaign = campaigns.data?.find((item) => item.planId === plan?.id)
  if (snapshot.isPending) return <div className="nf-console-loading"><Skeleton /></div>
  if (snapshot.isError || !snapshot.data) return <div className="nf-console-loading"><strong>Không thể nạp snapshot vận hành.</strong><button className="btn btn-secondary" onClick={() => void snapshot.refetch()} type="button">Thử lại</button></div>

  const projectedZones = projectZonesAtMinute(snapshot.data.zones, forecastMinutes)
  const zones = mapSource === 'forecast' ? projectedZones : snapshot.data.zones
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId)
  const deficit = zones.reduce((sum, zone) => sum + Math.max(0, zone.demand - zone.supply), 0)
  const available = zones.reduce((sum, zone) => sum + Math.max(0, zone.supply - zone.demand), 0)
  const hotspots = zones.filter((zone) => zone.demand - zone.supply >= 8).length
  const visibleZones = [...zones].filter((zone) => zone.label.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).sort((a, b) => a.aiZoneId - b.aiZoneId)
  const pending = actions.approve.isPending || actions.reject.isPending || actions.activate.isPending

  const closeDialog = () => { if (!pending) setDialog(null) }
  const approve = () => {
    if (!plan) return
    actions.approve.mutate({ planId: plan.id, note: 'Phê duyệt từ bảng chỉ huy vận hành' }, { onSuccess: () => setDialog(null) })
  }
  const reject = () => {
    if (!plan || rejectNote.trim().length < 3) return
    actions.reject.mutate({ planId: plan.id, request: { reasonCode: 'other', note: rejectNote.trim() } }, { onSuccess: () => { setDialog(null); setRejectNote('') } })
  }
  const activate = () => {
    if (!plan) return
    actions.activate.mutate({ planId: plan.id, mode: 'mixed' }, { onSuccess: () => setDialog(null) })
  }

  return <div className="nf-ops">
    <ScenarioBar forecastMinutes={forecastMinutes} fleet={snapshot.data.kpis.fleetAvailable} generatedAt={snapshot.data.generatedAt} modelVersion={snapshot.data.ai?.modelVersion} onForecastChange={(value) => { setForecastMinutes(value); setMapSource('forecast') }} onRefresh={() => void snapshot.refetch()} regime={snapshot.data.regime} zoneCount={zones.length} />
    <div className="nf-ops-workspace">
      <section className="nf-map-stage" aria-label="Bản đồ vận hành">
        <Suspense fallback={<Skeleton className="h-full" />}><OperatorMap forecastMinutes={mapSource === 'forecast' ? forecastMinutes : 0} layer={layer} onZoneSelect={setSelectedZoneId} selectedZoneId={selectedZoneId} view={mapView} zones={zones} /></Suspense>
        <MapControls forecastMinutes={forecastMinutes} layer={layer} mapSource={mapSource} onLayerChange={setLayer} onSourceChange={setMapSource} onViewChange={setMapView} view={mapView} />
        <ZoneFinder isOpen={finderOpen} onOpenChange={setFinderOpen} onSearch={setSearch} onSelect={setSelectedZoneId} search={search} selectedZoneId={selectedZoneId} zones={visibleZones} />
        {selectedZone && <ZoneCard onClose={() => setSelectedZoneId(undefined)} zone={selectedZone} />}
        <Timeline forecastMinutes={forecastMinutes} mapSource={mapSource} onChange={(value) => { if (value !== 0) setForecastMinutes(value); setMapSource(value === 0 ? 'observed' : 'forecast') }} />
        {drawerOpen && plan && <PlanDrawer onClose={() => setDrawerOpen(false)} plan={plan} />}
      </section>
      <button aria-expanded={railOpen} aria-label={railOpen ? 'Thu gọn bảng chỉ huy' : 'Mở bảng chỉ huy'} className="nf-rail-toggle" onClick={() => setRailOpen((value) => !value)} style={{ right: railOpen ? 404 : 0 }} type="button">{railOpen ? '›' : '‹'}</button>
      <aside aria-label="Bảng chỉ huy vận hành" className={`nf-command-rail ${railOpen ? 'is-open' : ''}`}>
        <KpiPanel available={available} campaign={campaign} deficit={deficit} hotspots={hotspots} plan={plan} requests={snapshot.data.kpis.requests} />
        <Pipeline campaign={campaign} plan={plan} onOpenPlan={() => setDrawerOpen(true)} />
        <RailActions campaign={campaign} isGenerating={actions.generateAiDecision.isPending} onActivate={() => setDialog('activate')} onApprove={() => setDialog('approve')} onGenerate={() => actions.generateAiDecision.mutate(forecastMinutes)} onOpenCampaign={() => navigate(routes.operator.campaigns)} onOpenPlan={() => setDrawerOpen(true)} onReject={() => setDialog('reject')} plan={plan} />
      </aside>
    </div>
    {dialog && plan && <ActionDialog dialog={dialog} error={actions.approve.error?.message ?? actions.reject.error?.message ?? actions.activate.error?.message} onActivate={activate} onApprove={approve} onClose={closeDialog} onReject={reject} pending={pending} plan={plan} rejectNote={rejectNote} setRejectNote={setRejectNote} />}
  </div>
}

function latestAgentPlan(plans: readonly Proposal[] | undefined) {
  return plans?.filter((item) => item.generatorType === 'AGENT').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.rank - b.rank)[0]
}

function ScenarioBar({ fleet, forecastMinutes, generatedAt, modelVersion, onForecastChange, onRefresh, regime, zoneCount }: { fleet: number; forecastMinutes: 15 | 30; generatedAt: string; modelVersion: string | null | undefined; onForecastChange: (value: 15 | 30) => void; onRefresh: () => void; regime: string; zoneCount: number }) {
  const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(generatedAt))
  const weather = regime === 'rain_peak' ? 'Mưa lớn · giờ cao điểm' : regime === 'rain' ? 'Mưa' : regime === 'peak' ? 'Giờ cao điểm' : 'Bình thường'
  return <div className="nf-scenario-bar"><strong>KỊCH BẢN · MƯA GIỜ CAO ĐIỂM {time}</strong><i /><span><CloudRain size={14} /> Thời tiết: {weather} · dữ liệu AI</span><i /><span>Đội xe vận hành {fleet} xe · {zoneCount}/30 zone</span><span className="nf-model">MODEL {modelVersion ?? 'LIVE'}</span><small>HORIZON DỰ BÁO</small><div className="seg" role="group" aria-label="Horizon dự báo"><label className="seg-opt"><input checked={forecastMinutes === 15} name="hz" onChange={() => onForecastChange(15)} type="radio" />15 phút</label><label className="seg-opt"><input checked={forecastMinutes === 30} name="hz" onChange={() => onForecastChange(30)} type="radio" />30 phút</label></div><button className="btn btn-secondary" onClick={onRefresh} type="button">Làm mới dữ liệu</button></div>
}

function MapControls({ forecastMinutes, layer, mapSource, onLayerChange, onSourceChange, onViewChange, view }: { forecastMinutes: number; layer: MapLayer; mapSource: MapSource; onLayerChange: (value: MapLayer) => void; onSourceChange: (value: MapSource) => void; onViewChange: (value: MapView) => void; view: MapView }) {
  return <div className="nf-map-controls"><div className="seg" role="group" aria-label="Lớp bản đồ"><label className="seg-opt"><input checked={layer === 'gap'} name="layer" onChange={() => onLayerChange('gap')} type="radio" />Chênh lệch</label><label className="seg-opt"><input checked={layer === 'demand'} name="layer" onChange={() => onLayerChange('demand')} type="radio" />Nhu cầu</label><label className="seg-opt"><input checked={layer === 'supply'} name="layer" onChange={() => onLayerChange('supply')} type="radio" />Xe rỗi</label></div><div className="seg" role="group" aria-label="Khung nhìn"><label className="seg-opt"><input checked={view === 'city'} name="view" onChange={() => onViewChange('city')} type="radio" />Toàn thành phố</label><label className="seg-opt"><input checked={view === 'core'} name="view" onChange={() => onViewChange('core')} type="radio" />Vùng lõi</label></div><div className="seg" role="group" aria-label="Nguồn số liệu"><label className="seg-opt"><input checked={mapSource === 'observed'} name="source" onChange={() => onSourceChange('observed')} type="radio" />Ghi nhận</label><label className="seg-opt"><input checked={mapSource === 'forecast'} name="source" onChange={() => onSourceChange('forecast')} type="radio" />Dự báo +{forecastMinutes}′</label></div></div>
}

function ZoneFinder({ isOpen, onOpenChange, onSearch, onSelect, search, selectedZoneId, zones }: { isOpen: boolean; onOpenChange: (value: boolean) => void; onSearch: (value: string) => void; onSelect: (id: string) => void; search: string; selectedZoneId: string | undefined; zones: readonly Zone[] }) {
  return <div className={`nf-zone-finder ${isOpen ? 'is-open' : ''}`}><header><strong>TÌM KHU VỰC ({zones.length}/30)</strong><button aria-expanded={isOpen} aria-label={isOpen ? 'Thu gọn danh sách khu vực' : 'Mở danh sách khu vực'} onClick={() => onOpenChange(!isOpen)} type="button">{isOpen ? '▾' : '▸'}</button></header>{isOpen && <><label><Search size={14} /><input aria-label="Tìm khu vực" onChange={(event) => onSearch(event.target.value)} placeholder="Nhập tên zone..." value={search} /></label><div className="nf-scroll">{zones.map((zone) => { const balance = zone.supply - zone.demand; const tier = zone.aiZoneId <= 7 ? 'lõi' : zone.aiZoneId <= 13 ? 'vành' : 'ngoại'; return <button className={selectedZoneId === zone.id ? 'is-active' : ''} key={zone.id} onClick={() => onSelect(zone.id)} type="button"><span><b>{zone.label}</b></span><small>{tier}</small><em className={balance < 0 ? 'is-deficit' : 'is-surplus'}>{balance > 0 ? '+' : ''}{balance} xe</em></button> })}</div></>}</div>
}

function ZoneCard({ onClose, zone }: { onClose: () => void; zone: Zone }) {
  const balance = zone.supply - zone.demand
  return <div className="nf-zone-card"><button aria-label="Đóng chi tiết khu vực" onClick={onClose} type="button"><X size={14} /></button><small>CHI TIẾT KHU VỰC</small><strong>{zone.label}</strong><div><span>Cung<b>{zone.supply}</b></span><span>Cầu<b>{zone.demand}</b></span><span>Chênh lệch<b className={balance < 0 ? 'bad' : 'good'}>{balance > 0 ? '+' : ''}{balance}</b></span></div><p>Độ tin cậy AI: {zone.confidence === null ? 'N/A' : `${Math.round(zone.confidence * 100)}%`}</p></div>
}

function Timeline({ forecastMinutes, mapSource, onChange }: { forecastMinutes: 15 | 30; mapSource: MapSource; onChange: (value: 0 | 15 | 30) => void }) {
  const ticks = Array.from({ length: 19 }, (_, index) => index)
  return <div className="nf-timeline"><div className="nf-timeline-buttons"><button aria-label="Lùi một bước" onClick={() => onChange(0)} type="button">◀</button><button aria-label="Tạm dừng" className="is-active" type="button"><Pause size={12} /></button><button aria-label="Tiến một bước" onClick={() => onChange(forecastMinutes === 15 ? 30 : 15)} type="button">▶</button></div><div className="nf-timeline-track"><div>{ticks.map((tick) => <button aria-label={tick === 6 ? 'Hiện tại' : `Mốc ${tick}`} className={mapSource === 'observed' ? tick < 7 ? 'is-past' : '' : tick === (forecastMinutes === 15 ? 9 : 12) ? 'is-current' : tick < 7 ? 'is-past' : ''} key={tick} onClick={() => onChange(tick <= 6 ? 0 : tick <= 9 ? 15 : 30)} type="button" />)}</div><p><span>Hiện tại</span><span>+15′</span><span>+30′</span></p></div><em>REPLAY<br /><b>Thủ công</b></em></div>
}

function KpiPanel({ available, campaign, deficit, hotspots, plan, requests }: { available: number; campaign: Campaign | undefined; deficit: number; hotspots: number; plan: Proposal | undefined; requests: number }) {
  const covered = plan ? Math.max(0, Math.round((1 - plan.metrics.residualGap / Math.max(1, plan.metricsBefore.residualGap)) * 100)) : 0
  return <div className="nf-kpi-panel"><div className="nf-rail-title"><span>TÌNH HÌNH VẬN HÀNH</span><small>GHI NHẬN MỚI NHẤT</small></div><div className="nf-phases"><b>Quan sát</b><b>Tính toán</b><b>Quyết định</b><b>Thực hiện</b></div><section className="nf-kpi-primary"><small>THIẾU HỤT DỰ BÁO</small><strong>{deficit}<em> xe</em></strong><span>{hotspots} khu vực cần chú ý · {requests} yêu cầu</span></section><div className="nf-kpi-grid"><span><small>XE CÓ THỂ ĐIỀU PHỐI</small><b>{available}</b></span><span><small>MỨC PHỦ PHƯƠNG ÁN</small><b>{covered}%</b></span><span><small>CHI PHÍ TỐI ƯU</small><b>{plan ? formatVnd(plan.estimatedNetCost || plan.estimatedRewardCost) : '—'}</b></span><span><small>CAMPAIGN</small><b>{campaign?.status ?? 'Chưa chạy'}</b></span></div></div>
}

function Pipeline({ campaign, onOpenPlan, plan }: { campaign: Campaign | undefined; onOpenPlan: () => void; plan: Proposal | undefined }) {
  const hasPlan = Boolean(plan)
  const approved = plan?.status === 'Approved' || Boolean(campaign)
  const active = Boolean(campaign)
  const steps = [
    ['Nạp snapshot vận hành', true, 'snapshot.load(zone_registry)'],
    ['Dự báo cung–cầu', hasPlan, 'forecast.run(model=live)'],
    ['Phát hiện hotspot & nguồn dư', hasPlan, 'imbalance.detect()'],
    ['Kiểm tra ràng buộc điều phối', hasPlan, 'policy.check()'],
    ['Tính phương án điều chuyển', hasPlan, 'relocation.optimize(best=1)'],
    ['Chờ phê duyệt của điều phối viên', approved, 'approval.gate(human_required=true)'],
    ['Phát lệnh & theo dõi thực hiện', active, 'dispatch.execute()'],
    ['Tính lại thiếu hụt tồn dư', active, 'gap.recompute()'],
    ['Đánh giá nhu cầu activation', active, 'activation.evaluate()'],
    ['Theo dõi phản hồi tài xế', active, 'offer.track()'],
    ['So sánh kịch bản', hasPlan, 'scenario.compare()'],
    ['Ghi nhật ký kiểm toán', hasPlan, 'audit.append()'],
  ] as const
  const completed = steps.filter((step) => step[1]).length
  const firstPending = steps.findIndex((step) => !step[1])
  return <div className="nf-pipeline nf-scroll"><div className="nf-pipeline-heading"><span>AGENT ĐANG CHẠY</span><b>{active ? 'THEO DÕI' : approved ? 'CHỜ BẠN' : hasPlan ? 'CHỜ DUYỆT' : 'SẴN SÀNG'}</b><em>{completed}/12</em></div>{steps.map(([label, done, command], index) => <div className={`nf-pipeline-step ${done ? 'is-done' : index === firstPending ? 'is-current' : ''}`} key={label}><i>{done ? <Check size={11} /> : index === firstPending ? <Pause size={10} /> : <Circle size={8} />}</i><span><b>{label}</b><small>{done ? 'XONG' : index === firstPending ? 'CHỜ BẠN' : 'CHỜ ĐIỀU KIỆN'}</small><code>{command}</code>{index === 4 && hasPlan && <button onClick={onOpenPlan} type="button">Xem {plan?.moves.length ?? 0} lượt →</button>}</span></div>)}</div>
}

function RailActions({ campaign, isGenerating, onActivate, onApprove, onGenerate, onOpenCampaign, onOpenPlan, onReject, plan }: { campaign: Campaign | undefined; isGenerating: boolean; onActivate: () => void; onApprove: () => void; onGenerate: () => void; onOpenCampaign: () => void; onOpenPlan: () => void; onReject: () => void; plan: Proposal | undefined }) {
  if (!plan || ['Rejected', 'Stale', 'FailedGeneration'].includes(plan.status)) return <div className="nf-rail-actions"><button className="btn btn-primary btn-block" disabled={isGenerating} onClick={onGenerate} type="button">{isGenerating ? 'Đang chạy model…' : 'Chạy dự báo và tìm phương án tối ưu'}</button><small>Model sử dụng snapshot và dữ liệu mô phỏng hiện tại.</small></div>
  if (plan.policyChecks.some((check) => check.blocking && !check.passed)) return <div className="nf-rail-actions"><button className="btn btn-primary btn-block" disabled={isGenerating} onClick={onGenerate} type="button">{isGenerating ? 'Đang tính lại…' : 'Tính lại phương án'}</button><button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem nguyên nhân không có lời giải</button><small>Không thể phê duyệt khi ràng buộc bắt buộc chưa đạt.</small></div>
  if (campaign) return <div className="nf-rail-actions"><button className="btn btn-primary btn-block" onClick={onOpenCampaign} type="button">Theo dõi thực hiện <ChevronRight size={14} /></button><button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem phương án đã duyệt</button><small>Phản hồi tài xế được đồng bộ theo thời gian thực.</small></div>
  if (plan.status === 'Approved') return <div className="nf-rail-actions"><button className="btn btn-primary btn-block" onClick={onActivate} type="button">Đưa vào thực hiện</button><button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem phương án đã duyệt</button><small>Phát lệnh là thao tác riêng sau phê duyệt.</small></div>
  return <div className="nf-rail-actions"><button className="btn btn-primary btn-block" onClick={onApprove} type="button">Phê duyệt phương án</button><div><button className="btn btn-secondary" onClick={onReject} type="button">Từ chối</button><button className="btn btn-secondary" onClick={onOpenPlan} type="button">Xem {plan.moves.length} lượt</button></div><small>Phê duyệt không phát lệnh và không kích hoạt campaign.</small></div>
}

function PlanDrawer({ onClose, plan }: { onClose: () => void; plan: Proposal }) {
  const coverage = Math.max(0, Math.round((1 - plan.metrics.residualGap / Math.max(1, plan.metricsBefore.residualGap)) * 100))
  return <section aria-label="Chi tiết phương án" className="nf-plan-drawer"><header><div><small>BẢNG CHI TIẾT · {plan.moves.length} LƯỢT</small><strong>{plan.status === 'Approved' ? 'Đã phê duyệt' : 'Phương án đề xuất'}</strong><p>{plan.status === 'Approved' ? 'Chưa có lệnh nào được phát. Thực hiện là một thao tác riêng.' : 'Xem lại phương án tối ưu trước khi phê duyệt hoặc từ chối.'}</p></div><button aria-label="Đóng bảng chi tiết" onClick={onClose} type="button"><X size={17} /></button></header><div className="nf-plan-summary"><strong>{coverage}%</strong><span>thiếu hụt được phủ bởi điều chuyển<br />{plan.targetDriverCount} tài xế mục tiêu · còn thiếu {formatNumber(plan.metrics.residualGap)}</span></div><div className="nf-plan-metrics"><span><small>SỐ LƯỢT</small><b>{plan.moves.length}</b></span><span><small>CHI PHÍ</small><b>{formatVnd(plan.estimatedNetCost || plan.estimatedRewardCost)}</b></span><span><small>ETA TRUNG BÌNH</small><b>{Math.round(plan.averageEtaMinutes)}′</b></span></div><div className="nf-plan-scroll nf-scroll"><h3>TÁC ĐỘNG DỰ KIẾN</h3><table className="table"><thead><tr><th>Chỉ số</th><th>Không hành động</th><th>Sau điều chuyển</th></tr></thead><tbody><tr><td>Thiếu hụt</td><td>{formatNumber(plan.metricsBefore.residualGap)}</td><td>{formatNumber(plan.metrics.residualGap)}</td></tr><tr><td>Tỷ lệ đáp ứng</td><td>{formatNumber(plan.metricsBefore.fulfillmentRate)}%</td><td>{formatNumber(plan.metrics.fulfillmentRate)}%</td></tr><tr><td>Phút chờ trung bình</td><td>{formatNumber(plan.metricsBefore.avgWaitProxy)}′</td><td>{formatNumber(plan.metrics.avgWaitProxy)}′</td></tr></tbody></table><h3>RÀNG BUỘC VẬN HÀNH</h3><div className="nf-policy-tags">{plan.policyChecks.map((check) => <span className={check.passed ? 'pass' : 'fail'} key={check.id}>{check.passed ? '✓' : '!'} {check.label}</span>)}</div>{plan.warnings.length > 0 && <><h3>CẢNH BÁO CHÍNH SÁCH</h3>{plan.warnings.map((warning) => <p className="nf-warning" key={warning.id}>! {warning.title}: {warning.detail}</p>)}</>}<h3>LƯỢT ĐIỀU CHUYỂN {plan.status === 'Approved' ? 'ĐÃ DUYỆT' : 'ĐỀ XUẤT'}</h3>{plan.moves.map((move, index) => <article className="nf-move" key={move.id}><span>MV-{String(index + 1).padStart(2, '0')}</span><div><b>{move.sourceZoneLabel} → {move.targetZoneLabel}</b><small>{move.distanceKm.toFixed(1)} km · ETA {move.etaMinutes}′ · {formatVnd(move.estimatedCost)}</small></div><strong>{move.quantity} xe</strong></article>)}</div></section>
}

function ActionDialog({ dialog, error, onActivate, onApprove, onClose, onReject, pending, plan, rejectNote, setRejectNote }: { dialog: Exclude<DialogKind, null>; error: string | undefined; onActivate: () => void; onApprove: () => void; onClose: () => void; onReject: () => void; pending: boolean; plan: Proposal; rejectNote: string; setRejectNote: (value: string) => void }) {
  const isApprove = dialog === 'approve'
  const isActivate = dialog === 'activate'
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} role="presentation"><div aria-modal="true" className="dialog" role="dialog"><div className="dialog-title">{isApprove ? 'Phê duyệt phương án điều chuyển' : isActivate ? 'Đưa kế hoạch vào thực hiện' : 'Từ chối phương án'}</div><div className="dialog-body">{isApprove ? 'Phê duyệt xác nhận phương án là hợp lệ. Chưa có lệnh nào được gửi tới tài xế ở bước này.' : isActivate ? 'Hệ thống sẽ tạo campaign và gửi offer tới nhóm tài xế đủ điều kiện.' : 'Ghi rõ lý do để lưu vào nhật ký kiểm toán và làm đầu vào cho lần tính tiếp theo.'}</div>{dialog === 'reject' ? <label className="field"><span>Lý do từ chối</span><textarea className="input" onChange={(event) => setRejectNote(event.target.value)} rows={3} value={rejectNote} /></label> : <div className="nf-dialog-summary"><span>Số lượt<b>{plan.moves.length} lượt</b></span><span>Tài xế mục tiêu<b>{plan.targetDriverCount} xe</b></span><span>Chi phí ước tính<b>{formatVnd(plan.estimatedNetCost || plan.estimatedRewardCost)}</b></span><span>Thiếu hụt còn lại<b>{formatNumber(plan.metrics.residualGap)} xe</b></span></div>}{error && <p className="nf-dialog-error">{error}</p>}<div className="dialog-actions"><button className="btn btn-secondary" disabled={pending} onClick={onClose} type="button">Huỷ bỏ</button><button className="btn btn-primary" disabled={pending || (dialog === 'reject' && rejectNote.trim().length < 3)} onClick={isApprove ? onApprove : isActivate ? onActivate : onReject} type="button">{pending ? 'Đang xử lý…' : isApprove ? 'Phê duyệt' : isActivate ? 'Phát lệnh' : 'Từ chối'}</button></div></div></div>
}

const formatVnd = (value: number) => `${new Intl.NumberFormat('vi-VN').format(Math.max(0, Math.round(value)))}₫`
