interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

export function SignalBarsIcon({ color = '#0d0f10' }: IconProps) {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill={color}>
      <rect x="0" y="8" width="3" height="4" rx="1" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
      <rect x="10" y="3" width="3" height="9" rx="1" />
      <rect x="15" y="0" width="3" height="12" rx="1" />
    </svg>
  );
}

export function WifiIcon({ color = '#0d0f10' }: IconProps) {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round">
      <path d="M1 4.2a10 10 0 0 1 14 0" />
      <path d="M3.7 7a6.2 6.2 0 0 1 8.6 0" />
      <circle cx="8" cy="10" r="1.1" fill={color} stroke="none" />
    </svg>
  );
}

export function WarningPulseIcon({ color = '#1b2225' }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 10h4l2.5-6 4 12L14 10h5" />
    </svg>
  );
}

export function UndoIcon({ color = '#1b2225' }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
      <path d="M17 4.5v4h-4" />
      <path d="M17 8.5A7.4 7.4 0 1 0 16 14" />
    </svg>
  );
}

export function TargetIcon({ color = '#1b2225' }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.7">
      <circle cx="10" cy="10" r="4.2" />
      <path d="M10 1v3M10 16v3M1 10h3M16 10h3" strokeLinecap="round" />
    </svg>
  );
}

export function HamburgerIcon({ color = '#1b2225' }: IconProps) {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" stroke={color} strokeWidth="2" strokeLinecap="round">
      <path d="M1 1h18M1 7h18M1 13h18" />
    </svg>
  );
}

export function PowerIcon({ size = 21, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <path d="M10 2v7" />
      <path d="M15.2 4.6a7 7 0 1 1-10.4 0" />
    </svg>
  );
}

export function PinOutlineIcon({ size = 19, color = '#8b9296', strokeWidth = 1.7 }: IconProps & { strokeWidth?: number }) {
  const scale = size / 20;
  return (
    <svg width={size} height={size * 0.98} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={strokeWidth / scale} strokeLinejoin="round">
      <path d="M10 17.5S3 12.6 3 7.9A4 4 0 0 1 10 5.3 4 4 0 0 1 17 7.9c0 4.7-7 9.6-7 9.6Z" />
    </svg>
  );
}

export function LeafIcon({ size = 17, color = '#f2762e' }: IconProps) {
  const h = (size * 19) / 17;
  return (
    <svg width={size} height={h} viewBox="0 0 17 19" fill={color}>
      <path d="M8.6 0C9 3.2 6 4.4 5 7.2c-.4-.8-.5-1.7-.4-2.6C2.3 6.2 1 8.6 1 11.2A7.6 7.6 0 0 0 16.2 12c0-4.2-2.6-5.9-3.6-9.1-.6 1.2-1.4 1.9-2.3 2.3C10.6 3.4 9.9 1.4 8.6 0Z" />
    </svg>
  );
}

export function CreateOrderIcon({ color = '#12b8c6' }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round">
      <path d="M3 15.5h18v3.2a1 1 0 0 1-1 1h-2.2a1 1 0 0 1-1-1v-.9H7.2v.9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3.2Z" />
      <path d="M4.6 15.3 6.4 9a2 2 0 0 1 1.9-1.4h7.4A2 2 0 0 1 17.6 9l1.8 6.3" />
    </svg>
  );
}

export function MyTripsIcon({ color = '#12b8c6' }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.7">
      <rect x="2.4" y="4.4" width="15.2" height="12" rx="2.4" />
      <path d="M2.4 8.4h15.2M6.4 2.4v3.4M13.6 2.4v3.4" strokeLinecap="round" />
    </svg>
  );
}

export function LightningIcon({ color = '#12b8c6' }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 20 20" fill={color}>
      <path d="M11 1 3.5 11.4H9L8.6 19 16.5 8.3H10.7L11 1Z" />
    </svg>
  );
}

export function SettingsIcon({ color = '#12b8c6' }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round">
      <path d="M2 6h11M16 6h2M2 14h4M9 14h9" />
      <circle cx="14.6" cy="6" r="2.1" />
      <circle cx="7.4" cy="14" r="2.1" />
    </svg>
  );
}

export function ChevronDoubleUpIcon({ color = '#12b8c6' }: IconProps) {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.6 6.6 7 1.6l5.4 5" />
      <path d="M1.6 10.4 7 5.4l5.4 5" />
    </svg>
  );
}

export function BackChevronIcon({ color = '#1b2225' }: IconProps) {
  return (
    <svg width="9" height="15" viewBox="0 0 9 15" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 1 1.5 7.5l6 6.5" />
    </svg>
  );
}

export function LocationDeniedIcon() {
  return (
    <svg width="16" height="15" viewBox="0 0 16 15" fill="#e2483c">
      <path d="M8 0 16 14.4H0L8 0Z" />
      <rect x="7.1" y="5" width="1.8" height="5" rx=".9" fill="#fff" />
      <circle cx="8" cy="12" r="1" fill="#fff" />
    </svg>
  );
}

export function ClockIcon({ size = 15, color = '#8b9296' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.6" />
      <path d="M8 4.4V8l2.6 1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon({ color = '#8b9296' }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
      <rect x="1.8" y="3.4" width="12.4" height="10.8" rx="2" />
      <path d="M1.8 6.6h12.4M5.2 1.6v2.8M10.8 1.6v2.8" strokeLinecap="round" />
    </svg>
  );
}

export function CategoryVehicleIcon({ color = '#12b8c6', withCabin = true }: IconProps & { withCabin?: boolean }) {
  return (
    <svg width="20" height="16" viewBox="0 0 22 16" fill={color}>
      <circle cx="4.5" cy="12" r="3.2" />
      <circle cx="17" cy="12" r="3.2" />
      <path d="M4.5 12 8 4h5l4 8" stroke={color} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
      {withCabin && <rect x="11" y="1" width="7" height="5" rx="1.4" />}
    </svg>
  );
}

export function ChevronRightIcon({ color = '#b6bcbe' }: IconProps) {
  return (
    <svg width="7" height="11" viewBox="0 0 7 11" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1l4.4 4.5L1 10" />
    </svg>
  );
}

export function GiftIcon({ color = '#1b2225' }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
      <rect x="1.8" y="5.4" width="12.4" height="8.8" rx="1.6" />
      <path d="M8 5.4v8.8M1.8 8.8h12.4" />
      <path d="M8 5.4C6.6 2.4 3 2.4 3.6 4.4c.4 1.2 2.6 1 4.4 1Zm0 0c1.4-3 5-3 4.4-1-.4 1.2-2.6 1-4.4 1Z" />
    </svg>
  );
}

export function CheckCircleFilledIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="#2f9e5c">
      <circle cx="9" cy="9" r="9" />
      <path d="M5 9.2l2.6 2.6L13 6.4" stroke="#fff" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DocumentIcon({ color = '#1b2225' }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <rect x="2.6" y="1.8" width="10.8" height="12.4" rx="1.8" />
      <path d="M5.4 5.4h5.2M5.4 8h5.2M5.4 10.6h3" />
    </svg>
  );
}

export function TurnRightBigIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 33V19a5 5 0 0 1 5-5h11" />
      <path d="M22 8l7 6-7 6" />
    </svg>
  );
}

export function NextTurnArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 14V7a3 3 0 0 1 3-3h4" />
      <path d="M9.6 1.5 12.6 4 9.6 6.5" />
    </svg>
  );
}

export function NavPuckIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r="15" fill="#0c8f9b" stroke="#fff" strokeWidth="3.5" />
      <path d="M17 9.5 23 22l-6-3.2L11 22l6-12.5Z" fill="#fff" />
    </svg>
  );
}

export function SoundIcon({ color = '#1b2225' }: IconProps) {
  return (
    <svg width="19" height="17" viewBox="0 0 20 18" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round">
      <path d="M1 6.5h3.6L9 2.5v13L4.6 11.5H1V6.5Z" />
      <path d="M13 6a4.2 4.2 0 0 1 0 6" strokeLinecap="round" />
    </svg>
  );
}

export function FlagIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="#fff">
      <path d="M15 1 1 6.9l5.7 2.4L9.1 15 15 1Z" />
    </svg>
  );
}

export function CoinBadge({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#f0b429',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        font: `800 ${Math.round(size * 0.56)}px/1 'Be Vietnam Pro',sans-serif`,
        color: '#fff',
        flex: 'none',
      }}
    >
      đ
    </div>
  );
}
