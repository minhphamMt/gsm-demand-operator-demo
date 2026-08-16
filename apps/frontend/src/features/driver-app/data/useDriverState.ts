import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase } from '../lib/supabase';
import { useDriverId } from '../state/AuthProvider';
import type { DriverState } from './types';
import { qk } from './queryKeys';

/**
 * `driver_states` — spec §4.1 keeps exactly one row per driver and updates it in
 * place rather than appending.
 *
 * This is the hook that turns "online" from a React boolean into something that can
 * fail. The toggle updates optimistically and rolls back on error, because the map
 * screen reads offline/online to decide what to render and a silent failure would
 * leave the driver believing they are taking rides when the server disagrees.
 */

const COLUMNS = 'driver_id, is_online, operational_status, current_h3_index, location_updated_at, active_campaign_id';

export function useDriverState() {
  const driverId = useDriverId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: qk.driverState(driverId),
    queryFn: async (): Promise<DriverState | null> => {
      const { data, error } = await requireSupabase()
        .from('driver_states')
        .select(COLUMNS)
        .eq('driver_id', driverId)
        .maybeSingle();
      if (error) throw error;
      return (data as DriverState) ?? null;
    },
  });

  const setOnline = useMutation({
    mutationFn: async (next: boolean) => {
      const sb = requireSupabase();
      const patch = {
        is_online: next,
        // Từ vựng nhóm chốt (contract §5); DB không có CHECK nên đây là quy ước.
        operational_status: next ? 'IDLE' : 'OFFLINE',
      };

      // UPDATE trước, INSERT sau — cố tình KHÔNG dùng upsert.
      // Migration đã revoke UPDATE toàn bảng rồi grant lại theo cột, mà upsert của
      // PostgREST sinh ra `ON CONFLICT DO UPDATE SET driver_id = ...`; cột driver_id
      // không nằm trong danh sách được grant nên Postgres từ chối cả câu lệnh.
      const { data, error } = await sb
        .from('driver_states')
        .update(patch)
        .eq('driver_id', driverId)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as DriverState;

      // Tài xế chưa từng bật app -> chưa có dòng nào.
      const { data: inserted, error: insertError } = await sb
        .from('driver_states')
        .insert({ driver_id: driverId, ...patch })
        .select(COLUMNS)
        .single();
      if (insertError) throw insertError;
      return inserted as DriverState;
    },

    onMutate: async (next: boolean) => {
      await qc.cancelQueries({ queryKey: qk.driverState(driverId) });
      const previous = qc.getQueryData<DriverState | null>(qk.driverState(driverId));
      qc.setQueryData<DriverState | null>(qk.driverState(driverId), (old) =>
        old ? { ...old, is_online: next } : old,
      );
      return { previous };
    },

    onError: (_err, _next, ctx) => {
      if (ctx) qc.setQueryData(qk.driverState(driverId), ctx.previous);
    },

    onSettled: (data) => {
      if (data) qc.setQueryData(qk.driverState(driverId), data);
      else qc.invalidateQueries({ queryKey: qk.driverState(driverId) });
    },
  });

  return {
    driverState: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    /** Mặc định offline khi chưa có dữ liệu — an toàn hơn là mặc định đang nhận chuyến. */
    isOnline: query.data?.is_online === true,
    isToggling: setOnline.isPending,
    toggleError: setOnline.error,
    setOnline: (next: boolean) => setOnline.mutate(next),
    toggleOnline: () => setOnline.mutate(!(query.data?.is_online === true)),
  };
}
