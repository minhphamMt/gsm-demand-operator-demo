/**
 * Mapbox remains mounted behind every auth screen, so its baseline camera controller
 * must stay independent of driver-only data.  Campaign lookup lives in a separate
 * authenticated child rather than weakening `useDriverId()` to return null: the
 * latter would turn an invalid render boundary into silent, unauthorised no-op queries.
 */
import { useEffect, useMemo } from 'react';
import { useMap } from 'react-map-gl/mapbox';
import { useCampaign } from '../../data/useCampaign';
import { useDriverApp } from '../../state/DriverAppContext';
import { useSelectedCampaign } from '../../state/SelectedCampaignContext';
import { useDriverPosition } from '../../state/RouteContext';
import { CAMERA, CAMERA_DURATION } from '../../geo/locations';

/**
 * Headless child of `<Map>` that translates `cameraIntent` into camera moves.
 *
 * This data-free controller is safe while the login and profile-error screens are
 * visible. `CampaignCameraController` supplies an authorised target only after the
 * auth boundary has mounted it.
 *
 * `styleReady` gating matters: calling fitBounds/easeTo before the style finishes
 * loading is a silent no-op, leaving the map stuck at `initialViewState` and making
 * it look like the camera logic never ran.
 *
 * The 'route' intent is handled by the navigation route effect instead, which frames
 * the real geometry once Directions returns it.
 */
function pointToLngLat(point: GeoJSON.Point | null): [number, number] | null {
  if (!point || point.type !== 'Point' || !Array.isArray(point.coordinates)) return null;
  const [lng, lat] = point.coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

export function CameraController({
  styleReady,
  selectedNavigationTarget = null,
}: {
  styleReady: boolean;
  selectedNavigationTarget?: [number, number] | null;
}) {
  const { cameraIntent } = useDriverApp();
  const { current: map } = useMap();
  const driverPosition = useDriverPosition();
  const selectedLongitude = selectedNavigationTarget?.[0];
  const selectedLatitude = selectedNavigationTarget?.[1];

  useEffect(() => {
    if (!map || !styleReady || cameraIntent === 'driverFocus') return;

    if (cameraIntent === 'overview') {
      map.fitBounds(CAMERA.overview.bounds, {
        padding: { ...CAMERA.overview.padding },
        duration: CAMERA_DURATION,
      });
    } else if (cameraIntent === 'zoneFocus') {
      map.easeTo({
        // Selection/geometry lỗi vẫn giữ điểm demo cũ để các luồng mở sheet khác không hỏng.
        center:
          selectedLongitude != null && selectedLatitude != null
            ? [selectedLongitude, selectedLatitude]
            : CAMERA.zoneFocus.center,
        zoom: CAMERA.zoneFocus.zoom,
        padding: { ...CAMERA.zoneFocus.padding },
        duration: CAMERA_DURATION,
      });
    }
  }, [cameraIntent, map, selectedLatitude, selectedLongitude, styleReady]);

  useEffect(() => {
    if (!map || !styleReady || cameraIntent !== 'driverFocus') return;
    map.easeTo({
      center: driverPosition,
      zoom: CAMERA.driverFocus.zoom,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
      duration: CAMERA_DURATION,
    });
  }, [cameraIntent, driverPosition, map, styleReady]);

  return null;
}

/**
 * Auth-only boundary for campaign data.  Keeping it as a separate component makes
 * React mount `useCampaign()` only when `MapboxMapLayer` has confirmed a ready driver.
 */
export function CampaignCameraController({ styleReady }: { styleReady: boolean }) {
  const { selectedCampaignId } = useSelectedCampaign();
  const { campaigns } = useCampaign();
  const selectedNavigationTarget = useMemo(
    () => pointToLngLat(campaigns.find((campaign) => campaign.id === selectedCampaignId)?.navigation_target_geojson ?? null),
    [campaigns, selectedCampaignId],
  );

  return <CameraController styleReady={styleReady} selectedNavigationTarget={selectedNavigationTarget} />;
}
