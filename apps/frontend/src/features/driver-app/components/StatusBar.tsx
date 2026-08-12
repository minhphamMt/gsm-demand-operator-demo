import { SignalBarsIcon, WifiIcon } from './icons';
import { useClock } from '../data/useClock';

export function StatusBar() {
  const clock = useClock();
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 54,
          zIndex: 60,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '0 28px 8px',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      >
        <div style={{ font: "600 15px/1 'Be Vietnam Pro',sans-serif", color: '#0d0f10', letterSpacing: '-0.01em' }}>{clock}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SignalBarsIcon />
          <WifiIcon />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div style={{ width: 23, height: 12, border: '1.4px solid rgba(13,15,16,.4)', borderRadius: 3.5, padding: 1.4, boxSizing: 'border-box' }}>
              <div style={{ width: '74%', height: '100%', background: '#0d0f10', borderRadius: 1.5 }} />
            </div>
            <div style={{ width: 1.6, height: 4, background: 'rgba(13,15,16,.4)', borderRadius: '0 1px 1px 0' }} />
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 11,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 112,
          height: 33,
          background: '#0d0f10',
          borderRadius: 20,
          zIndex: 61,
        }}
      />
    </>
  );
}
