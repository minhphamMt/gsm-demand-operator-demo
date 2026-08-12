import { describe, expect, it } from 'vitest'

import { scenarioPresentation } from './scenarioPresentation'

describe('scenarioPresentation', () => {
  it('does not label normal source data as rain peak and shows its replay date', () => {
    expect(scenarioPresentation('normal', '2026-09-25T02:50:00+07:00')).toEqual({
      heading: 'KỊCH BẢN · BÌNH THƯỜNG 25/09 02:50',
      weather: 'Bình thường',
    })
  })

  it('keeps the rain-peak label only for that regime', () => {
    expect(scenarioPresentation('rain_peak', '2026-09-25T18:00:00+07:00').heading)
      .toBe('KỊCH BẢN · MƯA GIỜ CAO ĐIỂM 25/09 18:00')
  })
})
