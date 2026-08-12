import type { Zone } from '@/features/operator-data/model/types'

export function operationalGapFor(zone: Pick<Zone, 'demand' | 'rainMmH' | 'supply'>) {
  return Math.ceil(zone.demand - zone.supply)
}
