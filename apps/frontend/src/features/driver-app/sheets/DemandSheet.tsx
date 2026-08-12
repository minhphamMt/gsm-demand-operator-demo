import { useEffect, useState } from 'react';
import { ChevronDoubleUpIcon, ClockIcon, PinOutlineIcon } from '../components/icons';
import { useDriverApp } from '../state/DriverAppContext';
import { useSelectedCampaign } from '../state/SelectedCampaignContext';
import { useSetDestination } from '../state/RouteContext';
import { useCampaign } from '../data/useCampaign';
import { useOffers } from '../data/useOffers';
import { formatDistance, formatVnd } from '../geo/format';

/**
 * Story D.2 (Epic 5, sprint-change-proposal-2026-08-09.md §2.2 C-2): popup của MỘT
 * campaign — campaign nào do `useSelectedCampaign()` quyết định (đặt khi bấm icon ở
 * `CampaignZoneLayer.tsx`, story D.1). Trước đây file này là danh sách MỌI campaign với
 * một nút "Đóng" duy nhất (story 1.6); giờ đúng hai hành động "Đóng"/"Dẫn đường" cho
 * đúng một campaign, theo UX-DR9 đã sửa (nút "khoảng cách" cũ → hai nút tường minh).
 *
 * `ADR-0018`/sửa UX-DR9 đang HOÃN (xem `deferred-work.md` mục DEBT-1/DEBT-2) —
 * `sprint-change-proposal-2026-08-09.md` §2.2 C-2 là văn bản có thẩm quyền cho hình
 * dạng hai nút này, không phải "nút khoảng cách" cũ trong `EXPERIENCE.md`.
 *
 * "Dẫn đường" ở đây KHÔNG gọi backend, KHÔNG đổi trạng thái nào (không phải làn B) —
 * nó chỉ đặt điểm đến (`useSetDestination`) rồi chuyển màn, đúng nguyên tắc UX-DR9 gốc
 * ("sheet chỉ đọc, không hành động làn B") mà proposal khẳng định vẫn giữ nguyên dù đổi
 * nhãn/hình dạng nút.
 */

/**
 * Đếm ngược `HH:MM:SS` tới `targetIso`, tick mỗi giây. Dừng ở `00:00:00` và báo
 * `expired: true` khi mốc đã qua — không tự xoá gì, chỉ trả về trạng thái để hàng gọi
 * hook tự quyết định cách hiển thị. Sao chép từ `DemandSheet.tsx` bản trước (story 1.6)
 * — cùng một hook cho cùng một nhu cầu, không đáng tách file riêng cho 20 dòng này.
 *
 * Đếm tới `reward_cutoff_at` (không phải `end_at`) — đúng cột AC của story nêu tường minh.
 */
function useCountdown(targetIso: string | null): { text: string; expired: boolean } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetIso) return;
    const target = new Date(targetIso).getTime();
    if (Number.isNaN(target)) return;
    const id = setInterval(() => {
      if (Date.now() >= target) {
        clearInterval(id);
      }
      setNow(Date.now());
    }, 1000);
    if (Date.now() >= target) clearInterval(id);
    return () => clearInterval(id);
  }, [targetIso]);

  if (!targetIso) return { text: '—:—:—', expired: false };

  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return { text: '—:—:—', expired: false };

  const remainingMs = target - now;
  if (remainingMs <= 0) return { text: '00:00:00', expired: true };

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { text: `${pad(hh)}:${pad(mm)}:${pad(ss)}`, expired: false };
}

/** Xác nhận `navigation_target_geojson` thật sự là một `Point` với 2 toạ độ hữu hạn
 * trước khi dùng làm điểm đến — cùng tinh thần phòng thủ đã dùng ở `CampaignZoneLayer.tsx`
 * (không giả định type khai báo khớp dữ liệu thật). */
function pointToLngLat(point: GeoJSON.Point | null): [number, number] | null {
  if (!point || point.type !== 'Point') return null;
  const [lng, lat] = point.coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

export function DemandSheet() {
  const { isDemandSheet, closeSheet, nav } = useDriverApp();
  const { selectedCampaignId, clearSelectedCampaign } = useSelectedCampaign();
  const { campaigns } = useCampaign();
  const { offers } = useOffers();
  const setDestination = useSetDestination();

  const campaign = campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  // Luôn gọi hook trước early return để click một icon campaign không làm thứ tự hook
  // thay đổi giữa hai lần render (Rules of Hooks).
  const { text: countdownText, expired } = useCountdown(campaign?.reward_cutoff_at ?? null);

  // Không sheet nào đang mở, hoặc campaign đã chọn không còn khớp dữ liệu (race hiếm:
  // danh sách campaign refetch giữa lúc popup mở) -- không render một popup rỗng.
  if (!isDemandSheet || !campaign) return null;
  const textColor = expired ? '#b0b0b0' : '#1b2225';
  const mutedColor = expired ? '#b0b0b0' : '#8b9296';

  const offer = offers.find((o) => o.campaign_id === campaign.id);
  const distanceM = offer?.distance_m ?? null;
  const navTarget = pointToLngLat(campaign.navigation_target_geojson);

  const handleNavigate = () => {
    if (!navTarget) return;
    setDestination(navTarget, campaign.display_area_name);
    clearSelectedCampaign();
    nav.navigate();
  };

  const handleClose = () => {
    clearSelectedCampaign();
    closeSheet();
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: '18px 18px 0 0',
        background: '#fff',
        zIndex: 45,
        display: 'flex',
        flexDirection: 'column',
        animation: 'sheetUp .28s cubic-bezier(.2,.8,.3,1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 16px 12px', borderBottom: '1px solid #f1f3f3' }}>
        <ChevronDoubleUpIcon color="#f0b429" />
        <div style={{ font: "700 15.5px/1 'Be Vietnam Pro',sans-serif", color: '#1b2225', flex: 1 }}>Chương trình thưởng</div>
      </div>

      <div style={{ padding: '16px 16px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <PinOutlineIcon size={15} color={mutedColor} />
          <span style={{ font: "600 14.5px/1 'Be Vietnam Pro',sans-serif", color: textColor, flex: 1 }}>
            {campaign.display_area_name ?? '—'}
          </span>
          <ClockIcon color={mutedColor} />
          <span style={{ font: "700 13.5px/1 'Be Vietnam Pro',sans-serif", color: textColor }}>{countdownText}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <span style={{ font: "700 22px/1 'Be Vietnam Pro',sans-serif", color: expired ? '#b0b0b0' : '#e2603c' }}>
            {formatVnd(campaign.bonus_amount)}
          </span>
          {campaign.fare_multiplier != null && (
            <span style={{ font: "400 13px/1 'Be Vietnam Pro',sans-serif", color: mutedColor }}>
              {`Hệ số giá x${Number(campaign.fare_multiplier)}`}
            </span>
          )}
        </div>

        {distanceM != null && (
          <div style={{ font: "400 13px/1.4 'Be Vietnam Pro',sans-serif", color: mutedColor, marginBottom: 8 }}>
            {`Cách bạn ${formatDistance(distanceM)}`}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 11, padding: '10px 16px 8px', borderTop: '1px solid #f1f3f3' }}>
        <button
          onClick={handleClose}
          style={{ flex: 1, height: 48, borderRadius: 26, border: '1.6px solid #12b8c6', background: '#fff', font: "600 15px/1 'Be Vietnam Pro',sans-serif", color: '#0aa7b4', cursor: 'pointer' }}
        >
          Đóng
        </button>
        <button
          onClick={handleNavigate}
          disabled={!navTarget}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 26,
            border: 0,
            background: navTarget ? '#12b8c6' : '#cfd4d5',
            font: "600 15px/1 'Be Vietnam Pro',sans-serif",
            color: '#fff',
            cursor: navTarget ? 'pointer' : 'default',
          }}
        >
          Dẫn đường
        </button>
      </div>
      <div style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, background: '#1b2225', opacity: 0.85 }} />
      </div>
    </div>
  );
}
