import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react'
import { useState } from 'react'

import type { Zone } from '@/features/operator-data'

type ZoneWatchlistProps = {
  onSelect: (zoneId: string) => void
  selectedZoneId?: string | undefined
  zones: readonly Zone[]
}

export function ZoneWatchlist({ onSelect, selectedZoneId, zones }: ZoneWatchlistProps) {
  const [search, setSearch] = useState('')
  const visibleZones = [...zones]
    .filter((zone) => zone.label.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))
    .sort((left, right) => Number(left.dataStatus === 'no_live_cells') - Number(right.dataStatus === 'no_live_cells')
      || (right.demand - right.supply) - (left.demand - left.supply))

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-panel border border-slate-200 bg-white shadow-panel">
      <div className="border-b border-slate-200 px-3 py-3">
        <div className="flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Khu vực ({zones.length})</h2><span className="text-[10px] font-semibold text-slate-400">AI ranking</span></div>
        <label className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 focus-within:border-teal-500">
          <Search className="size-3.5 text-slate-400" /><span className="sr-only">Tìm khu vực</span><input className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400" onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên zone..." value={search} />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleZones.map((zone) => {
          const hasLiveData = zone.dataStatus !== 'no_live_cells'
          const balance = zone.demand - zone.supply
          const hasShortage = balance > 0
          return <button className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50 ${selectedZoneId === zone.id ? 'bg-teal-50' : ''} ${hasLiveData ? '' : 'opacity-60'}`} key={zone.id} onClick={() => onSelect(zone.id)} type="button">
            <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${!hasLiveData ? 'bg-slate-100 text-slate-400' : hasShortage ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{hasShortage ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}</span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{zone.label}</strong><span className="mt-0.5 block text-[10px] text-slate-400">{hasLiveData ? `Cung ${zone.supply} · Cầu ${zone.demand} · ${zone.sourceCellCount ?? 0} ô H3` : 'Chưa có ô H3 live'}</span></span>
            <span className={`shrink-0 rounded-md px-1.5 py-1 text-[10px] font-bold ${!hasLiveData ? 'bg-slate-200 text-slate-500' : hasShortage ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>{hasLiveData ? hasShortage ? `-${balance}` : `+${Math.abs(balance)}` : 'N/A'}</span>
          </button>
        })}
      </div>
    </section>
  )
}
