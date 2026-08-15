import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import type { OperationsCampaignReport } from '@/features/operator-data'
import { campaignStatusRows } from '@/features/operator-reports/model/reportChartData'

const COLORS = ['#0f766e', '#0891b2', '#d97706', '#64748b', '#dc2626', '#7c3aed']

export function ReportStatusChart({ campaigns }: { campaigns: readonly OperationsCampaignReport[] }) {
  const rows = campaignStatusRows(campaigns)
  return <div aria-label="Biểu đồ phân bố trạng thái campaign" className="h-64" role="img">
    <ResponsiveContainer height="100%" width="100%"><PieChart>
      <Pie cx="50%" cy="43%" data={rows} dataKey="count" innerRadius={55} isAnimationActive={false} nameKey="status" outerRadius={84} paddingAngle={2}>
        {rows.map((row, index) => <Cell fill={COLORS[index % COLORS.length] ?? '#0f766e'} key={row.status} />)}
      </Pie>
      <Tooltip formatter={(value) => [`${Number(value)} campaign`, 'Số lượng']} />
      <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
    </PieChart></ResponsiveContainer>
  </div>
}
