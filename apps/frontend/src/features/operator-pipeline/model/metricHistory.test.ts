import { describe, expect, it } from 'vitest'

import { appendMetricPoint, maxMetricPoints, metricSeriesFor, type MetricPoint } from '@/features/operator-pipeline/model/metricHistory'

const point = (sourceAt: string, residualGap: number): MetricPoint => ({
  sourceAt,
  residualGap,
  fulfillmentRatePct: 90,
  avgWaitProxy: 5,
  demandPressurePct: 60,
})

describe('appendMetricPoint', () => {
  it('appends a new replay step', () => {
    const history = appendMetricPoint([point('17:00', 10)], point('17:05', 12))

    expect(history.map((entry) => entry.sourceAt)).toEqual(['17:00', '17:05'])
  })

  it('replaces the point of a step already recorded', () => {
    const history = appendMetricPoint([point('17:00', 10)], point('17:00', 18))

    expect(history).toHaveLength(1)
    expect(history[0]?.residualGap).toBe(18)
  })

  it('keeps at most the configured number of points', () => {
    const history = Array.from({ length: maxMetricPoints + 6 }).reduce<readonly MetricPoint[]>(
      (entries, _value, index) => appendMetricPoint(entries, point(`step-${index}`, index)),
      [],
    )

    expect(history).toHaveLength(maxMetricPoints)
    expect(history[0]?.sourceAt).toBe('step-6')
  })
})

describe('metricSeriesFor', () => {
  it('describes the unit of each tracked metric', () => {
    expect(metricSeriesFor('avgWaitProxy').unit).toBe('phút')
    expect(metricSeriesFor('fulfillmentRatePct').label).toBe('Tỷ lệ đáp ứng')
  })
})
