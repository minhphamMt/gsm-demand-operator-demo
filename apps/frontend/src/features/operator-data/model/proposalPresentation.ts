import type { Proposal } from '@/features/operator-data/model/types'

const generatorLabels: Record<Proposal['generatorType'], string> = {
  AGENT: 'Gợi ý mô phỏng từ model',
  MANUAL: 'Gợi ý nhập thủ công',
  MOCK: 'Gợi ý mô phỏng',
  RULE_BASED: 'Gợi ý theo luật',
}

export function getProposalGeneratorLabel(generatorType: Proposal['generatorType']) {
  return generatorLabels[generatorType]
}

export function getProposalCreationLabel(generatorType: Proposal['generatorType']) {
  return generatorType === 'AGENT' ? 'Mô phỏng model tạo' : generatorType === 'MOCK' ? 'Mô phỏng tạo' : 'Hệ thống ghi nhận'
}
