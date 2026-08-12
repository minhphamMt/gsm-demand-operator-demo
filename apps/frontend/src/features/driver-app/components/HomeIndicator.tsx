export function HomeIndicator({ height = 22 }: { height?: number }) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 134, height: 5, borderRadius: 3, background: '#1b2225', opacity: 0.85 }} />
    </div>
  );
}
