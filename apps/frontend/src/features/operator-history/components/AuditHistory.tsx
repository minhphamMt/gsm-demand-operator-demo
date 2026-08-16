import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { AuditFilterForm } from '@/features/operator-history/components/AuditFilterForm'
import { AuditTable } from '@/features/operator-history/components/AuditTable'
import { auditApiFilters, auditFiltersFromUrl, auditFiltersToUrl, type AuditUrlFilters } from '@/features/operator-history/model/auditFilters'
import { auditPageQuery } from '@/features/operator-data'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { DataRefreshState, EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'

export function AuditHistory() {
  const [search, setSearch] = useSearchParams()
  const filters = auditFiltersFromUrl(search)
  const audit = useQuery(auditPageQuery(auditApiFilters(filters)))
  const update = (next: AuditUrlFilters) => setSearch(auditFiltersToUrl(next))

  if (audit.isPending) return <Skeleton className="h-80" />
  if (audit.isError && audit.data === undefined) return <ErrorState onRetry={() => void audit.refetch()} />

  const page = audit.data
  return <div className="nf-workspace-stack">
    <DataRefreshState hasError={audit.isRefetchError} isFetching={audit.isFetching} onRetry={() => void audit.refetch()} />
    <div className="nf-quick-facts"><span><b>{page.total}</b> bản ghi</span><span>Trang <b>{page.totalPages ? `${page.page}/${page.totalPages}` : '0/0'}</b></span><span><b>Không thể sửa/xóa</b></span></div>
    <AuditFilterForm filters={filters} onApply={update} onReset={() => update({ action: '', actorType: '', entityId: '', entityType: '', from: '', page: 1, pageSize: 25, to: '' })} />
    <Card className="nf-workspace-panel p-0">
      <div className="flex flex-col justify-between gap-3 px-5 py-3 sm:flex-row sm:items-center"><h2 className="font-semibold text-slate-950">Dòng sự kiện</h2><p className="text-xs font-semibold tabular-nums text-slate-500">{page.total} bản ghi</p></div>
      {page.items.length ? <AuditTable entries={page.items} /> : <div className="border-t border-slate-200 p-6"><EmptyState title="Không có bản ghi phù hợp" description="Thử xóa bớt bộ lọc hoặc chọn khoảng ngày khác." /></div>}
      <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row">
        <p className="text-sm text-slate-600">Trang {page.totalPages ? page.page : 0}/{page.totalPages} · tối đa {page.pageSize} dòng/trang</p>
        <div className="flex gap-2"><Button disabled={!page.hasPreviousPage} variant="secondary" onClick={() => update({ ...filters, page: filters.page - 1 })}><ChevronLeft className="size-4" />Trang trước</Button><Button disabled={!page.hasNextPage} variant="secondary" onClick={() => update({ ...filters, page: filters.page + 1 })}>Trang sau<ChevronRight className="size-4" /></Button></div>
      </div>
    </Card>
  </div>
}
