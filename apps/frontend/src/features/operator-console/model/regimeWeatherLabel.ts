// Nhãn thời tiết của regime đang xem — chuỗi duy nhất mà thanh trên cùng còn hiển thị.
//
// Trước đây module này còn dựng một `heading` dạng "KỊCH BẢN · MƯA GIỜ CAO ĐIỂM 25/09 18:00",
// kèm cả một `Intl.DateTimeFormat`. Không nơi nào render nó, và tham số `sourceAt` tồn tại
// chỉ để nuôi nó — nên cả hai được gỡ cùng lúc với đợt dọn thanh trên cùng.

const NORMAL_WEATHER = 'Bình thường'

const regimeWeather: Readonly<Record<string, string>> = {
  normal: NORMAL_WEATHER,
  peak: 'Giờ cao điểm',
  rain: 'Mưa',
  rain_peak: 'Mưa lớn · giờ cao điểm',
}

/** Regime lạ rơi về "bình thường" thay vì hiện mã thô — nhãn này nằm ở chỗ dễ thấy nhất. */
export function regimeWeatherLabel(regime: string): string {
  return regimeWeather[regime] ?? NORMAL_WEATHER
}
