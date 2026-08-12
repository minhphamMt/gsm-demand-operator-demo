import { auditActionLabels, type AuditAction, type AuditFilters } from '@/features/operator-data'

export type AuditUrlFilters = {
  action: '' | AuditAction
  actorType: string
  entityId: string
  entityType: string
  from: string
  page: number
  pageSize: number
  to: string
}

const positiveInteger = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
const actions = new Set(Object.keys(auditActionLabels))

export function auditFiltersFromUrl(search: URLSearchParams): AuditUrlFilters {
  const action = search.get('action') ?? ''
  return {
    action: actions.has(action) ? action as AuditAction : '',
    actorType: search.get('actorType') ?? '',
    entityId: search.get('entityId') ?? '',
    entityType: search.get('entityType') ?? '',
    from: search.get('from') ?? '',
    page: positiveInteger(search.get('page'), 1),
    pageSize: Math.min(100, positiveInteger(search.get('pageSize'), 25)),
    to: search.get('to') ?? '',
  }
}

export function auditApiFilters(filters: AuditUrlFilters): AuditFilters {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.actorType ? { actorType: filters.actorType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.from ? { from: `${filters.from}T00:00:00.000Z` } : {}),
    ...(filters.to ? { to: `${filters.to}T23:59:59.999Z` } : {}),
  }
}

export function auditFiltersToUrl(filters: AuditUrlFilters) {
  const search = new URLSearchParams()
  for (const key of ['entityId', 'entityType', 'action', 'actorType', 'from', 'to'] as const) if (filters[key]) search.set(key, String(filters[key]))
  if (filters.page !== 1) search.set('page', String(filters.page))
  if (filters.pageSize !== 25) search.set('pageSize', String(filters.pageSize))
  return search
}
