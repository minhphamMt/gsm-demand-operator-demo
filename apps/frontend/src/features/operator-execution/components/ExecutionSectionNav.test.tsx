import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { ExecutionSectionNav } from './ExecutionSectionNav'

describe('ExecutionSectionNav', () => {
  afterEach(cleanup)

  it('keeps the plan tab active for the running plan detail page', () => {
    render(<MemoryRouter initialEntries={['/operator/execution/plan/PLAN-017']}><ExecutionSectionNav /></MemoryRouter>)

    expect(screen.getByRole('link', { name: 'Phương án' })).toHaveClass('is-active')
    expect(screen.getByRole('link', { name: 'Offer' })).not.toHaveClass('is-active')
  })

  it('activates the offer tab for a campaign offer page', () => {
    render(<MemoryRouter initialEntries={['/operator/execution/offers/CMP-017']}><ExecutionSectionNav /></MemoryRouter>)

    expect(screen.getByRole('link', { name: 'Offer' })).toHaveClass('is-active')
    expect(screen.getByRole('link', { name: 'Phương án' })).not.toHaveClass('is-active')
  })
})
