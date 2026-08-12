import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '../lib/supabase';
import { useDriverId } from '../state/AuthProvider';
import type { DriverOffer, DriverOfferNotification, DriverOfferWithNotification } from './types';
import { qk } from './queryKeys';
import { useCampaign } from './useCampaign';
import { useDemoOperatorOffer } from './useDemoOperatorOffer';
import { hasOfferLifecycleDeadline, isOfferActive, isOfferPending } from './offerLifecycle';

/**
 * `driver_offers` cho tài xế đang đăng nhập, ghép campaign từ `useCampaign()`.
 *
 * Realtime là lý do lớp này dùng TanStack Query: một offer tới phải làm mới banner,
 * thẻ nhiệm vụ và sheet thưởng cùng lúc. Với `invalidateQueries` thì chỉ cần một
 * subscription; tự quản bằng useState thì mỗi component phải tự đăng ký và tự chống
 * race khi user chuyển màn giữa lúc fetch.
 *
 * Bản thân subscription nằm ở `<DriverRealtime />` chứ KHÔNG ở đây: hook này được
 * nhiều component gọi cùng lúc, đặt effect trong này là mỗi component một channel
 * trùng topic.
 *
 * RLS `offers_select_own_or_operator` đã giới hạn theo `auth.uid()`, `.eq()` bên dưới
 * chỉ để ý định hiện rõ trong code chứ không phải lớp bảo vệ.
 *
 * story 2.4 (AR12/AD-12): trước đây file này embed `campaigns(...)` qua FK ngay trên
 * bảng `campaigns` gốc, bỏ qua view an toàn `campaigns_driver_v`. Giờ chỉ đọc cột phẳng
 * của `driver_offers` rồi ghép dữ liệu campaign lấy từ `useCampaign()` (đã đi qua view).
 */

const COLUMNS =
  'id, campaign_id, status, distance_m, eta_seconds, created_at, sent_at, expires_at, viewed_at';

// Demo notification được phát độc lập từ ba nút Operator mock; không để offer cũ
// trong Supabase tự bật lại sau mỗi lần refresh màn hình demo.
const DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true';

/** Shape thật `queryFn` nhận về -- `campaigns` chưa tồn tại ở bước này, được ghép sau. */
type RawOffer = Omit<DriverOffer, 'campaigns'>;

function pointToCoordinates(point: GeoJSON.Point | null): [number, number] | null {
  if (!point || point.type !== 'Point' || !Array.isArray(point.coordinates) || point.coordinates.length < 2) return null;
  const [longitude, latitude] = point.coordinates;
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }
  return [longitude, latitude];
}

function toNotification(
  offer: DriverOffer,
  campaign: DriverOffer['campaigns'],
): DriverOfferNotification {
  const target = pointToCoordinates(campaign?.navigation_target_geojson ?? null);
  return {
    offerId: offer.id,
    campaignId: offer.campaign_id,
    placeName: campaign?.display_area_name ?? null,
    latitude: target?.[1] ?? null,
    longitude: target?.[0] ?? null,
    incentive: campaign?.bonus_amount ?? null,
    createdAt: offer.created_at ?? offer.sent_at,
    status: offer.status,
  };
}

/**
 * Chống ghi `viewed_at` trùng lặp: `useOffers()` được `NextTaskCard`, `DemandBanner`
 * và `DemandSheet` gọi đồng thời -- mỗi lần gọi tạo một `pendingOffer` object mới
 * (khác reference dù cùng offer), nên state trong từng hook instance không đủ để
 * chặn 2-3 request UPDATE trùng nhau bắn ra gần như cùng lúc. Set cấp module (dùng
 * chung cho mọi instance của hook trong cùng tab) mới chặn được, tương tự lý do
 * subscription Realtime phải sống ở một chỗ duy nhất (xem doc-comment đầu file).
 */
const viewedWriteAttempted = new Set<string>();

export function useOffers() {
  const driverId = useDriverId();
  const { campaigns } = useCampaign();
  const demoOperatorOffer = useDemoOperatorOffer();
  const [now, setNow] = useState(() => Date.now());

  const query = useQuery({
    queryKey: qk.offers(driverId),
    queryFn: async (): Promise<RawOffer[]> => {
      const { data, error } = await requireSupabase()
        .from('driver_offers')
        .select(COLUMNS)
        .eq('driver_id', driverId)
        .order('sent_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RawOffer[];
    },
  });

  const campaignById = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c])),
    [campaigns],
  );

  const offers = useMemo<DriverOfferWithNotification[]>(
    () => {
      const serverOffers = (query.data ?? []).map((o) => {
        const campaign = campaignById.get(o.campaign_id) ?? null;
        const offer = { ...o, campaigns: campaign };
        return { ...offer, notification: toNotification(offer, campaign) };
      });

      // Khi đang demo, chỉ notification vừa được phát từ mock Operator được phép
      // đi vào UI. Offer cũ trong Database (kể cả ACCEPTED) không phải sự kiện mới.
      if (!demoOperatorOffer) return DEMO_MODE ? [] : serverOffers;

      const demoCampaign = {
        id: `demo-campaign-${demoOperatorOffer.key}`,
        status: 'ACTIVE' as const,
        bonus_amount: demoOperatorOffer.incentive,
        fare_multiplier: null,
        start_at: demoOperatorOffer.createdAt,
        end_at: null,
        reward_cutoff_at: null,
        display_area_name: demoOperatorOffer.placeName,
        geofence_geojson: null,
        navigation_target_geojson: {
          type: 'Point' as const,
          coordinates: [demoOperatorOffer.longitude, demoOperatorOffer.latitude] as [number, number],
        },
      };
      const demoOffer: DriverOfferWithNotification = {
        id: demoOperatorOffer.offerId,
        campaign_id: demoCampaign.id,
        status: demoOperatorOffer.status,
        distance_m: Math.round(demoOperatorOffer.distanceKm * 1000),
        eta_seconds: demoOperatorOffer.etaMinutes * 60,
        created_at: demoOperatorOffer.createdAt,
        sent_at: demoOperatorOffer.createdAt,
        expires_at: null,
        viewed_at: null,
        isDemo: true,
        campaigns: demoCampaign,
        notification: {
          offerId: demoOperatorOffer.offerId,
          campaignId: demoCampaign.id,
          placeName: demoOperatorOffer.placeName,
          latitude: demoOperatorOffer.latitude,
          longitude: demoOperatorOffer.longitude,
          incentive: demoOperatorOffer.incentive,
          createdAt: demoOperatorOffer.createdAt,
          status: demoOperatorOffer.status,
        },
      };

      return [demoOffer, ...(DEMO_MODE ? [] : serverOffers)];
    },
    [query.data, campaignById, demoOperatorOffer],
  );

  useEffect(() => {
    if (!offers.some((offer) => hasOfferLifecycleDeadline(offer, now))) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [now, offers]);

  const pendingOffer = useMemo(() => {
    // Đã sort sent_at giảm dần, nên cái đầu tiên là offer mới nhất còn hiệu lực.
    return offers.find((o) => isOfferPending(o, now)) ?? null;
  }, [offers, now]);

  const activeOffer = useMemo(
    () => offers.find((o) => isOfferActive(o, now)) ?? null,
    [offers, now],
  );

  const pendingNotification = pendingOffer?.notification ?? null;
  const activeNotification = activeOffer?.notification ?? null;

  // Ghi nhận tài xế đã "xem" offer khi nó trở thành pendingOffer lần đầu. Side-effect
  // thuần, không phải mutation hook — không có UI trạng thái nào phụ thuộc kết quả ghi
  // này nên không cần optimistic update/rollback. Lỗi chỉ log, không throw ra UI.
  //
  // Dependency là `pendingOffer?.id` (không phải cả object `pendingOffer`) vì object đó
  // được `useMemo` dựng lại mỗi khi `campaigns`/`query.data` đổi reference, kể cả khi
  // offer thật không đổi -- key theo id mới cách ly effect khỏi những re-render không
  // liên quan tới offer này. `viewedWriteAttempted` chặn cả các hook instance khác cùng
  // ghi trùng cho cùng offer (xem doc-comment ở khai báo Set).
  const pendingOfferId = pendingOffer?.id ?? null;
  const pendingOfferViewedAt = pendingOffer?.viewed_at ?? null;
  const pendingOfferIsDemo = pendingOffer?.isDemo ?? false;
  useEffect(() => {
    if (!pendingOfferId || pendingOfferViewedAt || pendingOfferIsDemo) return;
    if (viewedWriteAttempted.has(pendingOfferId)) return;
    viewedWriteAttempted.add(pendingOfferId);
    requireSupabase()
      .from('driver_offers')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', pendingOfferId)
      .then(({ error }) => {
        if (error) {
          console.warn('[useOffers] không ghi được viewed_at:', error);
          // Cho phép thử lại ở lần render sau (ví dụ do Realtime refetch) thay vì khoá
          // vĩnh viễn một request đã lỗi.
          viewedWriteAttempted.delete(pendingOfferId);
        }
      });
  }, [pendingOfferId, pendingOfferIsDemo, pendingOfferViewedAt]);

  return {
    offers,
    pendingOffer,
    pendingNotification,
    activeOffer,
    activeNotification,
    isLoading: query.isLoading,
    error: query.error,
  };
}
