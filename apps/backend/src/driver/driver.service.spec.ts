import { ConflictException, NotFoundException } from '@nestjs/common'

import { DriverService } from './driver.service'

function query(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    select: jest.fn(),
  }
  chain.eq.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  return chain
}

function serviceWith(options: {
  campaign?: ReturnType<typeof query>
  offer?: ReturnType<typeof query>
  participation?: ReturnType<typeof query>
  rpcError?: unknown
  demoMode?: boolean
}) {
  const offer = options.offer ?? query({
    data: { id: 'offer-1', campaign_id: 'campaign-1', status: 'SENT', expires_at: '2099-01-01T00:00:00Z' },
    error: null,
  })
  const participation = options.participation ?? query({
    data: { id: 'part-1', campaign_id: 'campaign-1', status: 'ACCEPTED' },
    error: null,
  })
  const campaign = options.campaign ?? query({
    data: { navigation_target_geojson: { type: 'Point', coordinates: [105.8, 21.03] } },
    error: null,
  })
  const rpc = jest.fn().mockResolvedValue({ data: 'offer-1', error: options.rpcError ?? null })
  const db = {
    client: {
      from: jest.fn((table: string) => ({
        driver_offers: offer,
        campaign_participations: participation,
        campaigns_driver_v: campaign,
      })[table]),
      rpc,
    },
    unwrap: jest.fn((data: unknown, error: unknown) => {
      if (error) throw error
      if (data === null) throw new Error('missing data')
      return data
    }),
  }
  const config = { get: jest.fn(() => options.demoMode ? 'true' : 'false') }
  return { db, rpc, service: new DriverService(db as never, config as never) }
}

describe('DriverService', () => {
  it('accepts through the shared atomic RPC and returns the original driver contract', async () => {
    const { rpc, service } = serviceWith({})

    await expect(service.acceptOffer('offer-1', 'driver-1', 'request-1')).resolves.toEqual({
      participation: { id: 'part-1', campaign_id: 'campaign-1', status: 'ACCEPTED' },
      navigation_target: { type: 'Point', coordinates: [105.8, 21.03] },
    })
    expect(rpc).toHaveBeenCalledWith('respond_to_offer', {
      p_actor_type: 'DRIVER',
      p_driver_id: 'driver-1',
      p_offer_id: 'offer-1',
      p_request_id: 'request-1',
      p_response: 'ACCEPTED',
    })
  })

  it('declines through the same RPC without creating a client-side state transition', async () => {
    const { rpc, service } = serviceWith({})

    await expect(service.declineOffer('offer-1', 'driver-1', 'request-2')).resolves.toEqual({
      offer_id: 'offer-1',
      status: 'DECLINED',
    })
    expect(rpc).toHaveBeenCalledWith('respond_to_offer', expect.objectContaining({ p_response: 'DECLINED' }))
  })

  it('does not reveal an offer belonging to another driver', async () => {
    const { service } = serviceWith({ offer: query({ data: null, error: null }) })
    await expect(service.acceptOffer('offer-1', 'driver-2', 'request-3')).rejects.toMatchObject({
      constructor: NotFoundException,
      response: expect.objectContaining({ code: 'OFFER_NOT_FOUND' }),
    })
  })

  it('maps a full campaign race to the driver error vocabulary', async () => {
    const { service } = serviceWith({
      rpcError: { code: '23514', message: 'Campaign target is already full' },
    })
    await expect(service.acceptOffer('offer-1', 'driver-1', 'request-4')).rejects.toMatchObject({
      constructor: ConflictException,
      response: expect.objectContaining({ code: 'CAMPAIGN_TARGET_REACHED' }),
    })
  })

  it('keeps the reset endpoint unavailable outside explicit demo mode', async () => {
    const { service } = serviceWith({})
    await expect(service.resetDemoOffer('driver-1', 'request-5')).rejects.toMatchObject({
      constructor: NotFoundException,
    })
  })
})
