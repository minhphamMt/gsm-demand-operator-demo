import { LocationDeniedIcon } from '../components/icons';
import { useDriverApp } from '../state/DriverAppContext';

const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderTop: '1px solid #f1f3f3' } as const;

export function AppInfoSheet() {
  const { isAppInfo } = useDriverApp();
  if (!isAppInfo) return null;

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
      <div style={{ font: "700 17px/1 'Be Vietnam Pro',sans-serif", color: '#1b2225', textAlign: 'center', paddingBottom: 18 }}>Thông tin ứng dụng</div>
      <div style={{ padding: '0 18px' }}>
        <div style={rowStyle}>
          <span style={{ font: "400 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#3f484c' }}>Quyền truy cập vị trí</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, font: "600 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>
            Chưa cho phép
            <LocationDeniedIcon />
          </span>
        </div>
        <div style={rowStyle}>
          <span style={{ font: "400 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#3f484c' }}>Tình trạng vị trí</span>
          <span style={{ font: "600 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>Hoạt động</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: '1px solid #f1f3f3' }}>
          <span style={{ font: "400 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#3f484c' }}>Chế độ tiết kiệm pin</span>
          <span style={{ font: "600 14px/1.3 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>Tắt</span>
        </div>
        <div style={{ margin: '14px 0 0', background: '#fdeced', borderRadius: 8, padding: '10px 12px', font: "400 12.5px/1.5 'Be Vietnam Pro',sans-serif", color: '#c2362c' }}>
          Bạn cần bật quyền truy cập vị trí cho ứng dụng để nhận đơn.
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
          Mở cài đặt điện thoại
        </button>
      </div>
      <div style={{ height: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8 }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, background: '#1b2225', opacity: 0.85 }} />
      </div>
    </div>
  );
}
