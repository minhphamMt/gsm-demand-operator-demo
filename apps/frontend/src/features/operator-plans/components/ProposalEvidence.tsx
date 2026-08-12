import { AlertTriangle, CheckCircle2, CircleAlert, Database, ListChecks } from 'lucide-react'
import type { ReactNode } from 'react'

import { getProposalGeneratorLabel, type Proposal } from '@/features/operator-data'
import { Badge } from '@/shared/components/ui/Badge'
import { Card } from '@/shared/components/ui/Card'
import { formatOptionalPercentRatio, formatTime } from '@/shared/lib/format'

export function ProposalEvidence({ plan }: { plan: Proposal }) {
  return (
    <Card className="p-0">
      <EvidenceSection icon={<Database className="size-4" />} title="Hồ sơ dữ liệu đầu vào">
        <dl className="space-y-2.5 text-sm"><Row label="Snapshot" value={plan.inputSnapshotId} /><Row label="Hotspot" value={plan.hotspotId} /><Row label="Vùng đích" value={plan.targetZoneId ? plan.targetZoneLabel : 'Chưa xác định'} /><Row label="Nguồn gợi ý" value={getProposalGeneratorLabel(plan.generatorType)} /><Row label="Phiên bản bộ sinh" value={plan.generatorVersion} /><Row label="Độ tin cậy" value={formatOptionalPercentRatio(plan.confidence)} /><Row label="Hợp lệ tới" value={formatTime(plan.inputFreshUntil)} /></dl>
      </EvidenceSection>
      {plan.warnings.length > 0 && (
        <EvidenceSection icon={<AlertTriangle className="size-4 text-amber-600" />} title="Rủi ro cần cân nhắc">
          <ul className="space-y-3">{plan.warnings.map((warning) => <li key={warning.id} className="text-sm"><p className="font-semibold text-amber-900">{warning.title}</p><p className="mt-0.5 text-slate-600">{warning.detail}</p></li>)}</ul>
        </EvidenceSection>
      )}
      <EvidenceSection icon={<ListChecks className="size-4" />} title="Policy check độc lập">
        <ul className="space-y-3">{plan.policyChecks.map((check) => <li key={check.id} className="flex gap-2 text-sm"><span className={check.passed ? 'text-emerald-600' : 'text-rose-600'}>{check.passed ? <CheckCircle2 className="size-5" /> : <CircleAlert className="size-5" />}</span><span><span className="flex flex-wrap items-center gap-2 font-medium text-slate-900">{check.label}{check.blocking && <Badge tone={check.passed ? 'neutral' : 'danger'}>Chặn duyệt</Badge>}</span><span className="mt-0.5 block text-slate-500">{check.detail}</span></span></li>)}</ul>
      </EvidenceSection>
      <EvidenceSection title="Cơ sở của phương án">
        <ol className="space-y-2.5">{plan.explanation.map((explanation, index) => <li key={explanation} className="flex gap-3 text-sm text-slate-600"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">{index + 1}</span><span>{explanation}</span></li>)}</ol>
      </EvidenceSection>
    </Card>
  )
}

function EvidenceSection({ children, icon, title }: { children: ReactNode; icon?: ReactNode; title: string }) {
  return <section className="border-b border-slate-200 p-4 last:border-b-0"><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">{icon && <span className="text-brand-600">{icon}</span>}{title}</h3>{children}</section>
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-900">{value}</dd></div>
}
