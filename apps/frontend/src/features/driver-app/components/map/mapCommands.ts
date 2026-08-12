import type { MapRef } from 'react-map-gl/mapbox';
import { CAMERA, CAMERA_DURATION } from '../../geo/locations';
import type { LngLat } from '../../geo/locations';

/**
 * Imperative bridge to the live map instance.
 *
 * Chrome components such as `MapSideControls` render outside the `<Map>` tree, so
 * they cannot use `useMap()`. Rather than lifting camera state into React context —
 * which would fight the fact that the *map* is the source of truth once the user
 * starts dragging — the map registers itself here and chrome issues commands.
 *
 * Every command is a no-op when Mapbox is not active (the SVG fallback has no camera),
 * so callers never need to branch.
 */
let mapRef: MapRef | null = null;

export function setMapInstance(ref: MapRef | null): void {
  mapRef = ref;
}

const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };

export function recenterOnDriver(center: LngLat = CAMERA.driverFocus.center): void {
  mapRef?.easeTo({
    center,
    zoom: CAMERA.driverFocus.zoom,
    padding: NO_PADDING,
    duration: CAMERA_DURATION,
  });
}
