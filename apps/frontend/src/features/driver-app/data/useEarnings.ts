import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '../lib/supabase';
import { useDriverId } from '../state/AuthProvider';
import type { RewardRecord, TripRow } from './types';
import { qk } from './queryKeys';

/**
 * Thu nhập trong ngày: cước từ `trips` + thưởng từ `reward_records`.
 *
 * Hai bảng, một query — component chỉ quan tâm tới con số tổng, và tách thành hai
 * `useQuery` sẽ cho ra hai trạng thái loading lệch nhau, khiến sheet nhấp nháy khi
 * một bên về trước.
 */

export interface Earnings {
  /** Tổng cước các chuyến đã hoàn thành hôm nay. */
  fares: number;
  /** Tổng thưởng đã đủ điều kiện hôm nay (điều chuyển + theo chuyến). */
  bonus: number;
  total: number;
  tripCount: number;
  /** Ngày dùng để lọc, hiển thị trên sheet. */
  date: Date;
}

/** Nửa đêm theo giờ máy — spec không nói ngày vận hành chốt lúc mấy giờ. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useEarnings() {
  const driverId = useDriverId();

  const query = useQuery({
    queryKey: qk.earnings(driverId),
    queryFn: async (): Promise<Earnings> => {
      const sb = requireSupabase();
      const since = startOfToday();
      const sinceIso = since.toISOString();

      const [tripsResult, rewardsResult] = await Promise.all([
        sb
          .from('trips')
          .select('base_fare, dropoff_at, status')
          .eq('driver_id', driverId)
          .eq('status', 'COMPLETED')
          .gte('dropoff_at', sinceIso),
        sb
          .from('reward_records')
          .select('amount, reward_type, status, reason, qualified_at')
          .eq('driver_id', driverId)
          .gte('qualified_at', sinceIso),
      ]);

      if (tripsResult.error) throw tripsResult.error;
      if (rewardsResult.error) throw rewardsResult.error;

      const trips = (tripsResult.data ?? []) as TripRow[];
      const rewards = (rewardsResult.data ?? []) as RewardRecord[];

      // NUMERIC của Postgres về client dạng chuỗi để khỏi mất chính xác; Number()
      // ở đây an toàn vì tiền VNĐ trong phạm vi demo còn xa giới hạn số nguyên của JS.
      const fares = trips.reduce((sum, t) => sum + Number(t.base_fare ?? 0), 0);
      const bonus = rewards.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

      return {
        fares,
        bonus,
        total: fares + bonus,
        tripCount: trips.length,
        date: since,
      };
    },
  });

  return {
    earnings: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
