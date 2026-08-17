import type { OperationsReport } from '@/features/operator-data'
import { ReportBudgetChart } from '@/features/operator-reports/components/ReportBudgetChart'
import { ReportCampaignChart } from '@/features/operator-reports/components/ReportCampaignChart'
import { ReportStatusChart } from '@/features/operator-reports/components/ReportStatusChart'
import { Card } from '@/shared/components/ui/Card'

export function ReportVisuals({ report }: { report: OperationsReport }) {
  return <section aria-label="Biểu đồ vận hành" className="grid gap-4 xl:grid-cols-2">
    <Card className="nf-workspace-panel nf-report-visual-card xl:col-span-2">
      <ChartHeading description="Campaign có hoạt động" title="Hiệu quả theo campaign" />
      <ReportCampaignChart campaigns={report.campaigns} />
    </Card>
    <Card className="nf-workspace-panel nf-report-visual-card">
      <ChartHeading description="Giữ chỗ · trả thưởng · hoàn" title="Dòng ngân sách" />
      <ReportBudgetChart summary={report.summary} />
    </Card>
    <Card className="nf-workspace-panel nf-report-visual-card">
      <ChartHeading description="Theo trạng thái hiện tại" title="Trạng thái campaign" />
      <ReportStatusChart campaigns={report.campaigns} />
    </Card>
  </section>
}

function ChartHeading({ description, title }: { description: string; title: string }) {
  return <div className="nf-report-chart-heading mb-2"><h2 className="font-semibold text-slate-950">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>
}
