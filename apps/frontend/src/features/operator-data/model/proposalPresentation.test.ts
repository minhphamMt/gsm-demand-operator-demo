import { describe, expect, it } from 'vitest'

import { getProposalCreationLabel, getProposalGeneratorLabel } from '@/features/operator-data/model/proposalPresentation'

describe('proposal provenance labels', () => {
  it('does not describe manual or mock proposals as model output', () => {
    expect(getProposalGeneratorLabel('MANUAL')).toBe('Gợi ý nhập thủ công')
    expect(getProposalCreationLabel('MANUAL')).toBe('Hệ thống ghi nhận')
    expect(getProposalGeneratorLabel('MOCK')).toBe('Gợi ý mô phỏng')
  })

  it('marks current AGENT output as simulated until a real model is integrated', () => {
    expect(getProposalGeneratorLabel('AGENT')).toBe('Gợi ý mô phỏng từ model')
    expect(getProposalCreationLabel('AGENT')).toBe('Mô phỏng model tạo')
  })
})
