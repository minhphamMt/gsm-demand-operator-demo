/**
 * Row shapes for the tables the Driver App is allowed to read.
 *
 * Hand-written on purpose: `supabase gen types typescript` emits all 16 tables plus
 * the operator-only ones the Driver App can never see (RLS returns 0 rows), which
 * makes it easy to write a query that type-checks and then silently returns nothing.
 * Listing only the driver-visible surface here keeps that mistake compile-visible.
 * Swap for generated types once the operator console shares this package.
 *
 * PostGIS columns (`current_location`, `geofence`, `navigation_target`) are absent by
 * design — PostgREST returns them as hex EWKB, which is useless client-side. Reading
 * geometry needs a `ST_AsGeoJSON` view; see docs/driver-integration-contract.md.
 */

/** Spec §2 — chỉ hai vai trò. */
export type Role = 'OPERATOR' | 'DRIVER';

/** Spec §5.1 — năm trạng thái funnel, có CHECK trong migration. */
export type OfferStatus = 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

/** Spec §4.4/§5.2 — có CHECK trong migration. */
export type ParticipationStatus =
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ARRIVED_VERIFIED'
  | 'ACTIVATED'
  | 'NO_SHOW'
  | 'LOCATION_LOST';

/**
 * Từ vựng nhóm tự chốt — spec không liệt kê, nên DB KHÔNG có CHECK.
 * Nguồn: docs/driver-integration-contract.md §5. Đây chỉ là kỳ vọng phía client;
 * database vẫn nhận giá trị khác, nên đừng dùng để suy ra tính hợp lệ.
 */
export type OperationalStatus = 'IDLE' | 'EN_ROUTE' | 'ON_TRIP' | 'OFFLINE';

/**
 * Từ vựng nhóm tự chốt cho `campaign_participations.eligibility_status` — spec không
 * liệt kê, nên DB KHÔNG có CHECK (chỉ `varchar(30)`). Nguồn: docs/driver-integration-contract.md
 * §5. Đây chỉ là kỳ vọng phía client; database vẫn nhận giá trị khác, nên đừng dùng để
 * suy ra tính hợp lệ.
 */
export type EligibilityStatus = 'ELIGIBLE' | 'INELIGIBLE';

/**
 * Từ vựng nhóm tự chốt cho `campaigns.status` — spec không liệt kê, nên DB KHÔNG có
 * CHECK. Nguồn: docs/driver-integration-contract.md §5. Đây chỉ là kỳ vọng phía client;
 * database vẫn nhận giá trị khác, nên đừng dùng để suy ra tính hợp lệ.
 */
export type CampaignStatus = 'ACTIVE' | 'TARGET_REACHED' | 'COMPLETED' | 'CANCELLED';

export interface Profile {
  id: string;
  role: Role;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

export interface DriverState {
  driver_id: string;
  is_online: boolean | null;
  operational_status: OperationalStatus | string | null;
  current_h3_index: string | null;
  location_updated_at: string | null;
  active_campaign_id: string | null;
}

/**
 * `public.campaigns_driver_v` (story 1.1, ADR-0005) — đúng 10 cột an toàn của view,
 * KHÔNG select `*` trên `campaigns`. `status` không có CHECK trong migration nên dùng
 * quy ước `X | string | null` giống `operational_status` ở `DriverState` phía trên.
 */
export interface CampaignDriverView {
  id: string;
  status: CampaignStatus | string | null;
  bonus_amount: number | null;
  fare_multiplier: number | null;
  start_at: string | null;
  end_at: string | null;
  reward_cutoff_at: string | null;
  display_area_name: string | null;
  geofence_geojson: GeoJSON.Polygon | null;
  navigation_target_geojson: GeoJSON.Point | null;
}

/**
 * `public.campaign_participations` — chỉ các cột client đọc trực tiếp được.
 * Cố ý bỏ `last_location` (geography, PostGIS — cùng lý do phần đầu file loại
 * `geofence`/`navigation_target`/`current_location`) và `route` (jsonb, chi tiết nội
 * bộ chưa cần cho UI).
 */
export interface CampaignParticipation {
  id: string;
  campaign_id: string;
  driver_id: string;
  offer_id: string | null;
  status: ParticipationStatus;
  eligibility_status: EligibilityStatus | string | null;
  slot_deadline_at: string | null;
  arrival_deadline_at: string | null;
  accepted_at: string | null;
  en_route_at: string | null;
  arrived_verified_at: string | null;
  activated_at: string | null;
  first_inside_at: string | null;
  dwell_seconds: number | null;
  last_h3_index: string | null;
}

export interface DriverOffer {
  id: string;
  campaign_id: string;
  status: OfferStatus;
  distance_m: number | null;
  eta_seconds: number | null;
  created_at: string | null;
  sent_at: string | null;
  expires_at: string | null;
  /** Tài xế đã "xem" offer từ lúc nào — story 2.4 ghi khi offer trở thành pendingOffer. */
  viewed_at: string | null;
  /** Mock-only marker; demo operator offers never call Supabase mutations. */
  isDemo?: boolean;
  /**
   * Ghép ở client từ `useCampaign()` (đọc qua `campaigns_driver_v`) theo `campaign_id`,
   * KHÔNG còn là PostgREST embed FK trực tiếp trên `campaigns` (story 2.4, AR12/AD-12).
   */
  campaigns: CampaignDriverView | null;
}

/** Notification view-model assembled from the driver offer and safe campaign view. */
export interface DriverOfferNotification {
  offerId: string;
  campaignId: string;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  incentive: number | null;
  createdAt: string | null;
  status: OfferStatus;
}

export interface DriverOfferWithNotification extends DriverOffer {
  notification: DriverOfferNotification;
}

export interface RewardRecord {
  amount: number | null;
  reward_type: string | null;
  status: string | null;
  reason: string | null;
  qualified_at: string | null;
}

export interface TripRow {
  base_fare: number | null;
  dropoff_at: string | null;
  status: string | null;
}
