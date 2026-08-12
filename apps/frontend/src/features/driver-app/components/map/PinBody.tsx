import type { MouseEvent } from 'react';
import { CoinBadge } from '../icons';

interface PinBodyProps {
  amount: string;
  badge?: number;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * The visual body of a surge-reward pin, with no positioning of its own.
 *
 * Shared by both map backends: the SVG fallback wraps it in an absolutely-positioned
 * div, while the Mapbox layer hands it to a `<Marker>`.
 *
 * `position: relative` is required — the count badge is positioned at left/top -6 and
 * needs a positioned ancestor. Previously the pin's own `position: absolute` played
 * that role; drop it and the badge escapes to the marker root.
 */
export function PinBody({ amount, badge, onClick }: PinBodyProps) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        height: 26,
        padding: '0 10px 0 6px',
        background: '#fff',
        border: 0,
        borderRadius: 14,
        boxShadow: '0 3px 10px rgba(0,0,0,.18)',
        gap: 6,
        cursor: 'pointer',
      }}
    >
      <CoinBadge />
      <div style={{ font: "700 12px/1 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>{amount}</div>
      {badge != null && (
        <div
          style={{
            position: 'absolute',
            left: -6,
            top: -6,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#e2483c',
            color: '#fff',
            font: "700 9px/16px 'Be Vietnam Pro',sans-serif",
            textAlign: 'center',
          }}
        >
          {badge}
        </div>
      )}
    </button>
  );
}
