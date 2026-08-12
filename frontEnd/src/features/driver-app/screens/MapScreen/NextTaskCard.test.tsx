import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NextTaskCard } from './NextTaskCard'

const mocks = vi.hoisted(() => ({
  nav: { home: vi.fn(), navigate: vi.fn() },
  useOffers: vi.fn(),
}))

vi.mock('../../state/DriverAppContext', () => ({
  useDriverApp: () => ({ isNextTask: true, bannerBottom: '112px', nav: mocks.nav }),
}))

vi.mock('../../state/RouteContext', () => ({
  useRoute: () => ({ status: 'idle' }),
}))

vi.mock('../../data/useOffers', () => ({ useOffers: mocks.useOffers }))

describe('NextTaskCard', () => {
  beforeEach(() => {
    mocks.useOffers.mockReturnValue({
      pendingOffer: null,
      activeOffer: {
        id: 'offer-accepted',
        distance_m: 1250,
        eta_seconds: 420,
        campaigns: {
          bonus_amount: 15000,
          end_at: '2099-01-01T17:00:00Z',
          fare_multiplier: null,
        },
      },
    })
  })

  it('keeps the accepted offer visible on the next-task screen', () => {
    render(<NextTaskCard />)

    expect(screen.getByText('Có chương trình thưởng nóng đang mở gần bạn.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dẫn đường' })).toBeInTheDocument()
    expect(screen.getByText(/Cách bạn 1,3 km/)).toBeInTheDocument()
  })
})
