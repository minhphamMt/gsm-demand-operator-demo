import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/shared/components/ui/Button'
import { Dialog } from '@/shared/components/ui/Dialog'

function DialogHarness() {
  const [isOpen, setOpen] = useState(false)
  return <><Button onClick={() => setOpen(true)}>Mở xác nhận</Button><Dialog isOpen={isOpen} onClose={() => setOpen(false)} title="Xác nhận thao tác"><Button variant="secondary">Quay lại</Button><Button>Xác nhận</Button></Dialog></>
}

describe('Dialog keyboard behavior', () => {
  it('moves focus inside, traps Tab, closes with Escape and restores focus', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    const trigger = screen.getByRole('button', { name: 'Mở xác nhận' })
    await user.click(trigger)

    const close = screen.getByRole('button', { name: 'Đóng hộp thoại' })
    await waitFor(() => expect(close).toHaveFocus())
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
