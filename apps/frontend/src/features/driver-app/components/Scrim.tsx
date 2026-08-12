import { useDriverApp } from '../state/DriverAppContext';

export function Scrim() {
  const { showScrim, closeSheet } = useDriverApp();
  if (!showScrim) return null;
  return (
    <div
      onClick={closeSheet}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(15,20,22,.42)',
        zIndex: 40,
        animation: 'fadeIn .2s ease-out',
      }}
    />
  );
}
