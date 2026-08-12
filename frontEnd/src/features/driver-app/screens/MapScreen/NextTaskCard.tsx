import { LeafIcon, PinOutlineIcon } from '../../components/icons';
import { useDriverApp } from '../../state/DriverAppContext';
import { useRoute } from '../../state/RouteContext';
import { useOffers } from '../../data/useOffers';
import { formatDistance, formatDuration, formatTimeOfDay, formatVnd } from '../../geo/format';

export function NextTaskCard() {
  const { isNextTask, bannerBottom, nav } = useDriverApp();
  const { pendingOffer, activeOffer } = useOffers();
  const route = useRoute();
  // Accepting an offer immediately removes it from `pendingOffer`. Keep showing the
  // accepted task from the same server-backed offer instead of blanking the screen.
  const taskOffer = activeOffer ?? pendingOffer;
  const campaign = taskOffer?.campaigns ?? null;
  // Không hiển thị empty-state card: thông báo offer thật được render bởi DemandBanner.
  if (!isNextTask || !campaign) return null;

  // Directions API cho quãng đường thật theo mạng lưới đường; distance_m/eta_seconds
  // trên offer là con số backend đã tính lúc gửi. Ưu tiên Directions khi có, vì tài
  // xế có thể đã di chuyển kể từ lúc offer được gửi.
  const proximity =
    route.status === 'ready'
      ? `Cách bạn ${formatDistance(route.route.distance)} · khoảng ${formatDuration(route.route.duration)}.`
      : route.status === 'loading'
        ? 'Đang tính khoảng cách…'
        : taskOffer?.distance_m != null
          ? `Cách bạn ${formatDistance(taskOffer.distance_m)}${
              taskOffer.eta_seconds != null ? ` · khoảng ${formatDuration(taskOffer.eta_seconds)}` : ''
            }.`
          : 'Chưa xác định được khoảng cách.';

  // Tài xế KHÔNG đọc được h3_cells (RLS chỉ mở cho OPERATOR), nên không có tên quận
  // để hiển thị — bản prototype ghi cứng "Cầu Giấy". Cũng không đọc được
  // hotspots.shortage_count, nên bỏ luôn câu "đang thiếu 12 xe".
  // Xem docs/driver-integration-contract.md §4.
  const headline = 'Có chương trình thưởng nóng đang mở gần bạn.';

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        boxSizing: 'border-box',
        bottom: bannerBottom,
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 8px 26px rgba(0,0,0,.2)',
        zIndex: 30,
        pointerEvents: 'auto',
        animation: 'fadeIn .25s ease-out',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '16px 16px 14px' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fdf0dd', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LeafIcon />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ font: "700 15px/1.4 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>{headline}</div>
          {campaign && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <PinOutlineIcon size={13} color="#8b9296" />
              <span style={{ font: "400 13px/1.4 'Be Vietnam Pro',sans-serif", color: '#5a6266' }}>{proximity}</span>
            </div>
          )}
          {campaign && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fffaeb', border: '1px solid #f4e3b6', borderRadius: 9, padding: '9px 10px' }}>
              <div style={{ width: 17, height: 17, borderRadius: '50%', background: '#f0b429', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', font: "800 10px/1 'Be Vietnam Pro',sans-serif", color: '#fff', marginTop: 1 }}>
                đ
              </div>
              <div style={{ font: "500 12.5px/1.45 'Be Vietnam Pro',sans-serif", color: '#7a5a12' }}>
                Thưởng <span style={{ fontWeight: 700, color: '#5f430a' }}>{formatVnd(campaign.bonus_amount)}</span> khi đến khu vực
                và hoạt động trong vùng trước {formatTimeOfDay(campaign.end_at)}.
                {campaign.fare_multiplier != null && ` Hệ số giá x${Number(campaign.fare_multiplier)}.`}
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid #eceeef' }}>
        <button
          onClick={nav.home}
          style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', font: "600 15px/1 'Be Vietnam Pro',sans-serif", color: '#0aa7b4', cursor: 'pointer' }}
        >
          Bỏ qua
        </button>
        <div style={{ width: 1, background: '#eceeef' }} />
        <button
          onClick={nav.navigate}
          style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', font: "600 15px/1 'Be Vietnam Pro',sans-serif", color: '#0aa7b4', cursor: 'pointer' }}
        >
          Dẫn đường
        </button>
      </div>
    </div>
  );
}
