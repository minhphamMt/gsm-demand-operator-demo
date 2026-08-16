/* oxlint-disable react/only-export-components -- feature-local icon catalog */
import type { ComponentType } from 'react'
import {
  CalendarDays,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  Clock3,
  CornerUpRight,
  FileText,
  Gift,
  Leaf,
  LocateFixed,
  MapPin,
  MapPinOff,
  Navigation,
  Power,
  Speaker,
  Truck,
  Wifi,
  Zap,
  type LucideProps,
} from 'lucide-react'

type IconProps = Pick<LucideProps, 'className' | 'color' | 'size' | 'strokeWidth'>

function driverIcon(Icon: ComponentType<LucideProps>, defaults: IconProps = {}) {
  return function DriverIcon(props: IconProps) {
    return <Icon aria-hidden="true" {...defaults} {...props} />
  }
}

export const BackChevronIcon = driverIcon(ChevronLeft, { size: 22, strokeWidth: 2 })
export const CalendarIcon = driverIcon(CalendarDays, { size: 17, strokeWidth: 1.8 })
export const CategoryVehicleIcon = driverIcon(Truck, { size: 18, strokeWidth: 1.8 })
export const CheckCircleFilledIcon = driverIcon(CheckCircle, { color: '#2f9e5c', size: 17, strokeWidth: 2.3 })
export const ChevronDoubleUpIcon = driverIcon(ChevronsUp, { size: 19, strokeWidth: 2.2 })
export const ChevronRightIcon = driverIcon(ChevronRight, { size: 18, strokeWidth: 1.8 })
export const ClockIcon = driverIcon(Clock3, { size: 17, strokeWidth: 1.8 })
export const DocumentIcon = driverIcon(FileText, { size: 17, strokeWidth: 1.8 })
export const GiftIcon = driverIcon(Gift, { size: 18, strokeWidth: 1.8 })
export const LeafIcon = driverIcon(Leaf, { color: '#f2762e', size: 20, strokeWidth: 2 })
export const LightningIcon = driverIcon(Zap, { color: '#f0b429', size: 24, strokeWidth: 1.9 })
export const LocationDeniedIcon = driverIcon(MapPinOff, { color: '#e2483c', size: 17, strokeWidth: 2 })
export const NextTurnArrowIcon = driverIcon(CornerUpRight, { color: '#ffffff', size: 16, strokeWidth: 2.2 })
export const PinOutlineIcon = driverIcon(MapPin, { size: 16, strokeWidth: 1.8 })
export const PowerIcon = driverIcon(Power, { size: 20, strokeWidth: 2 })
export const SoundIcon = driverIcon(Speaker, { size: 20, strokeWidth: 1.8 })
export const TargetIcon = driverIcon(LocateFixed, { size: 21, strokeWidth: 1.8 })
export const TurnRightBigIcon = driverIcon(Navigation, { color: '#ffffff', size: 38, strokeWidth: 1.8 })
export const WifiIcon = driverIcon(Wifi, { color: '#0d0f10', size: 15, strokeWidth: 2 })

export function SignalBarsIcon() {
  return (
    <svg aria-hidden="true" width="17" height="13" viewBox="0 0 17 13" fill="none">
      <rect x="1" y="8" width="2.4" height="4" rx="1" fill="#0d0f10" />
      <rect x="5.2" y="6" width="2.4" height="6" rx="1" fill="#0d0f10" />
      <rect x="9.4" y="3.5" width="2.4" height="8.5" rx="1" fill="#0d0f10" />
      <rect x="13.6" y="1" width="2.4" height="11" rx="1" fill="#0d0f10" />
    </svg>
  )
}

export function CoinBadge({ size = 20 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        alignItems: 'center',
        background: '#f0b429',
        borderRadius: '50%',
        color: '#ffffff',
        display: 'inline-flex',
        flex: 'none',
        font: `800 ${Math.max(9, Math.round(size * 0.52))}px/1 'Be Vietnam Pro', sans-serif`,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      đ
    </span>
  )
}
