import { IconButton } from '../../components/IconButton';
import { TargetIcon } from '../../components/icons';
import { useDriverApp } from '../../state/DriverAppContext';
import { useDriverPosition } from '../../state/RouteContext';
import { recenterOnDriver } from '../../components/map/mapCommands';

/**
 * Floating map controls (recenter).
 *
 * Lives in the chrome layer, outside any transformed container — previously it sat
 * inside the fake-zoom wrapper, which ballooned this 42px button whenever the demand
 * sheet opened. It sits just above the bottom dock so it does not compete with map content.
 */
export function MapSideControls() {
  const { showMapControls, powerBottom } = useDriverApp();
  const driverPosition = useDriverPosition();
  if (!showMapControls) return null;

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        bottom: powerBottom,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    >
      <IconButton size={42} onClick={() => recenterOnDriver(driverPosition)} ariaLabel="Định vị lại">
        <TargetIcon />
      </IconButton>
    </div>
  );
}
