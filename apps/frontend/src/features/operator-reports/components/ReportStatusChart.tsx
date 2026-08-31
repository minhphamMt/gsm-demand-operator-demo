import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import type { OperationsCampaignReport } from '@/features/operator-data'
import { campaignStatusRows } from '@/features/operator-reports/model/reportChartData'

const COLORS = ['#35b7a5', '#7fa9f5', '#eeb151', '#90a09e', '#d45252', '#a78bfa']
const chartTheme = {
  grid: '#2a3941',
  muted: '#90a09e',
  ink: '#f0f5f2',
  panel: '#172128',
}

export function ReportStatusChart({ campaigns }: { campaigns: readonly OperationsCampaignReport[] }) {
  const rows = campaignStatusRows(campaigns)
  return <div aria-label="Biểu đồ phân bố trạng thái campaign" className="h-64" role="img">
    <ResponsiveContainer height="100%" width="100%"><PieChart>
      <Pie cx="50%" cy="43%" data={rows} dataKey="count" innerRadius={55} isAnimationActive={false} nameKey="status" outerRadius={84} paddingAngle={2}>
        {rows.map((row, index) => <Cell fill={COLORS[index % COLORS.length] ?? '#0f766e'} key={row.status} />)}
      </Pie>
      <Tooltip contentStyle={{ backgroundColor: chartTheme.panel, border: `1px solid ${chartTheme.grid}`, borderRadius: 8, color: chartTheme.ink }} formatter={(value) => [`${Number(value)} campaign`, 'Số lượng']} itemStyle={{ color: chartTheme.ink }} labelStyle={{ color: chartTheme.ink }} />
      <Legend iconSize={9} wrapperStyle={{ color: chartTheme.muted, fontSize: 11 }} />
    </PieChart></ResponsiveContainer>
  </div>
}
