import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type TrendPoint = { time: string; value: number }
type BalancePoint = { zone: string; demand: number; supply: number }

const chartTooltip = {
  contentStyle: { background: '#172128', border: '1px solid #2c3a44', borderRadius: 8, color: '#f6f8f7', fontSize: 11 },
  itemStyle: { color: '#d6e2df' },
  labelStyle: { color: '#8fa39f', marginBottom: 4 },
}

export function OperationsLineChart({ data, color, unit }: { data: TrendPoint[]; color: string; unit?: string }) {
  return <ResponsiveContainer height="100%" width="100%">
    <LineChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
      <CartesianGrid stroke="#26343d" strokeDasharray="2 4" vertical={false} />
      <XAxis axisLine={false} dataKey="time" tick={{ fill: '#7f918e', fontSize: 9 }} tickLine={false} />
      <YAxis axisLine={false} tick={{ fill: '#7f918e', fontSize: 9 }} tickLine={false} width={30} />
      <Tooltip {...chartTooltip} formatter={(value) => [`${value ?? 0}${unit ?? ''}`, 'Giá trị']} />
      <Line activeDot={{ r: 4, stroke: '#eef7f4', strokeWidth: 2 }} dataKey="value" dot={false} stroke={color} strokeWidth={2.4} type="monotone" />
    </LineChart>
  </ResponsiveContainer>
}

export function ZoneBalanceChart({ data }: { data: BalancePoint[] }) {
  return <ResponsiveContainer height="100%" width="100%">
    <BarChart data={data} margin={{ top: 8, right: 2, bottom: 0, left: -18 }}>
      <CartesianGrid stroke="#26343d" strokeDasharray="2 4" vertical={false} />
      <XAxis axisLine={false} dataKey="zone" tick={{ fill: '#7f918e', fontSize: 9 }} tickLine={false} />
      <YAxis axisLine={false} tick={{ fill: '#7f918e', fontSize: 9 }} tickLine={false} width={30} />
      <Tooltip {...chartTooltip} />
      <Bar dataKey="supply" fill="#35b7a5" name="Nguồn xe" radius={[3, 3, 0, 0]} />
      <Bar dataKey="demand" fill="#ec835a" name="Nhu cầu" radius={[3, 3, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
}
