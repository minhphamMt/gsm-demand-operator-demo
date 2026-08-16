import { useDriverApp } from '../state/DriverAppContext';

export function DriveTimeSheet() {
  const { isDriveTime } = useDriverApp();
  if (!isDriveTime) return null;

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
      <div style={{ width: 44, height: 4.5, borderRadius: 3, background: '#dfe3e4', margin: '0 auto 20px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '0 20px 6px' }}>
        <div style={{ position: 'relative', width: 78, height: 78 }}>
          <svg width="78" height="78" viewBox="0 0 78 78">
            <circle cx="39" cy="39" r="35" fill="none" stroke="#eef1f2" strokeWidth="6" />
            <circle cx="39" cy="39" r="35" fill="none" stroke="#12b8c6" strokeWidth="6" strokeLinecap="round" strokeDasharray="6 214" transform="rotate(-90 39 39)" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: "700 16px/1 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>
            0.0/8
          </div>
        </div>
        <div style={{ font: "400 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#5a6266' }}>Bạn đã lái xe liên tục</div>
        <div style={{ font: "700 18px/1.3 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>0 tiếng 0 phút / 8 tiếng</div>
      </div>
      <div style={{ height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8 }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, background: '#1b2225', opacity: 0.85 }} />
      </div>
    </div>
  );
}
