import { CoinBadge } from '../components/icons';
import { useDriverApp } from '../state/DriverAppContext';
import { useEarnings } from '../data/useEarnings';
import { formatDate, formatVnd } from '../geo/format';

const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderTop: '1px solid #f1f3f3' } as const;

export function EarningsSheet() {
  const { isEarnings } = useDriverApp();
  const { earnings, isLoading } = useEarnings();
  if (!isEarnings) return null;

  const dash = isLoading ? '—' : null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fff',
        borderRadius: '18px 18px 0 0',
        zIndex: 45,
        padding: '10px 0 0',
        animation: 'sheetUp .28s cubic-bezier(.2,.8,.3,1)',
      }}
    >
      <div style={{ width: 44, height: 4.5, borderRadius: 3, background: '#dfe3e4', margin: '0 auto 14px' }} />
      <div style={{ textAlign: 'center', padding: '0 20px 16px' }}>
        <div style={{ font: "400 13px/1 'Be Vietnam Pro',sans-serif", color: '#8b9296' }}>
          Thu nhập hôm nay{earnings ? ` · ${formatDate(earnings.date)}` : ''}
        </div>
        <div style={{ font: "800 30px/1.25 'Be Vietnam Pro',sans-serif", color: '#1b2225', letterSpacing: '-0.01em', marginTop: 6 }}>
          {dash ?? formatVnd(earnings?.total)}
        </div>
      </div>
      <div style={{ padding: '0 18px' }}>
        <div style={rowStyle}>
          <span style={{ font: "400 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#3f484c' }}>Cước phí chuyến đi</span>
          <span style={{ font: "600 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>{dash ?? formatVnd(earnings?.fares)}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, font: "400 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#3f484c' }}>
            <CoinBadge />
            Thưởng nóng
          </span>
          <span style={{ font: "600 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#e2603c' }}>{dash ?? formatVnd(earnings?.bonus)}</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: '1px solid #f1f3f3' }}>
          <span style={{ font: "400 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#3f484c' }}>Số chuyến hoàn thành</span>
          <span style={{ font: "600 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>
            {dash ?? `${earnings?.tripCount ?? 0} chuyến`}
          </span>
        </div>
        <button
          style={{
            width: '100%',
            margin: '16px 0 0',
            height: 48,
            borderRadius: 26,
            border: '1.6px solid #12b8c6',
            background: '#fff',
            font: "600 15px/1 'Be Vietnam Pro',sans-serif",
            color: '#0aa7b4',
            cursor: 'pointer',
          }}
        >
          Xem chi tiết thu nhập
        </button>
      </div>
      <div style={{ height: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8 }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, background: '#1b2225', opacity: 0.85 }} />
      </div>
    </div>
  );
}
