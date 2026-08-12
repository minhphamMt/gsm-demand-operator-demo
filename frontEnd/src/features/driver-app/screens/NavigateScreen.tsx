import { HomeIndicator } from '../components/HomeIndicator';
import { IconButton } from '../components/IconButton';
import { CoinBadge, NextTurnArrowIcon, SoundIcon, TargetIcon, TurnRightBigIcon } from '../components/icons';
import { useDriverApp } from '../state/DriverAppContext';
import { useDestinationLabel, useDriverPosition, useRoute } from '../state/RouteContext';
import { firstTurn, followingTurn } from '../api/directions';
import { formatArrival, formatDistance, formatDuration } from '../geo/format';
import { recenterOnDriver } from '../components/map/mapCommands';

/**
 * Values from the original design, used verbatim when Directions is unavailable
 * (no token) and as the shape the live data replaces.
 */
const NEUTRAL_FALLBACK = {
  turnDistance: '450 m',
  turnInstruction: 'Tiếp tục theo hướng điểm đến',
  duration: '9 phút',
  summary: 'Đang cập nhật lộ trình.',
} as const;

/**
 * Chrome for turn-by-turn navigation. The basemap, route line, driver puck and
 * destination dot are rendered by `<DriverMap>` underneath.
 *
 * Note there is deliberately no background colour here — this layer sits on top of the
 * live map canvas, and `pointerEvents: 'none'` keeps map gestures reaching it.
 */
export function NavigateScreen() {
  const { isNavigate, nav } = useDriverApp();
  const route = useRoute();
  const destinationLabel = useDestinationLabel();
  const driverPosition = useDriverPosition();

  if (!isNavigate) return null;

  const loading = route.status === 'loading';
  const step = route.status === 'ready' ? firstTurn(route.route) : undefined;
  const next = route.status === 'ready' ? followingTurn(route.route) : undefined;

  // The turn card is a fixed-size dark box — never blank it, or the layout collapses
  // mid-demo. Swap the text instead, and use neutral copy on failure rather than
  // inventing a location that is unrelated to the selected campaign.
  const turnDistance = step ? formatDistance(step.distance) : loading ? '—' : NEUTRAL_FALLBACK.turnDistance;
  const turnInstruction = step
    ? step.maneuver.instruction
    : loading
      ? 'Đang tính tuyến đường…'
      : NEUTRAL_FALLBACK.turnInstruction;
  const nextStreet = next?.name ?? null;
  const durationText = route.status === 'ready' ? formatDuration(route.route.duration) : loading ? '— phút' : NEUTRAL_FALLBACK.duration;
  // "Cầu Giấy" ghi cứng trước đây thay bằng tên khu vực của campaign đang dẫn
  // (đặt cùng lúc với điểm đến qua `useSetDestination()`, xem RouteContext.tsx) —
  // bỏ hẳn đoạn "· <tên>" khi không có nhãn, không đoán một tên khác.
  const summaryText =
    route.status === 'ready'
      ? `${formatDistance(route.route.distance)} · đến ${formatArrival(route.route.duration)}` +
        (destinationLabel ? ` · ${destinationLabel}` : '')
      : loading
        ? 'Đang tải…'
        : NEUTRAL_FALLBACK.summary;

  // The icon set only has a right-turn glyph; mirror it for left manoeuvres so the
  // arrow at least agrees with the instruction text.
  const mirrorTurn = step?.maneuver.modifier?.includes('left') ?? false;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          top: 58,
          boxSizing: 'border-box',
          background: '#15191b',
          borderRadius: 16,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          boxShadow: '0 8px 24px rgba(0,0,0,.3)',
          zIndex: 20,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ flex: 'none', transform: mirrorTurn ? 'scaleX(-1)' : undefined, display: 'flex' }}>
          <TurnRightBigIcon />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ font: "800 26px/1 'Be Vietnam Pro',sans-serif", color: '#fff', letterSpacing: '-0.01em', opacity: loading ? 0.5 : 1 }}>
            {turnDistance}
          </div>
          <div style={{ font: "500 14.5px/1.35 'Be Vietnam Pro',sans-serif", color: 'rgba(255,255,255,.82)', marginTop: 5 }}>{turnInstruction}</div>
        </div>
      </div>

      {nextStreet && (
        <div
          style={{
            position: 'absolute',
            left: 26,
            right: 26,
            top: 146,
            boxSizing: 'border-box',
            background: '#2b3134',
            borderRadius: '0 0 12px 12px',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            zIndex: 19,
            pointerEvents: 'auto',
          }}
        >
          <span style={{ font: "400 12px/1 'Be Vietnam Pro',sans-serif", color: 'rgba(255,255,255,.6)' }}>Sau đó</span>
          <NextTurnArrowIcon />
          <span style={{ font: "600 12.5px/1 'Be Vietnam Pro',sans-serif", color: '#fff' }}>{nextStreet}</span>
        </div>
      )}

      <div style={{ position: 'absolute', right: 16, top: 578, display: 'flex', flexDirection: 'column', gap: 11, zIndex: 20, pointerEvents: 'auto' }}>
        <IconButton size={42} ariaLabel="Âm thanh dẫn đường">
          <SoundIcon />
        </IconButton>
        <IconButton size={42} onClick={() => recenterOnDriver(driverPosition)} ariaLabel="Định vị lại">
          <TargetIcon />
        </IconButton>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 96,
          boxSizing: 'border-box',
          background: '#fffaeb',
          border: '1px solid #f4e3b6',
          borderRadius: 12,
          padding: '10px 12px',
          display: 'flex',
          gap: 9,
          alignItems: 'flex-start',
          zIndex: 20,
          pointerEvents: 'auto',
        }}
      >
        <CoinBadge size={18} />
        <div style={{ font: "500 12.5px/1.45 'Be Vietnam Pro',sans-serif", color: '#7a5a12' }}>
          Hoàn thành chuyến đầu tiên trong khu vực trước <span style={{ fontWeight: 700, color: '#5f430a' }}>18:30</span> để nhận thưởng 35.000đ.
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          background: '#fff',
          borderRadius: '18px 18px 0 0',
          boxShadow: '0 -3px 20px rgba(0,0,0,.12)',
          zIndex: 25,
          padding: '14px 16px 0',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ font: "800 20px/1 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>{durationText}</div>
            <div style={{ font: "400 13px/1.35 'Be Vietnam Pro',sans-serif", color: '#8b9296', marginTop: 4 }}>{summaryText}</div>
          </div>
          <button
            onClick={nav.nextTask}
            style={{
              height: 44,
              padding: '0 24px',
              borderRadius: 24,
              border: '1.6px solid #e7c9c6',
              background: '#fdf3f2',
              font: "600 14.5px/1 'Be Vietnam Pro',sans-serif",
              color: '#c2362c',
              cursor: 'pointer',
              flex: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Kết thúc
          </button>
        </div>
        <HomeIndicator height={26} />
      </div>
    </div>
  );
}
