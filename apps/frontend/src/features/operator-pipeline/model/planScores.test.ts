import { describe, expect, it } from 'vitest'

import { costBand, scoreMetric } from '@/features/operator-pipeline/model/planScores'
import type { PipelinePlan } from '@/features/operator-pipeline/model/pipelineRun'

const plan = (id: string, cost: number, units: number, residual = 2): PipelinePlan => ({
  plan_id: id,
  strategy: id,
  move_count: 6,
  total_units: units,
  total_cost: cost,
  total_eta_step_units: 18,
  residual_zone_count: residual,
})

const plans = [plan('A', 120_000, 30), plan('B', 150_000, 42), plan('C', 180_000, 60)]

describe('scoreMetric', () => {
  it('gives the cheapest plan the best score and the priciest the worst', () => {
    expect(scoreMetric(plans, 'total_cost', 120_000)).toBe('GOOD')
    expect(scoreMetric(plans, 'total_cost', 150_000)).toBe('MEDIUM')
    expect(scoreMetric(plans, 'total_cost', 180_000)).toBe('BAD')
  })

  it('reverses the direction for metrics where more is better', () => {
    expect(scoreMetric(plans, 'total_units', 60)).toBe('GOOD')
    expect(scoreMetric(plans, 'total_units', 30)).toBe('BAD')
  })

  // Điểm là thứ hạng trong nhóm; một phương án đơn lẻ thì không có gì để so.
  it('refuses to score a single plan', () => {
    expect(scoreMetric([plans[0]!], 'total_cost', 120_000)).toBeNull()
  })

  it('refuses to score when every plan has the same value', () => {
    const flat = [plan('A', 100, 10), plan('B', 100, 10)]
    expect(scoreMetric(flat, 'total_cost', 100)).toBeNull()
  })
})

describe('costBand', () => {
  it('maps the cost ranking onto the LOW/MEDIUM/HIGH band of the spec', () => {
    expect(costBand(plans, plans[0]!)).toBe('LOW')
    expect(costBand(plans, plans[1]!)).toBe('MEDIUM')
    expect(costBand(plans, plans[2]!)).toBe('HIGH')
  })

  it('has no band when the strategies converged', () => {
    expect(costBand([plans[0]!], plans[0]!)).toBeNull()
  })
})
