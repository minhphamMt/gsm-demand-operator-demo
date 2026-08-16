import { forecastRunForHorizon, type AiSnapshotStatus, type ForecastHorizon } from '@/features/operator-data'

type ForecastRunStatusProps = {
  forecast: AiSnapshotStatus | undefined
  horizon: ForecastHorizon
  isExact: boolean
}

export function ForecastRunStatus({ forecast, horizon, isExact }: ForecastRunStatusProps) {
  const run = forecastRunForHorizon(forecast, horizon)
  const status = run?.status ?? forecast?.forecastStatus
  if (isExact && status === 'COMPLETED') return <p className="nf-forecast-run is-ready" role="status">Dự báo +{horizon} phút đã xác thực · {forecast?.modelVersion ?? 'model không xác định'}</p>
  if (isExact && status === 'FALLBACK') return <p className="nf-forecast-run is-warning" role="alert">Dự báo +{horizon} phút đang dùng fallback; kiểm tra nguồn/model trước khi tạo phương án.</p>
  if (status === 'RUNNING') return <p className="nf-forecast-run" role="status">ForecastRun đang xử lý; chưa có kết quả được xác thực.</p>
  if (status === 'FAILED') return <p className="nf-forecast-run is-error" role="alert">ForecastRun thất bại; dữ liệu forecast cũ không được dùng thay thế.</p>
  if (status === 'SUPERSEDED') return <p className="nf-forecast-run is-warning" role="alert">ForecastRun đã bị thay thế bởi snapshot mới; hãy chạy lại forecast.</p>
  return <p className="nf-forecast-run is-warning" role="status">Chưa có ForecastRun hoàn chỉnh cho horizon +{horizon} phút.</p>
}
