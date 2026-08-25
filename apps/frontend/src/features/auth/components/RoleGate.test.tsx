import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { RootRedirect } from '@/features/auth/components/RoleGate'
import { routes } from '@/shared/config/routes'

describe('RootRedirect', () => {
  afterEach(() => cleanup())

  it.each([routes.root, routes.login])('opens the moderator operations page from %s', async (entryPath) => {
    render(
      <MemoryRouter initialEntries={[entryPath]}>
        <Routes>
          <Route element={<RootRedirect />} path={routes.root} />
          <Route element={<RootRedirect />} path={routes.login} />
          <Route element={<h1>Moderator operations</h1>} path={routes.operationsV2} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Moderator operations' })).toBeInTheDocument()
  })
})
