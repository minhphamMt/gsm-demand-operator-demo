import type { Zone } from '@/features/operator-data/model/types'

export type ObservedZone = Zone & { dataStatus: 'live'; demand: number; supply: number }

export function hasOperationalObservation(zone: Zone): zone is ObservedZone {
  return zone.dataStatus === 'live' && typeof zone.demand === 'number' && typeof zone.supply === 'number'
}

export function operationalGapFor(zone: Pick<Zone, 'demand' | 'rainMmH' | 'supply'>): number | null {
  if (typeof zone.demand !== 'number' || typeof zone.supply !== 'number') return null
  return Math.ceil(zone.demand - zone.supply)
}
