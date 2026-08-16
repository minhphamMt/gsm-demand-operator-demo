import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '../lib/supabase';
import { useDriverId } from '../state/AuthProvider';
import type { CampaignDriverView } from './types';
import { qk } from './queryKeys';

/**
 * Danh sách chiến dịch của tài xế đang đăng nhập, đọc qua `campaigns_driver_v`
 * (view an toàn tạo ở story 1.1, ADR-0005) — đường đọc chiến dịch duy nhất được
 * uỷ quyền, không query thẳng bảng `campaigns`, không embed qua FK.
 *
 * Vì sao không tham số (khác `useCampaign(campaignId)` mà ADR-0005 phác hoạ ban đầu):
 * ADR-0005 giả định lúc đó `useOffers` sẽ sớm bỏ embed `campaigns(...)` và cần tra theo
 * một `campaign_id` đã biết trước. Nhưng việc gỡ embed đó dời sang story 2.4 (chưa chạy;
 * `useOffers.ts` vẫn giữ nguyên embed cũ), và AC của story này ("tài xế có offer/
 * participation với một hay nhiều chiến dịch") mô tả một hook trả về DANH SÁCH — không
 * có nguồn nào cung cấp sẵn một `campaign_id` cụ thể ở thời điểm này. Vì vậy hook đọc
 * không lọc, trả về mảng (kể cả mảng rỗng là trạng thái bình thường).
 *
 * Vì sao không `.eq()` lọc theo tài xế: `campaigns_driver_v` không có cột liên kết tài
 * xế (`driver_id`) để lọc theo — nó chỉ có 10 cột an toàn của `campaigns`. Phạm vi dòng
 * trả về do RLS (`security_invoker` + `campaigns_select_operator_or_related_driver`)
 * quyết định — policy đó cho OPERATOR thấy MỌI campaign, chỉ giới hạn "chỉ campaign
 * liên quan" khi caller là DRIVER; hook này chỉ được gọi trong Driver App (đăng nhập
 * bằng vai trò DRIVER qua `AuthProvider`), nên trong ngữ cảnh gọi thực tế kết quả luôn
 * đúng phạm vi tài xế — đảm bảo đến từ việc hook chỉ chạy ở app này, không phải RLS
 * đơn lẻ. Khác với `useDriverState.ts`/`useOffers.ts` (nơi `.eq()` tồn tại chỉ để ý định
 * rõ trong code, không phải lớp chặn thật) — ở đây không copy pattern đó vì không có cột
 * nào để `.eq()` lên; thêm `.eq()` giả trên cột khác sẽ là lớp lọc sai lệch với thực tế.
 *
 * Vì sao thêm `qk.campaigns` (số nhiều) thay vì dùng `qk.campaign` (số ít, đã có từ
 * story 1.3): `qk.campaign(campaignId)` khoá theo `campaignId` đã biết — đúng ngữ nghĩa
 * cho tra một chiến dịch cụ thể (dùng sau này, ví dụ refetch một chiến dịch). Hook này
 * không có id nào để truyền — nó là "danh sách chiến dịch của tôi", khoá tự nhiên theo
 * `driverId` giống `qk.offers`/`qk.earnings`. Dùng nhầm `qk.campaign` với `driverId` làm
 * tham số sẽ đúng kiểu (cả hai đều `string`) nhưng sai ngữ nghĩa, gây khó hiểu khi debug
 * cache. `driverId` ở đây chỉ dùng để khoá query, không dùng để lọc (xem trên).
 *
 * Quyết định tường minh (story D.0, sprint-change-proposal-2026-08-09.md): hook này
 * KHÔNG lọc theo `status` — campaign `COMPLETED`/`CANCELLED` vẫn nằm trong mảng trả về.
 * Lý do: (1) D.2 yêu cầu rõ một campaign đã qua `reward_cutoff_at` vẫn phải hiển thị,
 * chỉ chuyển màu disabled, "hàng không bị xoá"; (2) ẩn campaign `COMPLETED` sẽ khiến
 * demo chỉ còn đúng một icon trên bản đồ, mất khả năng kiểm chứng AC "bấm đúng icon mở
 * đúng campaign" (D.1) cần tối thiểu hai campaign phân biệt được. Ẩn theo status là việc
 * của tầng hiển thị (nếu cần) — không đặt ở đây để tránh một bộ lọc ngầm không ai quyết định.
 */

const COLUMNS =
  'id, status, bonus_amount, fare_multiplier, start_at, end_at, reward_cutoff_at, ' +
  'display_area_name, geofence_geojson, navigation_target_geojson';

export function useCampaign() {
  const driverId = useDriverId();

  const query = useQuery({
    queryKey: qk.campaigns(driverId),
    queryFn: async (): Promise<CampaignDriverView[]> => {
      const { data, error } = await requireSupabase()
        .from('campaigns_driver_v')
        .select(COLUMNS);
      if (error) throw error;
      return (data ?? []) as unknown as CampaignDriverView[];
    },
  });

  const campaigns = useMemo(() => query.data ?? [], [query.data]);

  return {
    campaigns,
    isLoading: query.isLoading,
    error: query.error,
  };
}
