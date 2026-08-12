/**
 * The driver location puck, with no positioning of its own.
 *
 * The wrapper must NOT carry the `pulseRing` animation: Mapbox rewrites
 * `transform: translate(...)` on the marker root every frame to keep it geo-anchored,
 * and the keyframe animates `transform: scale(...)`. If they land on the same element
 * they overwrite each other and the puck either freezes or flies off-screen.
 * Keeping the pulse on an inner child sidesteps the collision entirely.
 */
export function PuckBody() {
  return (
    <div style={{ position: 'relative', width: 22, height: 22 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: '#12b8c6',
          opacity: 0.35,
          animation: 'pulseRing 2.4s ease-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: '#0c8f9b',
          border: '3px solid #fff',
          boxShadow: '0 2px 6px rgba(0,0,0,.3)',
        }}
      />
    </div>
  );
}

/** Destination dot shown at the end of the navigation route. */
export function DestinationDot() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        border: '4px solid #0f8d99',
        boxSizing: 'border-box',
      }}
    />
  );
}
