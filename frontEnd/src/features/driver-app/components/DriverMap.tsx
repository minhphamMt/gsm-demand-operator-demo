import { useState } from 'react';
import { useDriverApp } from '../state/DriverAppContext';
import { HAS_MAPBOX_TOKEN } from '../geo/mapboxConfig';
import { SvgMapLayer } from './map/SvgMapLayer';
import { MapboxMapLayer } from './map/MapboxMapLayer';

/**
 * The single map instance for the whole app, mounted once beneath every screen.
 *
 * Mounting once (rather than per-screen) avoids tearing down the WebGL context on
 * every screen change — that would cause a visible white flash and a style refetch —
 * and lets the demand → navigate transition animate as a camera move.
 *
 * Falls back to the hand-drawn SVG map in two cases: no usable token at build time,
 * and a token that Mapbox rejects at runtime. The second case matters most — without
 * it, an expired or revoked token renders a blank white screen mid-demo.
 */
export function DriverMap() {
  const { isMapScreen, isNavigate } = useDriverApp();
  const [mapFailed, setMapFailed] = useState(false);

  // BonusDetail covers the screen with its own background; no point running a map under it.
  if (!isMapScreen && !isNavigate) return null;

  if (!HAS_MAPBOX_TOKEN || mapFailed) return <SvgMapLayer />;

  return <MapboxMapLayer onFailure={() => setMapFailed(true)} />;
}
