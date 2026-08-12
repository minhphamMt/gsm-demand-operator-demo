/**
 * The phone shell deliberately preserves one Mapbox instance through authentication
 * changes. Driver-only map children are therefore gated here, instead of changing
 * data hooks to tolerate missing identity and accidentally masking broken auth flow.
 * Navigation lines likewise mount only for confirmed Directions geometry: a straight
 * fallback would falsely suggest a route exists and make the camera fit to invented data.
 */
import { useCallback, useEffect, useState } from 'react';
import Map, { AttributionControl, Layer, Marker, Source, useMap } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { LineString } from 'geojson';
import { useDriverApp } from '../../state/DriverAppContext';
import { useAuth } from '../../state/AuthProvider';
import { useDestination, useDriverPosition, useNavGeometry } from '../../state/RouteContext';
import { MAPBOX_STYLE, MAPBOX_TOKEN } from '../../geo/mapboxConfig';
import { CAMERA, DEFAULT_BEARING, DEFAULT_PITCH, ROUTE_FIT_PADDING } from '../../geo/locations';
import { CameraController, CampaignCameraController } from './CameraController';
import { CampaignZoneLayer } from './CampaignZoneLayer';
import { setMapInstance } from './mapCommands';
import { DestinationDot, PuckBody } from './PuckBody';

export function MapboxMapLayer({ onFailure }: { onFailure: () => void }) {
  const { showPins, isNavigate } = useDriverApp();
  const { status: authStatus } = useAuth();
  const [styleReady, setStyleReady] = useState(false);
  const navGeometry = useNavGeometry();
  const destination = useDestination();
  const driverPosition = useDriverPosition();

  const handleRef = useCallback((ref: MapRef | null) => {
    setMapInstance(ref);
  }, []);

  const handleError = useCallback(
    (evt: { error?: { message?: string } }) => {
      // Mapbox surfaces HTTP failures on the error object but does not type `status`.
      const status = (evt.error as { status?: number } | undefined)?.status;
      if (status === 401 || status === 403) {
        console.error(
          `[mapbox] Token rejected (HTTP ${status}). Check VITE_MAPBOX_TOKEN in frontend/.env — ` +
            'it must be a valid public "pk.*" token. Falling back to the offline SVG map.',
        );
        onFailure();
        return;
      }
      console.warn('[mapbox]', evt.error?.message ?? evt);
    },
    [onFailure],
  );

  // Story D.1 (Epic 5): trước đây chạm vào vùng chiến dịch phải bắt qua
  // `interactiveLayerIds` + `onClick` trên <Map> gốc, vì layer `fill`/`line` không tự có
  // sự kiện click. Icon giờ là <Marker> bọc <button> thật (CampaignZoneLayer.tsx) nên
  // tự nhận click/tab/enter của chính nó — không cần cơ chế này nữa.

  return (
    <Map
      ref={handleRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle={MAPBOX_STYLE}
      // Pin the projection so swapping in a style that defaults to globe (e.g. Standard)
      // cannot silently curve the map inside a 390x844 phone frame.
      projection="mercator"
      initialViewState={{
        longitude: CAMERA.driverFocus.center[0],
        latitude: CAMERA.driverFocus.center[1],
        zoom: CAMERA.driverFocus.zoom,
        pitch: DEFAULT_PITCH,
        bearing: DEFAULT_BEARING,
      }}
      // Default control is disabled so the compact variant below can replace it —
      // attribution must stay visible (Mapbox ToS), see global.css for the offset
      // that keeps it clear of the bottom dock.
      attributionControl={false}
      logoPosition="top-right"
      onLoad={() => setStyleReady(true)}
      onError={handleError}
      style={{ position: 'absolute', inset: 0 }}
    >
      <AttributionControl compact position="top-right" />
      {authStatus === 'ready' ? (
        <CampaignCameraController styleReady={styleReady} />
      ) : (
        <CameraController styleReady={styleReady} />
      )}
      {isNavigate && navGeometry && (
        <RouteFitter styleReady={styleReady} geometry={navGeometry} />
      )}

      {isNavigate && navGeometry && (
        <Source id="nav-route" type="geojson" data={{ type: 'Feature', properties: {}, geometry: navGeometry }}>
          {/* Casing first, then the core line on top — matches the original two-stroke design. */}
          <Layer
            id="nav-route-casing"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#0b7f8b', 'line-width': 14, 'line-opacity': 0.25 }}
          />
          <Layer
            id="nav-route-core"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#12b8c6', 'line-width': 9 }}
          />
        </Source>
      )}

      {/* Story D.3: điểm đến động, không còn REWARD_ZONE_CENTER ghi cứng — không render
          gì khi chưa ai gọi `useSetDestination()` (destination null) thay vì rơi về một
          toạ độ mặc định không có ý nghĩa nghiệp vụ. */}
      {isNavigate && destination && (
        <Marker longitude={destination[0]} latitude={destination[1]} anchor="center">
          <DestinationDot />
        </Marker>
      )}

      {authStatus === 'ready' && showPins && <CampaignZoneLayer />}

      <Marker longitude={driverPosition[0]} latitude={driverPosition[1]} anchor="center">
        <PuckBody />
      </Marker>
    </Map>
  );
}

/** Frames the navigation route between the turn card above and the ETA sheet below. */
function RouteFitter({ styleReady, geometry }: { styleReady: boolean; geometry: LineString }) {
  const { isNavigate } = useDriverApp();
  const { current: map } = useMap();
  const coordinates = geometry.coordinates;

  useEffect(() => {
    if (!map || !styleReady || !isNavigate || coordinates.length === 0) return;

    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const coordinate of coordinates) {
      const lng = coordinate[0];
      const lat = coordinate[1];
      if (typeof lng !== 'number' || typeof lat !== 'number') continue;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }

    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return;
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: { ...ROUTE_FIT_PADDING }, duration: 700, maxZoom: 16 },
    );

    // Khi route bị gỡ vì đổi đích, dừng animation cũ thay vì để camera bay theo tuyến đã mất.
    return () => {
      map.stop();
    };
  }, [map, styleReady, isNavigate, coordinates]);

  return null;
}
