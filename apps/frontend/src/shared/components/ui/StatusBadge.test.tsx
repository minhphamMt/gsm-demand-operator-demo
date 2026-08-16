import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StatusBadge } from '@/shared/components/ui/StatusBadge'

describe('StatusBadge Vietnamese labels', () => {
  afterEach(cleanup)

  it.each([
    ['Draft', 'Bản nháp'],
    ['Approved', 'Đã duyệt'],
    ['Active', 'Đang chạy'],
    ['Completed', 'Hoàn thành'],
    ['Open', 'Đang chờ'],
    ['Failed', 'Thất bại'],
  ])('maps %s to %s', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
