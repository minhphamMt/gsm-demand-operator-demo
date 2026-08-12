import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { OperationsCampaignReport } from '@/features/operator-data'

export function ReportCampaignChart({ campaigns }: { campaigns: readonly OperationsCampaignReport[] }) {
  const rows = campaigns.map((campaign) => ({ name: campaign.id.slice(0, 8), activatedDrivers: campaign.activatedDrivers, qualifiedTrips: campaign.qualifiedTrips }))
  return <div aria-label="Biểu đồ tài xế kích hoạt và chuyến hoàn tất theo campaign từ DB" className="h-72" role="img">
    <ResponsiveContainer height="100%" width="100%"><BarChart data={rows} margin={{ left: 4, right: 12, top: 12 }}>
      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} />
      <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} />
      <Tooltip cursor={{ fill: '#f8fafc' }} /><Legend />
      <Bar dataKey="activatedDrivers" fill="#0578dc" name="Tài xế kích hoạt" radius={[3, 3, 0, 0]} />
      <Bar dataKey="qualifiedTrips" fill="#08aaa5" name="Chuyến hoàn tất" radius={[3, 3, 0, 0]} />
    </BarChart></ResponsiveContainer>
  </div>
}
