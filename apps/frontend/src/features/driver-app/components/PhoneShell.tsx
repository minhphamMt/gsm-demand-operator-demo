import type { ReactNode } from 'react';
import { useDriverApp } from '../state/DriverAppContext';
import { useAuth } from '../state/AuthProvider';
import { DEMO_OPERATOR_PRESETS, simulateOperatorPost, useDemoOperatorOffer } from '../data/useDemoOperatorOffer';
import { useDriverState } from '../data/useDriverState';
import { formatVnd } from '../geo/format';
import { MapDefs } from './MapCanvas';
import { DriverMap } from './DriverMap';

/**
 * Story D.6 (Epic 5, sprint-change-proposal-2026-08-09.md P0-4): nút test PHẢI nằm
 * ngoài khung 390×844 của app -- nếu không, nó trông như một tính năng thật của Driver
 * App thay vì công cụ vận hành demo. Đặt ở đây (thay vì trong một component riêng được
 * `App.tsx` mount song song `PhoneShell`) vì "ngang hàng với caption" nghĩa là cùng
 * `flex-direction: column` với `caption` -- `PhoneShell` là nơi DUY NHẤT sở hữu layout
 * đó, thêm một component ngoài phải tự lặp lại chính layout này.
 *
 * `VITE_DEMO_MODE` đọc trực tiếp ở đây (không tách file cấu hình riêng như
 * `mapboxConfig.ts`) vì chỉ một chỗ dùng tới -- tách file cho một biến boolean chỉ đọc
 * một lần là over-engineering.
 */
const DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true';

function DemoLoginHint() {
  return (
    <div
      className="driver-app-stage"
      style={{
        width: '100%',
        padding: '12px 16px',
        border: '1px solid #b8dfe3',
        borderRadius: 14,
        boxSizing: 'border-box',
        background: '#f2fbfc',
        color: '#3f5d61',
        font: "400 12px/1.5 'Be Vietnam Pro',sans-serif",
        textAlign: 'left',
      }}
    >
      <div style={{ fontWeight: 700, color: '#087f89', marginBottom: 3 }}>Môi trường development</div>
      <div>Dùng tài khoản test được cấu hình ngoài repository; ứng dụng không nhúng thông tin đăng nhập.</div>
    </div>
  );
}

function DemoOperatorButtons() {
  const demoOffer = useDemoOperatorOffer();
  // Ngoài đời, Operator chỉ POST offer tới tài xế đang online vì đó là lúc app gửi GPS
  // định kỳ -- tài xế offline không có toạ độ nào để Operator nhắm tới. Khoá control mock
  // này theo `driver_states.is_online` để demo phản ánh đúng ràng buộc đó thay vì cho phép
  // gửi offer tới một tài xế mà backend thật không thể liên lạc được.
  const { isOnline } = useDriverState();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 'min(520px, 100%)' }}>
      <div style={{ font: "600 12px/1.3 'Be Vietnam Pro',sans-serif", color: '#8a4a3a' }}>
        🧪 Operator mock POST · không ghi Database
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, width: '100%' }}>
        {DEMO_OPERATOR_PRESETS.map((preset) => {
          const selected = demoOffer?.key === preset.key;
          return (
            <button
              key={preset.key}
              onClick={() => simulateOperatorPost(preset)}
              disabled={!isOnline}
              aria-label={`Mô phỏng OPERATOR gửi offer tới ${preset.placeName}`}
              style={{
                minHeight: 64,
                padding: '8px 6px',
                borderRadius: 14,
                border: `1.6px solid ${selected ? '#bf4d2f' : '#e2603c'}`,
                background: selected ? '#ffe5dc' : '#fff5f0',
                font: "600 11.5px/1.25 'Be Vietnam Pro',sans-serif",
                color: '#c2432a',
                cursor: isOnline ? 'pointer' : 'not-allowed',
                opacity: isOnline ? 1 : 0.4,
              }}
            >
              <div>{preset.placeName}</div>
              <div style={{ marginTop: 3, fontWeight: 500 }}>{formatVnd(preset.incentive)}</div>
              <div style={{ marginTop: 2, fontSize: 9.5, fontWeight: 400 }}>
                {preset.latitude.toFixed(4)}, {preset.longitude.toFixed(4)}
              </div>
            </button>
          );
        })}
      </div>
      {!isOnline && (
        <span style={{ font: "400 11.5px/1.3 'Be Vietnam Pro',sans-serif", color: '#8a4a3a' }}>
          Tài xế đang offline — Operator không có GPS để gửi offer. Bấm "Mở nhận chuyến" trong app trước.
        </span>
      )}
      {isOnline && demoOffer && (
        <span style={{ font: "400 11.5px/1.3 'Be Vietnam Pro',sans-serif", color: '#5a6266' }}>
          Đã gửi payload tới {demoOffer.placeName} · {formatVnd(demoOffer.incentive)} · trạng thái {demoOffer.status}.
        </span>
      )}
    </div>
  );
}

/**
 * `caption` ghi đè nhãn demo dưới khung máy. Cần cho các màn nằm ngoài luồng điều
 * hướng thường (đăng nhập, lỗi cấu hình) — những màn đó `DriverAppContext` không
 * biết tới, và nó cũng không nên biết.
 */
export function PhoneShell({ children, caption }: { children: ReactNode; caption?: string }) {
  const { screenCaption } = useDriverApp();
  // `status` chỉ dùng để quyết định có render control demo hay không; không gọi các
  // hook data cần `useDriverId()` khi `PhoneShell` đang render màn đăng nhập/lỗi cấu hình
  // -- những màn đó cũng dùng `PhoneShell` (xem App.tsx).
  const { status } = useAuth();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '36px 16px',
        boxSizing: 'border-box',
        background: '#e9eef0',
      }}
    >
      <MapDefs />
      <div className="phone-shell-stage">
        <div
          style={{
            position: 'relative',
            width: 414,
            height: 868,
            maxWidth: '100vw',
            background: '#0d0f10',
            borderRadius: 56,
            padding: 12,
            boxSizing: 'border-box',
            boxShadow: '0 30px 60px -20px rgba(0,0,0,.4), 0 0 0 2px #2a2e30 inset',
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 190, width: 3, height: 34, background: '#3a3f42', borderRadius: '3px 0 0 3px' }} />
          <div style={{ position: 'absolute', left: 0, top: 248, width: 3, height: 60, background: '#3a3f42', borderRadius: '3px 0 0 3px' }} />
          <div style={{ position: 'absolute', left: 0, top: 324, width: 3, height: 60, background: '#3a3f42', borderRadius: '3px 0 0 3px' }} />
          <div style={{ position: 'absolute', right: 0, top: 270, width: 3, height: 92, background: '#3a3f42', borderRadius: '0 3px 3px 0' }} />

          <div
            style={{
              position: 'relative',
              width: 390,
              height: 844,
              borderRadius: 44,
              overflow: 'hidden',
              background: '#fff',
              isolation: 'isolate',
            }}
          >
            <DriverMap />
            {children}
          </div>
        </div>
        {DEMO_MODE && status === 'signedOut' && (
          <div className="demo-login-credentials">
            <DemoLoginHint />
          </div>
        )}
      </div>
      <div style={{ font: "500 12px/1.4 'Be Vietnam Pro',sans-serif", color: '#8b9296', textAlign: 'center' }}>{caption ?? screenCaption}</div>
      {DEMO_MODE && status === 'ready' && <DemoOperatorButtons />}
    </div>
  );
}
