import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptOffer } from '../api/driverApi';
import type { AcceptOfferResult, DriverApiError } from '../api/driverApi';
import { useDriverId } from '../state/AuthProvider';
import { qk } from './queryKeys';

/**
 * Mutation hook cho "Nhận lời mời" (làn B, story 2.3's `POST .../accept`).
 *
 * Tách riêng khỏi `useDeclineOffer` dù cả hai đều gọi driverApi + invalidate cache:
 * accept đổi ba nhóm cache (offers, driverState, participations), decline chỉ đổi
 * một (offers). Gộp thành một `useOfferDecision(kind)` sẽ buộc mọi call site phải
 * tự nhớ truyền đúng `kind` thay vì gọi thẳng đúng hook — cùng lý do
 * `useDriverState`/`useOffers` đã tách theo resource, không theo "một hook cho mọi
 * thao tác driver_offers".
 *
 * `useMutation` (TanStack Query v5) does not supply its own `AbortSignal` to
 * `mutationFn` the way `useQuery` does for `queryFn` — `MutationFunctionContext`
 * only carries `{client, meta, mutationKey}`. So this hook creates its own
 * `AbortController` per call and aborts it on unmount — same tool (`AbortController`
 * threaded into fetch) as `useDirections.ts`, but a different lifecycle: that hook's
 * controller is scoped to one `useEffect` run, this one is scoped to one `mutate()`
 * call, so a stray previous controller is explicitly aborted before being replaced
 * (see `mutationFn` below).
 */
export function useAcceptOffer() {
  const driverId = useDriverId();
  const qc = useQueryClient();
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const mutation = useMutation<AcceptOfferResult, DriverApiError, string>({
    mutationFn: (offerId: string): Promise<AcceptOfferResult> => {
      // Abort any still-in-flight call from a previous invocation before replacing the
      // ref — otherwise a rapid second call (double-tap) overwrites the only reference
      // to the first controller, and unmount can no longer cancel that first request.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      return acceptOffer(offerId, controller.signal);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.offers(driverId) });
      qc.invalidateQueries({ queryKey: qk.driverState(driverId) });
      qc.invalidateQueries({ queryKey: qk.participations(driverId) });
    },
  });

  return {
    accept: (offerId: string) => mutation.mutate(offerId),
    acceptAsync: (offerId: string) => mutation.mutateAsync(offerId),
    isPending: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
  };
}
