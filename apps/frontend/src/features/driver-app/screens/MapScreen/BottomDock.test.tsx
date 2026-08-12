import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BottomDock } from './BottomDock'
import { DriverAppProvider } from '../../state/DriverAppContext'

vi.mock('../../data/useDriverState', () => ({
  useDriverState: () => ({ isOnline: true, isToggling: false }),
}))

describe('BottomDock navigation', () => {
  it('lets the driver return home after opening reward areas', () => {
    render(<DriverAppProvider><BottomDock /></DriverAppProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Khu vực thưởng' }))
    const home = screen.getByRole('button', { name: 'Màn hình chính' })
    expect(home).toBeInTheDocument()

    fireEvent.click(home)
    expect(screen.queryByRole('button', { name: 'Màn hình chính' })).not.toBeInTheDocument()
  })
})
