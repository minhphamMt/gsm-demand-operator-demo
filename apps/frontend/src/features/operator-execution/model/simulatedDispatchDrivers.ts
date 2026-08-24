import type { DispatchMove } from '@/features/operator-data'

export type SimulatedDispatchDriver = {
  batteryPercent: number
  id: string
  name: string
  profile: string
  vehiclePlate: string
}

const names = ['Minh Anh', 'Quang Huy', 'Thu Hà', 'Đức Long', 'Ngọc Mai', 'Hải Nam', 'Lan Chi', 'Tuấn Kiệt']
const profiles = ['Phản hồi nhanh', 'Tiêu chuẩn', 'Khởi hành chậm', 'Di chuyển cẩn trọng']

const stableSeed = (value: string) => Array.from(value).reduce(
  (seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0,
  2166136261,
)

/** Deterministic demo identities keep a dispatch stable across every 15-second refresh. */
export function simulatedDispatchDrivers(
  batchId: string,
  move: Pick<DispatchMove, 'id' | 'plannedUnits'>,
): readonly SimulatedDispatchDriver[] {
  const seed = stableSeed(`${batchId}:${move.id}`)
  return Array.from({ length: Math.max(1, move.plannedUnits) }, (_, index) => {
    const driverSeed = seed + index * 7919
    const plateSuffix = String(10_000 + (driverSeed % 90_000)).padStart(5, '0')
    return {
      batteryPercent: 52 + (driverSeed % 43),
      id: `SIM-DRV-${String(driverSeed % 10_000).padStart(4, '0')}`,
      name: names[(seed + index * 3) % names.length]!,
      profile: profiles[(seed + index) % profiles.length]!,
      vehiclePlate: `30E-${plateSuffix.slice(0, 3)}.${plateSuffix.slice(3)}`,
    }
  })
}
