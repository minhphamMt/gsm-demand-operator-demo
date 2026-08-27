import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'

import type { ZoneBreakdownRow } from '@/features/operator-pipeline/model/systemHealth'

// §3.8: bảng chi tiết theo zone, cuộn được, đổi được cột sắp xếp.

type SortKey = 'gap' | 'demand' | 'supply'

const columns: readonly { key: SortKey; label: string }[] = [
  { key: 'supply', label: 'Cung' },
  { key: 'demand', label: 'Cầu' },
  { key: 'gap', label: 'Thiếu' },
]

export function ZoneBreakdownTable({ rows, alertThreshold }: {
  rows: readonly ZoneBreakdownRow[]
  alertThreshold: number
}) {
  const [sortKey, setSortKey] = useState<SortKey>('gap')
  const sorted = [...rows].sort((left, right) => right[sortKey] - left[sortKey])

  if (rows.length === 0) {
    return <p className="nfp-card px-3 py-4 text-center text-[11px] text-[var(--nfp-muted)]">Chưa có zone nào có quan sát hợp lệ.</p>
  }

  return (
    <section aria-label="Chi tiết theo zone" className="space-y-2">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]">Chi tiết theo zone</h3>
      <div className="nfp-card max-h-56 overflow-y-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-[var(--nfp-raise-2)] text-[9px] uppercase tracking-wider text-[var(--nfp-muted)]">
            <tr>
              <th className="px-2.5 py-1.5 font-semibold" scope="col">Zone</th>
              {columns.map((column) => (
                <th className="px-2 py-1.5 text-right font-semibold" key={column.key} scope="col">
                  <button
                    aria-label={`Sắp xếp theo ${column.label}`}
                    className={`inline-flex items-center gap-1 ${sortKey === column.key ? 'text-[var(--nfp-accent)]' : ''}`}
                    onClick={() => setSortKey(column.key)}
                    type="button"
                  >
                    {column.label}
                    <ArrowUpDown className="size-2.5" />
                  </button>
                </th>
              ))}
              <th className="px-2.5 py-1.5 text-right font-semibold" scope="col">% cầu</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr className="border-t border-[var(--nfp-line)]" key={row.zoneId}>
                <th className="max-w-28 truncate px-2.5 py-1.5 font-medium text-[var(--nfp-ink)]" scope="row" title={row.label}>
                  {row.label}
                </th>
                <td className="px-2 py-1.5 text-right tabular-nums text-[var(--nfp-muted)]">{row.supply}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[var(--nfp-muted)]">{row.demand}</td>
                <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${gapTone(row.gap, alertThreshold)}`}>{row.gap}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-[var(--nfp-muted)]">{row.demandSharePct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// Ngưỡng của một zone lấy theo tỷ lệ ngưỡng toàn hệ thống: chỉ để tô màu đọc nhanh,
// không phải ngưỡng hotspot của Model 2.
function gapTone(gap: number, alertThreshold: number): string {
  if (gap === 0) return 'text-[var(--nfp-muted)]'
  if (gap >= Math.max(4, alertThreshold / 4)) return 'text-[var(--nfp-crit)]'
  return 'text-[var(--nfp-warn)]'
}
