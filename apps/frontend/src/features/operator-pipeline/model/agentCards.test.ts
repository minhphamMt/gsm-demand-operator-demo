import { describe, expect, it } from 'vitest'

import { buildAgentCards, runningAgentCount } from '@/features/operator-pipeline/model/agentCards'
import type { PipelineRunRecord } from '@/features/operator-pipeline/model/pipelineRun'

const run: PipelineRunRecord = {
  run_id: 'RUN-1',
  status: 'RUNNING',
  agents: {
    situation_assessment: {
      status: 'DONE',
      message: 'Đã đánh giá 30 zone.',
      started_at: '2026-08-23T17:05:00.000+07:00',
      finished_at: '2026-08-23T17:05:03.400+07:00',
      capabilities: {
        forecast: { status: 'DONE', message: 'p50 sẵn sàng' },
        traffic: { status: 'WARNING', message: 'Mưa 2.1 mm/h' },
      },
    },
    dispatch: { status: 'RUNNING', message: 'Đang dựng chặng.', capabilities: {} },
  },
  tool_calls: [{ agent: 'situation_assessment', tool: 'run_forecast', ok: true, detail: '' }],
  plan_set: {
    plans: [{ plan_id: 'PLAN_B', strategy: 'BALANCED', move_count: 6, total_units: 42, total_cost: 180_000, total_eta_step_units: 18, residual_zone_count: 2 }],
    converged: true,
    distinct_plan_count: 1,
  },
  recommended_plan_id: 'PLAN_B',
  explanation: { text: 'Điều 42 xe.', layer: 'llm' },
}

describe('buildAgentCards', () => {
  it('always builds the seven cards in data-dependency order', () => {
    expect(buildAgentCards(run).map((card) => card.id)).toEqual([
      'forecast', 'traffic', 'supply', 'situation_assessment', 'dispatch', 'optimization', 'explanation',
    ])
  })

  it('reads each capability status from the parent agent report', () => {
    const cards = buildAgentCards(run)

    expect(cards.find((card) => card.id === 'traffic')?.status).toBe('WARNING')
    expect(cards.find((card) => card.id === 'traffic')?.message).toBe('Mưa 2.1 mm/h')
  })

  it('keeps an unreported capability pending rather than claiming it finished', () => {
    const cards = buildAgentCards({
      ...run,
      agents: { situation_assessment: { status: 'RUNNING', message: '', capabilities: {} } },
    })

    expect(cards.find((card) => card.id === 'supply')?.status).toBe('PENDING')
  })

  it('summarises the recommended plan on the downstream cards', () => {
    const cards = buildAgentCards(run)

    expect(cards.find((card) => card.id === 'dispatch')?.metrics).toContainEqual({ label: 'Chặng', value: '6' })
    expect(cards.find((card) => card.id === 'explanation')?.metrics).toContainEqual({ label: 'Nguồn văn bản', value: 'LLM' })
  })

  it('shows every card as pending when no run has started', () => {
    const cards = buildAgentCards(undefined)

    expect(cards).toHaveLength(7)
    expect(cards.every((card) => card.status === 'PENDING')).toBe(true)
    expect(runningAgentCount(cards)).toBe(0)
  })

  it('counts the agents currently running', () => {
    expect(runningAgentCount(buildAgentCards(run))).toBe(1)
  })

  // 02-technical-spec §2.5: AgentResult mang started_at/finished_at.
  it('reports how long an agent took from the two timestamps', () => {
    const cards = buildAgentCards(run)

    expect(cards.find((card) => card.id === 'situation_assessment')?.durationSeconds).toBe(3.4)
    expect(cards.find((card) => card.id === 'dispatch')?.durationSeconds).toBeNull()
  })

  it('ignores a reversed or unparsable pair of timestamps instead of showing a negative time', () => {
    const broken = buildAgentCards({
      ...run,
      agents: {
        situation_assessment: {
          status: 'DONE',
          message: '',
          capabilities: {},
          started_at: '2026-08-23T17:05:03+07:00',
          finished_at: '2026-08-23T17:05:00+07:00',
        },
      },
    })

    expect(broken.find((card) => card.id === 'situation_assessment')?.durationSeconds).toBeNull()
  })
})
