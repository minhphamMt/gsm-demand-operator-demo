import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestJson } from '@/shared/api/client'
import { acceptOffer, declineOffer, DriverApiError } from './driverApi'

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>()
  return { ...actual, requestJson: vi.fn() }
})

const request = vi.mocked(requestJson)

describe('driverApi', () => {
  beforeEach(() => request.mockReset())

  it('preserves the accepted-offer navigation contract', async () => {
    request.mockResolvedValue({
      participation: { id: 'part-1', campaign_id: 'campaign-1', status: 'ACCEPTED' },
      navigation_target: { type: 'Point', coordinates: [105.8, 21.03] },
    })

    await expect(acceptOffer('offer-1')).resolves.toMatchObject({
      participation: { id: 'part-1' },
      navigation_target: { coordinates: [105.8, 21.03] },
    })
    expect(request).toHaveBeenCalledWith('/driver/offers/offer-1/accept', { method: 'POST' })
  })

  it('uses the dedicated decline endpoint', async () => {
    request.mockResolvedValue({ offer_id: 'offer-1', status: 'DECLINED' })
    await expect(declineOffer('offer-1')).resolves.toEqual({ offer_id: 'offer-1', status: 'DECLINED' })
    expect(request).toHaveBeenCalledWith('/driver/offers/offer-1/decline', { method: 'POST' })
  })

  it('rejects an invalid backend response at the feature boundary', async () => {
    request.mockResolvedValue({ status: 'ACCEPTED' })
    await expect(acceptOffer('offer-1')).rejects.toBeInstanceOf(DriverApiError)
  })
})
