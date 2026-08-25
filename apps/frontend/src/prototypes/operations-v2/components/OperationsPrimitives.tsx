import { Check, CircleAlert, CircleDashed, CircleX, LoaderCircle, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import type { DispatchPlan, ZoneStatus } from '../types'
import { formatZoneStatus, planCostLabels } from '../uiLabels'

export function StatusPill({ status }: { status: ZoneStatus }) {
  const icon = status === 'BALANCED' ? <Check size={11} /> : status === 'WATCH' ? <CircleDashed size={11} /> : status === 'ABNORMAL' ? <CircleAlert size={11} /> : <CircleX size={11} />
  return <span className={`status-pill status-pill--${status.toLowerCase()}`}>{icon}{formatZoneStatus(status)}</span>
}

export function DonutMetric({ label, value, tone }: { label: string; value: number; tone: 'teal' | 'amber' | 'blue' }) {
  return <div className="donut-metric"><div className={`donut donut--${tone}`} style={{ '--donut-value': `${value * 3.6}deg` } as CSSProperties}><span>{value}%</span></div><span>{label}</span></div>
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="section-heading"><div>{eyebrow && <span className="section-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>
}

export function MetricValue({ label, value, delta, note, emphasis = false }: { label: string; value: string; delta?: number; note?: string; emphasis?: boolean }) {
  const deltaIcon = delta === undefined ? null : delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />
  return <div className={`metric-value ${emphasis ? 'metric-value--emphasis' : ''}`}><span>{label}</span><strong>{value}</strong>{delta !== undefined && <small className={delta >= 0 ? 'delta--up' : 'delta--down'}>{deltaIcon}{Math.abs(delta)}% vs baseline</small>}{note && <small>{note}</small>}</div>
}

export function AgentStateIcon({ state }: { state: 'PENDING' | 'RUNNING' | 'DONE' | 'WARNING' | 'FAILED' }) {
  if (state === 'RUNNING') return <span className="agent-state-icon agent-state-icon--running"><LoaderCircle size={15} /></span>
  if (state === 'DONE') return <span className="agent-state-icon agent-state-icon--done"><Check size={15} /></span>
  if (state === 'WARNING') return <span className="agent-state-icon agent-state-icon--warning"><CircleAlert size={15} /></span>
  if (state === 'FAILED') return <span className="agent-state-icon agent-state-icon--failed"><CircleX size={15} /></span>
  return <span className="agent-state-icon agent-state-icon--pending"><Minus size={15} /></span>
}

export function PlanCard({ plan, selected, onSelect }: { plan: DispatchPlan; selected: boolean; onSelect: () => void }) {
  return <button className={`plan-card ${plan.isRecommended ? 'plan-card--recommended' : ''} ${selected ? 'is-selected' : ''}`} onClick={onSelect} type="button">
    <div className="plan-card__head"><span className="plan-label">{plan.label}</span>{plan.isRecommended && <span className="recommended-badge"><Check size={11} /> KHUYẾN NGHỊ</span>}<span className="plan-card__radio">{selected && <Check size={12} />}</span></div>
    <div className="plan-card__headline"><strong>{plan.vehicles}</strong><span>xe<br />điều chuyển</span></div>
    <div className="plan-card__metrics"><span><b>{plan.etaImprovement} phút</b> cải thiện ETA</span><span><b>{plan.coverage}%</b> độ phủ</span><span><b>{planCostLabels[plan.cost]}</b> chi phí</span></div>
    <div className="plan-card__confidence"><span>Độ tin cậy AI</span><b>{plan.aiConfidence}%</b><i><em style={{ width: `${plan.aiConfidence}%` }} /></i></div>
  </button>
}
