import type { DispatchMove } from '@/features/operator-data'

export type SimulatedDriverState =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'AVAILABLE'
  | 'CANCELLED'

export type SimulatedDispatchDriver = {
  id: string
  name: string
  profile: string
  progressPercent: number
  state: SimulatedDriverState
  vehiclePlate: string
}

const names = ['Minh Anh', 'Quang Huy', 'Thu Hà', 'Đức Long', 'Ngọc Mai', 'Hải Nam', 'Lan Chi', 'Tuấn Kiệt']
const profiles = ['Phản hồi nhanh', 'Tiêu chuẩn', 'Khởi hành chậm', 'Di chuyển cẩn trọng']

export const simulatedDriverStateLabels: Record<SimulatedDriverState, string> = {
  ACCEPTED: 'Đã nhận chuyến',
  ARRIVED: 'Đã đến nơi',
  AVAILABLE: 'Sẵn sàng phục vụ',
  CANCELLED: 'Lệnh đã hủy',
  DECLINED: 'Đã từ chối',
  EN_ROUTE: 'Đang di chuyển',
  PENDING: 'Chờ phản hồi',
}

const stableSeed = (value: string) => Array.from(value).reduce(
  (seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0,
  2166136261,
)

function driverState(move: DispatchMove, index: number): SimulatedDriverState {
  if (move.state === 'CANCELLED') return 'CANCELLED'
  const availableLimit = Math.min(move.plannedUnits, move.availableUnits)
  const arrivedLimit = Math.min(move.plannedUnits, Math.max(availableLimit, move.arrivedUnits))
  const acknowledgedLimit = Math.min(move.plannedUnits, Math.max(arrivedLimit, move.acknowledgedUnits))
  const declinedLimit = Math.min(move.plannedUnits, acknowledgedLimit + move.failedUnits)

  if (index < availableLimit) return 'AVAILABLE'
  if (index < arrivedLimit) return 'ARRIVED'
  if (index < acknowledgedLimit) {
    return move.state === 'EN_ROUTE' || move.state === 'ARRIVED' || move.state === 'AVAILABLE'
      ? 'EN_ROUTE'
      : 'ACCEPTED'
  }
  if (index < declinedLimit || move.state === 'FAILED') return 'DECLINED'
  return 'PENDING'
}

/** Deterministic demo identities keep a dispatch stable across every refresh. */
export function simulatedDispatchDrivers(batchId: string, move: DispatchMove): readonly SimulatedDispatchDriver[] {
  const seed = stableSeed(`${batchId}:${move.id}`)
  return Array.from({ length: Math.max(1, move.plannedUnits) }, (_, index) => {
    const driverSeed = seed + index * 7919
    const plateSuffix = String(10_000 + (driverSeed % 90_000)).padStart(5, '0')
    const state = driverState(move, index)
    return {
      id: `SIM-DRV-${String(driverSeed % 10_000).padStart(4, '0')}`,
      name: names[(seed + index * 3) % names.length]!,
      profile: profiles[(seed + index) % profiles.length]!,
      progressPercent: state === 'EN_ROUTE' ? 38 + (driverSeed % 45) : state === 'ARRIVED' || state === 'AVAILABLE' ? 100 : 0,
      state,
      vehiclePlate: `30E-${plateSuffix.slice(0, 3)}.${plateSuffix.slice(3)}`,
    }
  })
}

export function simulatedDriverMovementLabel(
  driver: SimulatedDispatchDriver,
  move: Pick<DispatchMove, 'distanceKm'>,
  sourceLabel: string,
  targetLabel: string,
) {
  if (driver.state === 'ACCEPTED') return `Đã nhận chuyến · Chuẩn bị rời ${sourceLabel}`
  if (driver.state === 'DECLINED') return 'Đã từ chối · Chờ tài xế thay thế'
  if (driver.state === 'EN_ROUTE') {
    const remainingKm = Math.max(0.1, move.distanceKm * (1 - driver.progressPercent / 100))
    return `Đang đến ${targetLabel} · Còn ${remainingKm.toFixed(1)} km`
  }
  if (driver.state === 'ARRIVED') return `Đã tới ${targetLabel} · Chờ xác nhận sẵn sàng`
  if (driver.state === 'AVAILABLE') return `Đã tới ${targetLabel} · Sẵn sàng phục vụ`
  if (driver.state === 'CANCELLED') return 'Lệnh đã hủy · Không còn di chuyển'
  return 'Chờ phản hồi lệnh điều chuyển'
}
