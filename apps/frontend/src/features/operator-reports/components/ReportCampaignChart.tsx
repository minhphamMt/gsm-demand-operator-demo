import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { OperationsCampaignReport } from '@/features/operator-data'
import { campaignActivityRows } from '@/features/operator-reports/model/reportChartData'

const chartTheme = {
  grid: '#2a3941',
  muted: '#90a09e',
  ink: '#f0f5f2',
  teal: '#54d4c1',
  blue: '#7fa9f5',
  panel: '#172128',
}

export function ReportCampaignChart({ campaigns }: { campaigns: readonly OperationsCampaignReport[] }) {
  const rows = campaignActivityRows(campaigns)
  if (!rows.length) return <div className="grid h-64 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">Chưa có campaign phát sinh hoạt động trong bộ lọc này.</div>
  return <div aria-label="Biểu đồ tài xế kích hoạt và chuyến hoàn tất theo campaign từ DB" className="h-72" role="img">
    <ResponsiveContainer height="100%" width="100%"><BarChart data={rows} layout="vertical" margin={{ left: 10, right: 20, top: 12 }}>
      <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" horizontal={false} />
      <XAxis allowDecimals={false} tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} type="number" />
      <YAxis dataKey="label" tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} type="category" width={70} />
      <Tooltip contentStyle={{ backgroundColor: chartTheme.panel, border: `1px solid ${chartTheme.grid}`, borderRadius: 8, color: chartTheme.ink }} cursor={{ fill: 'rgba(53,183,165,.08)' }} itemStyle={{ color: chartTheme.ink }} labelStyle={{ color: chartTheme.ink }} /><Legend wrapperStyle={{ color: chartTheme.muted, fontSize: 11 }} />
      <Bar dataKey="activatedDrivers" fill={chartTheme.blue} isAnimationActive={false} name="Tài xế kích hoạt" radius={[0, 4, 4, 0]} />
      <Bar dataKey="qualifiedTrips" fill={chartTheme.teal} isAnimationActive={false} name="Chuyến hoàn tất" radius={[0, 4, 4, 0]} />
    </BarChart></ResponsiveContainer>
  </div>
}
