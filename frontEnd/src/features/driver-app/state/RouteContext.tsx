import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LineString } from 'geojson';
import { useDriverApp } from './DriverAppContext';
import { useDirections } from '../api/useDirections';
import type { DirectionsState } from '../api/useDirections';
import { DRIVER_START } from '../geo/locations';
import type { LngLat } from '../geo/locations';
import { useDriverLocation } from '../geo/useDriverLocation';
import type { DriverLocationState } from '../geo/useDriverLocation';
import { useAuth } from './AuthProvider';

/**
 * Holds the navigation route so the map layer (which draws it) and the navigation
 * chrome (which shows its distance, duration and turn instructions) share a single
 * fetch instead of each issuing their own.
 *
 * Story D.3 (Epic 5, sprint-change-proposal-2026-08-09.md): trước đây điểm đến luôn
 * là `REWARD_ZONE_CENTER` ghi cứng — một hằng số UI đứng vai trò dữ liệu nghiệp vụ,
 * đúng khoảng hở G-3 mà proposal đã ghi. Giờ điểm đến là STATE, đặt qua
 * `useSetDestination()` bởi bên gọi (D.2: popup Pull "Dẫn đường"; D.4: accept 201
 * "Dẫn đường" trên banner) — file này không tự suy ra điểm đến từ đâu cả, nó chỉ giữ
 * và phát lại giá trị đã được đặt.
 *
 * Phương án đã cân và loại: cho `RouteProvider` tự đọc `useOffers()`/`useCampaign()`
 * để tự suy điểm đến từ `pendingOffer`. Bị loại vì `RouteProvider` bọc cả `<Gate />`
 * trong App.tsx (kể cả màn chưa đăng nhập, xem `App.tsx`) — `useOffers()` gọi
 * `useDriverId()`, hàm này CỐ Ý throw ngoài vùng đã đăng nhập
 * (`state/AuthProvider.tsx`), nên gọi nó ở đây sẽ sập cả app ngay tại màn đăng nhập.
 * Giữ context này không phụ thuộc dữ liệu tài xế nào tránh được vấn đề đó, đổi lại
 * màn "gợi ý khu vực" (`nextTask`, ngoài phạm vi Epic 5 — xem P0-1 "mọi bề mặt khác
 * giữ nguyên") tự có fallback riêng khi chưa ai gọi `setDestination` (xem
 * `NextTaskCard.tsx`: đọc thẳng `pendingOffer.distance_m` khi `route.status !== 'ready'`).
 */
const RouteContext = createContext<DirectionsState>({ status: 'idle' });

const DriverPositionContext = createContext<DriverLocationState>({
  position: DRIVER_START,
  source: 'fallback',
  error: null,
});

interface DestinationState {
  point: LngLat | null;
  /** Tên khu vực để `NavigateScreen` hiển thị thay chuỗi "Cầu Giấy" ghi cứng cũ. */
  label: string | null;
}

interface DestinationApi {
  state: DestinationState;
  setDestination: (point: LngLat, label?: string | null) => void;
}

const DestinationContext = createContext<DestinationApi>({
  state: { point: null, label: null },
  setDestination: () => {
    // Mặc định no-op — chỉ chạm tới khi gọi ngoài <RouteProvider>, không nên xảy ra
    // trong cây component thật (RouteProvider mount ở App.tsx, bọc toàn app).
  },
});

export function RouteProvider({ children }: { children: ReactNode }) {
  const { isNavigate, isNextTask } = useDriverApp();
  const { status: authStatus } = useAuth();
  const driverLocation = useDriverLocation(authStatus === 'ready');
  const [destinationState, setDestinationState] = useState<DestinationState>({ point: null, label: null });
  const [navigationOrigin, setNavigationOrigin] = useState<LngLat>(DRIVER_START);

  const setDestination = useCallback((point: LngLat, label: string | null = null) => {
    setDestinationState({ point, label });
  }, []);

  // Keep the next navigation session's initial origin current while navigation is
  // closed, then freeze it for the session so GPS updates do not refetch Directions
  // on every watchPosition tick.
  useEffect(() => {
    if (!isNavigate) setNavigationOrigin(driverLocation.position);
  }, [driverLocation.position, isNavigate]);

  // Fetched on the suggestion card too, so its "cách bạn X km" agrees with what the
  // navigation screen will show — otherwise the two screens contradict each other.
  // Không gọi Directions khi chưa có điểm đến nào được đặt (destination null) — trước
  // đây luôn có REWARD_ZONE_CENTER nên `enabled` chỉ phụ thuộc màn hình; giờ còn phải
  // đợi điểm đến thật.
  const enabled = (isNavigate || isNextTask) && destinationState.point != null;
  const origin = isNavigate ? navigationOrigin : driverLocation.position;
  const directions = useDirections(origin, destinationState.point ?? DRIVER_START, enabled);

  const destinationApi = useMemo<DestinationApi>(
    () => ({ state: destinationState, setDestination }),
    [destinationState, setDestination],
  );

  return (
    <DriverPositionContext.Provider value={driverLocation}>
      <DestinationContext.Provider value={destinationApi}>
        <RouteContext.Provider value={directions}>{children}</RouteContext.Provider>
      </DestinationContext.Provider>
    </DriverPositionContext.Provider>
  );
}

export function useRoute(): DirectionsState {
  return useContext(RouteContext);
}

/** Đặt điểm đến Directions động — gọi từ popup Pull (D.2) hoặc sau accept 201 (D.4). */
export function useSetDestination(): (point: LngLat, label?: string | null) => void {
  return useContext(DestinationContext).setDestination;
}

/** Điểm đến hiện tại, nếu đã có ai gọi `useSetDestination()`. */
export function useDestination(): LngLat | null {
  return useContext(DestinationContext).state.point;
}

/** Tên khu vực đi kèm điểm đến hiện tại — xem `NavigateScreen.tsx`. */
export function useDestinationLabel(): string | null {
  return useContext(DestinationContext).state.label;
}

/** Current driver position shared by the route, map puck and camera controllers. */
export function useDriverPosition(): LngLat {
  return useContext(DriverPositionContext).position;
}

function isDrawableRoute(geometry: LineString): boolean {
  return (
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every((coordinate) => {
      const lng = coordinate[0];
      const lat = coordinate[1];
      return typeof lng === 'number' && typeof lat === 'number'
        && Number.isFinite(lng) && Number.isFinite(lat)
        && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
    })
  );
}

/**
 * The route geometry to draw.
 *
 * A line is published only after Directions has returned a real route.  A straight
 * driver → destination fallback was rejected because it looks navigable while the
 * API is still loading or has failed, and it also makes the map fit to false data.
 */
export function useNavGeometry(): LineString | null {
  const route = useRoute();
  const destination = useDestination();
  return useMemo<LineString | null>(() => {
    if (
      route.status !== 'ready' ||
      destination == null ||
      route.destination[0] !== destination[0] ||
      route.destination[1] !== destination[1] ||
      !isDrawableRoute(route.route.geometry)
    ) {
      return null;
    }

    return route.route.geometry;
  }, [destination, route]);
}
