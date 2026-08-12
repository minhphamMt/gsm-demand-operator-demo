import { useMemo } from 'react';
import { Marker } from 'react-map-gl/mapbox';
import { useCampaign } from '../../data/useCampaign';
import type { CampaignDriverView } from '../../data/types';
import { useDriverApp } from '../../state/DriverAppContext';
import { useDriverState } from '../../data/useDriverState';
import { useSelectedCampaign } from '../../state/SelectedCampaignContext';
import { formatVnd } from '../../geo/format';
import { CoinBadge } from '../icons';

/**
 * Story D.1 (Epic 5, sprint-change-proposal-2026-08-09.md §2.2 C-1): thay lớp phủ
 * polygon + viền của story 1.5 bằng MỘT icon bấm được cho mỗi campaign, neo trên
 * `navigation_target_geojson` — không phải centroid `geofence_geojson` như chip cũ
 * (chip cũ không bấm được nên vị trí neo không quan trọng; icon giờ PHẢI trùng đúng
 * điểm "Dẫn đường" sẽ đưa tài xế tới, nếu không icon và tuyến đường sẽ lệch nhau).
 *
 * Vì sao đổi hẳn cách tiếp cận thay vì thêm `onClick` lên layer `fill` cũ: bấm một
 * layer `fill`/`line` chỉ báo được toạ độ chạm, không báo được VÙNG CHẠM chuẩn 44×44px
 * hay `aria-label`/`tabIndex` (NFR20) — polygon không phải là một control. Một
 * `<Marker>` bọc `<button>` thật có cả hai miễn phí, và còn cho phép nhiều campaign ở
 * gần nhau vẫn bấm được riêng từng cái (khác với `fill` layer, nơi hai polygon chồng
 * lấn sẽ luôn trả về polygon trên cùng).
 *
 * `ADR-0018` (icon thay polygon) đang HOÃN — xem `sprint-change-proposal-2026-08-09.md`
 * §8.1/`deferred-work.md` mục DEBT-1. Đừng dùng UX-DR6 ("`geofence-polygon` là lớp phủ
 * bản đồ DUY NHẤT của Pull") hay FR26 để yêu cầu revert file này — proposal đã đánh dấu
 * cả hai *superseded-for-demo* một cách có chủ đích.
 */

function pointToLngLat(point: GeoJSON.Point | null): [number, number] | null {
  if (!point || point.type !== 'Point') return null;
  const [lng, lat] = point.coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

interface Pinned {
  campaign: CampaignDriverView;
  anchor: [number, number];
}

export function CampaignZoneLayer() {
  const { campaigns } = useCampaign();
  const { nav } = useDriverApp();
  const { isOnline } = useDriverState();
  const { selectCampaign } = useSelectedCampaign();

  const pinned = useMemo<Pinned[]>(
    () =>
      campaigns.reduce<Pinned[]>((acc, campaign) => {
        const anchor = pointToLngLat(campaign.navigation_target_geojson);
        if (anchor) acc.push({ campaign, anchor });
        return acc;
      }, []),
    [campaigns],
  );

  // Không campaign nào -> không lớp phủ, KHÔNG empty-state (UX-DR13) — giữ nguyên quy
  // ước của story 1.5 cũ, chỉ đổi phần thân từ polygon sang icon.
  if (pinned.length === 0) return null;

  return (
    <>
      {pinned.map(({ campaign, anchor }) => (
        <Marker key={campaign.id} longitude={anchor[0]} latitude={anchor[1]} anchor="center">
          <CampaignPin
            campaign={campaign}
            interactive={isOnline}
            onSelect={() => {
              selectCampaign(campaign.id);
              nav.demandSheet();
            }}
          />
        </Marker>
      ))}
    </>
  );
}

/**
 * Icon bấm được cho một campaign. Vùng chạm 44×44px (NFR20) bao quanh chip hiển thị
 * nhỏ hơn — giữ nguyên kích thước hình ảnh cũ của `BonusChip` (story 1.5) để không đổi
 * token khoảng cách/màu nào (UX-DR7, UX-DR12), chỉ mở rộng vùng bấm xung quanh nó.
 *
 * `interactive=false` khi tài xế offline: pin vẫn hiện số tiền thưởng (xem được vùng
 * nào đang có thưởng) nhưng không mở được sheet chi tiết -- offline thì tài xế không
 * thể nhận offer nên chi tiết chiến dịch (điều kiện, nút dẫn đường) không có tác dụng.
 */
function CampaignPin({
  campaign,
  interactive,
  onSelect,
}: {
  campaign: CampaignDriverView;
  interactive: boolean;
  onSelect: () => void;
}) {
  const label = interactive
    ? `Chiến dịch thưởng ${campaign.display_area_name ?? 'không tên'}, ${formatVnd(campaign.bonus_amount)}`
    : `Chiến dịch thưởng ${campaign.display_area_name ?? 'không tên'}, ${formatVnd(campaign.bonus_amount)} — mở nhận chuyến để xem chi tiết`;

  return (
    <button
      type="button"
      onClick={interactive ? onSelect : undefined}
      disabled={!interactive}
      aria-label={label}
      style={{
        width: 44,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 0,
        background: 'transparent',
        padding: 0,
        cursor: interactive ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 26,
          padding: '0 10px 0 6px',
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 3px 10px rgba(0,0,0,.18)',
          gap: 6,
        }}
      >
        <CoinBadge />
        <div style={{ font: "700 12px/1 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>
          {formatVnd(campaign.bonus_amount)}
        </div>
      </div>
    </button>
  );
}
