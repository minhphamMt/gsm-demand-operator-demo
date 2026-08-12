import { useDriverApp } from '../../state/DriverAppContext';
import { MapBaseImage } from '../MapCanvas';
import { PuckBody } from './PuckBody';

/**
 * The original hand-drawn map, used whenever Mapbox is unavailable (no token, or a
 * token that fails at runtime).
 *
 * Everything here is anchored in screen pixels against a 390×844 viewBox, which only
 * works because the phone screen is exactly 390×844 CSS px (1 SVG unit == 1 CSS px).
 * That is why this layer cannot be mixed with the real map — it is all-or-nothing.
 */
export function SvgMapLayer() {
  const { isNavigate } = useDriverApp();
  return isNavigate ? <SvgNavigateMap /> : <SvgDemandMap />;
}

function SvgDemandMap() {
  const { mapTransform, puckTop } = useDriverApp();

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: mapTransform,
          transformOrigin: '50% 40%',
          transition: 'transform .55s cubic-bezier(.2,.8,.3,1)',
        }}
      >
        <MapBaseImage />
      </div>

      {/* SVG nền không có hệ toạ độ campaign thật. Không vẽ pin/tuyến giả: demo Pull
          yêu cầu Mapbox để icon và destination luôn lấy từ campaign đang chọn. */}
      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: 74,
          zIndex: 10,
          borderRadius: 8,
          padding: '8px 10px',
          background: 'rgba(255,250,235,.94)',
          color: '#7a5a12',
          font: "500 12px/1.4 'Be Vietnam Pro',sans-serif",
        }}
      >
        Bản đồ demo cần Mapbox để hiển thị đúng chiến dịch và điểm đến.
      </div>

      <div style={{ position: 'absolute', left: '50%', top: puckTop, transform: 'translate(-50%,-50%)' }}>
        <PuckBody />
      </div>
    </>
  );
}

function SvgNavigateMap() {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: '#f2f1ec' }}>
        <MapBaseImage />
      </div>
      {/* Không có projection/directions thật nên không giả tuyến hoặc điểm đến. */}
    </>
  );
}
