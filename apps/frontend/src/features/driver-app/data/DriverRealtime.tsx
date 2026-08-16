import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { requireSupabase } from '../lib/supabase';
import { useDriverId } from '../state/AuthProvider';
import { qk } from './queryKeys';

/**
 * Một subscription Realtime cho cả app, mount đúng một lần.
 *
 * Trước đây effect này nằm trong `useOffers`, mà hook đó được `NextTaskCard` và
 * `DemandBanner` dùng cùng lúc — hai component sinh ra hai channel TRÙNG TÊN TOPIC
 * trên cùng một client, điều Supabase Realtime không cho phép. Đặt ở đây thì số
 * subscription không còn phụ thuộc vào việc bao nhiêu component đang đọc dữ liệu.
 *
 * Không render gì; chỉ dịch sự kiện Postgres thành lệnh invalidate cache.
 */
export function DriverRealtime() {
  const driverId = useDriverId();
  const qc = useQueryClient();
  const [isPageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden');

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    // Realtime list_changes is an ongoing database workload. A background tab
    // cannot present an event to a driver, so release the channel instead of
    // keeping a WAL reader alive. Returning to the tab refetches authoritative
    // state before subscribing again.
    if (!isPageVisible) return;
    const sb = requireSupabase();
    void Promise.all([
      qc.invalidateQueries({ queryKey: qk.offers(driverId) }),
      qc.invalidateQueries({ queryKey: qk.campaigns(driverId) }),
      qc.invalidateQueries({ queryKey: qk.earnings(driverId) }),
    ]);

    const channel = sb
      .channel(`driver:${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_offers', filter: `driver_id=eq.${driverId}` },
        () => {
          qc.invalidateQueries({ queryKey: qk.offers(driverId) });
          qc.invalidateQueries({ queryKey: qk.campaigns(driverId) });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaign_participations',
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          // Trạng thái tham gia đổi thì phần thưởng cũng có thể đã được ghi.
          qc.invalidateQueries({ queryKey: qk.earnings(driverId) });
          // Cố ý CHƯA invalidate qk.participations ở đây: chưa có hook nào đọc key đó
          // (useParticipation.ts thuộc Epic 3) — thêm nhánh invalidate cho một cache
          // entry không ai đọc là dựng sẵn phần chưa cần (ADR-0011).
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Không ném lỗi: mất realtime nghĩa là dữ liệu cũ đi chứ app vẫn dùng
          // được, và ném ở đây sẽ đánh sập cả cây render.
          console.warn('[Realtime] không kết nối được:', status);
        }
      });

    return () => {
      sb.removeChannel(channel);
    };
  }, [driverId, isPageVisible, qc]);

  return null;
}
