import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { NotFoundPage } from '@/pages/not-found/NotFoundPage'
import { routes } from '@/shared/config/routes'

describe('NotFoundPage', () => {
  it('returns the operator to the dashboard', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về tổng quan vận hành' })).toHaveAttribute('href', routes.operator.root)
  })
})
