import { useEffect, useMemo, useState } from 'react';
import { DRIVER_START } from './locations';
import type { LngLat } from './locations';

export type DriverLocationSource = 'geolocation' | 'fallback';

export interface DriverLocationState {
  position: LngLat;
  source: DriverLocationSource;
  error: string | null;
}

function isValidCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function readPosition(position: GeolocationPosition): LngLat | null {
  const { longitude, latitude } = position.coords;
  if (!isValidCoordinate(longitude, -180, 180) || !isValidCoordinate(latitude, -90, 90)) {
    return null;
  }
  return [longitude, latitude];
}

/**
 * Watches the driver's browser position only after the authenticated driver view is
 * ready. The demo coordinate remains a safe origin until a valid browser position is
 * available, and also covers denied permissions, unsupported browsers and timeouts.
 */
export function useDriverLocation(enabled: boolean): DriverLocationState {
  const [position, setPosition] = useState<LngLat>(DRIVER_START);
  const [source, setSource] = useState<DriverLocationSource>('fallback');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPosition(DRIVER_START);
      setSource('fallback');
      setError(null);
      return;
    }

    if (!navigator.geolocation) {
      setPosition(DRIVER_START);
      setSource('fallback');
      setError('Trình duyệt không hỗ trợ định vị.');
      return;
    }

    let active = true;
    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (next) => {
          if (!active) return;
          const nextPosition = readPosition(next);
          if (!nextPosition) {
            setPosition(DRIVER_START);
            setSource('fallback');
            setError('Tọa độ định vị không hợp lệ.');
            return;
          }
          setPosition(nextPosition);
          setSource('geolocation');
          setError(null);
        },
        (reason) => {
          if (!active) return;
          setPosition(DRIVER_START);
          setSource('fallback');
          setError(reason.message || 'Không lấy được vị trí hiện tại.');
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 10_000 },
      );
    } catch (reason) {
      setPosition(DRIVER_START);
      setSource('fallback');
      setError(reason instanceof Error ? reason.message : 'Không lấy được vị trí hiện tại.');
    }

    return () => {
      active = false;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  return useMemo(
    () => ({ position, source, error }),
    [error, position, source],
  );
}
