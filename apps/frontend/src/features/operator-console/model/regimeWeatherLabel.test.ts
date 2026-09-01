import { describe, expect, it } from 'vitest'

import { regimeWeatherLabel } from './regimeWeatherLabel'

describe('regimeWeatherLabel', () => {
  it('không gắn nhãn mưa cao điểm cho dữ liệu bình thường', () => {
    expect(regimeWeatherLabel('normal')).toBe('Bình thường')
  })

  it('giữ nhãn mưa giờ cao điểm cho đúng regime đó', () => {
    // `rain_peak` là thước đo thành công chính (CLAUDE.md §3 #6), nên nhãn của nó không được
    // lẫn với ba regime còn lại.
    expect(regimeWeatherLabel('rain_peak')).toBe('Mưa lớn · giờ cao điểm')
    expect(regimeWeatherLabel('rain')).toBe('Mưa')
    expect(regimeWeatherLabel('peak')).toBe('Giờ cao điểm')
  })

  it('regime lạ rơi về bình thường chứ không hiện mã thô', () => {
    expect(regimeWeatherLabel('storm_surge')).toBe('Bình thường')
  })
})
