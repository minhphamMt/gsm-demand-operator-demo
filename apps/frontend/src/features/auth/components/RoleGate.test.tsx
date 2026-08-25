import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RootRedirect } from '@/features/auth/components/RoleGate'
import { useAuth } from '@/features/auth/useAuth'
import { routes } from '@/shared/config/routes'

vi.mock('@/features/auth/useAuth', () => ({ useAuth: vi.fn() }))

describe('RootRedirect', () => {
  afterEach(() => cleanup())

  it('opens the classic operator dashboard after demo auto-login', async () => {
    vi.mocked(useAuth).mockReturnValue({
      error: null,
      identity: { email: 'operator@example.com', id: 'operator-1', role: 'OPERATOR' },
      signIn: vi.fn(),
      signOut: vi.fn(),
      status: 'authenticated',
    })

    render(
      <MemoryRouter initialEntries={[routes.root]}>
        <Routes>
          <Route element={<RootRedirect />} path={routes.root} />
          <Route element={<h1>Classic operator dashboard</h1>} path={routes.operator.root} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Classic operator dashboard' })).toBeInTheDocument()
  })
})
