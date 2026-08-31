import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OpsHeader } from '@/features/operator-console/components/OpsHeader'

// Trang Điều hành không còn thanh sáng của shell, nên đầu trang tối là lối duy nhất để rời
// trang, xem thông báo và đăng xuất. Mất một trong ba là người vận hành bị kẹt trong màn hình.

function renderHeader(props: Partial<Parameters<typeof OpsHeader>[0]> = {}, path = '/operator') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OpsHeader
        isRefreshing={false}
        onOpenAgentFlow={() => {}}
        onToggleTheme={() => {}}
        theme="dark"
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('OpsHeader', () => {
  afterEach(cleanup)

  it('carries the operator navigation and marks the dashboard as current', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'Đang vận hành' })).toHaveAttribute('href', '/operator/execution')
    expect(screen.getByRole('link', { name: 'So sánh kịch bản' })).toHaveAttribute('href', '/operator/reports')
    expect(screen.getByRole('link', { name: 'Nhật ký' })).toHaveAttribute('href', '/operator/history')
    expect(screen.getByRole('link', { name: 'Điều hành' })).toHaveClass('is-active')
  })

  it('signs the operator out and shows who is signed in', async () => {
    const onSignOut = vi.fn()
    renderHeader({ onSignOut, userEmail: 'operator.test@example.com' })

    expect(screen.getByTitle('operator.test@example.com')).toHaveTextContent('OP')

    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))

    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('renders the notification control handed down by the shell', () => {
    renderHeader({ notifications: <button type="button">Thông báo</button> })

    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeInTheDocument()
  })

  it('leaves the account cluster out when the shell hands nothing down', () => {
    const { container } = renderHeader()

    expect(container.querySelector('.nf-ops-account')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).not.toBeInTheDocument()
  })
})
