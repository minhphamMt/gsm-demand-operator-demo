import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { OperationsCampaignReport } from '@/features/operator-data'
import { campaignActivityRows } from '@/features/operator-reports/model/reportChartData'

export function ReportCampaignChart({ campaigns }: { campaigns: readonly OperationsCampaignReport[] }) {
  const rows = campaignActivityRows(campaigns)
  if (!rows.length) return <div className="grid h-64 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">Chưa có campaign phát sinh hoạt động trong bộ lọc này.</div>
  return <div aria-label="Biểu đồ tài xế kích hoạt và chuyến hoàn tất theo campaign từ DB" className="h-72" role="img">
    <ResponsiveContainer height="100%" width="100%"><BarChart data={rows} layout="vertical" margin={{ left: 10, right: 20, top: 12 }}>
      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
      <XAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} type="number" />
      <YAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} type="category" width={70} />
      <Tooltip cursor={{ fill: '#f8fafc' }} /><Legend />
      <Bar dataKey="activatedDrivers" fill="#0578dc" isAnimationActive={false} name="Tài xế kích hoạt" radius={[0, 4, 4, 0]} />
      <Bar dataKey="qualifiedTrips" fill="#0f766e" isAnimationActive={false} name="Chuyến hoàn tất" radius={[0, 4, 4, 0]} />
    </BarChart></ResponsiveContainer>
  </div>
}
