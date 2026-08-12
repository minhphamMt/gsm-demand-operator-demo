import { useDriverApp } from '../../state/DriverAppContext';
import { MapSideControls } from './MapSideControls';
import { PowerControl } from './PowerControl';
import { NextTaskCard } from './NextTaskCard';
import { DemandBanner } from './DemandBanner';
import { BottomDock } from './BottomDock';

/**
 * Chrome for the map screens. The map itself (base layer, pins, puck, routes) lives
 * in `<DriverMap>`, mounted once by `PhoneShell` underneath this.
 *
 * `pointerEvents: 'none'` on the root is essential: this is a full-bleed layer sitting
 * on top of the map canvas, and without it every drag, wheel and pinch is swallowed
 * before reaching Mapbox. Each interactive child re-enables pointer events for itself.
 */
export function MapScreen() {
  const { isMapScreen } = useDriverApp();
  if (!isMapScreen) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <MapSideControls />
      <PowerControl />
      <NextTaskCard />
      <DemandBanner />
      <BottomDock />
    </div>
  );
}
