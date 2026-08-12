import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Điều hướng màn hình và layout — KHÔNG chứa dữ liệu server.
 *
 * Trạng thái ở đây có đúng một giá trị tại một thời điểm và không bao giờ "đang tải"
 * hay "lỗi". Mọi thứ đến từ Supabase (trực tuyến/ngoại tuyến, thu nhập, offer) nằm
 * trong `src/data/` và component tự gọi hook, không đi vòng qua context này.
 * Xem docs/driver-integration-contract.md.
 *
 * Chú ý `home` là MỘT màn hình. Bản prototype có `homeOff`/`homeOn` riêng, nhưng sau
 * khi nối dữ liệu thật thì nguồn sự thật của trực tuyến/ngoại tuyến là
 * `driver_states.is_online`; giữ thêm một biến screen song song sẽ tạo hai nguồn sự
 * thật và chúng sẽ lệch nhau ngay lần mutation đầu tiên thất bại.
 */

export type Screen = 'home' | 'nextTask' | 'demand' | 'navigate' | 'bonusDetail';
export type Sheet = 'appInfo' | 'driveTime' | 'earnings' | 'demand' | null;

/**
 * What the camera should be framing. Intent only — once the user drags the map, the
 * map itself is the source of truth for actual camera position, so live center/zoom
 * deliberately does not live in React state.
 */
export type CameraIntent = 'driverFocus' | 'overview' | 'zoneFocus' | 'route';

interface AppState {
  screen: Screen;
  sheet: Sheet;
  /** Chỉ có ý nghĩa khi `screen === 'demand'` -- bấm "Khu vực thưởng" lần 2 chỉ ẩn coin
   * thưởng trên bản đồ, KHÔNG điều hướng rời màn `demand` (khác `pinsVisible` với việc
   * rời màn hình, vốn đã có `nav.home` lo). Reset về `true` mỗi lần vào lại `demand` qua
   * `nav.demand` để lần vào tiếp theo luôn thấy coin trước. */
  pinsVisible: boolean;
}

interface NavActions {
  home: () => void;
  nextTask: () => void;
  appInfo: () => void;
  driveTime: () => void;
  earnings: () => void;
  demand: () => void;
  demandSheet: () => void;
  navigate: () => void;
  bonusDetail: () => void;
}

interface DriverAppValue {
  state: AppState;
  nav: NavActions;
  closeSheet: () => void;
  togglePins: () => void;
  isMapScreen: boolean;
  isDemand: boolean;
  isNextTask: boolean;
  isNavigate: boolean;
  isBonusDetail: boolean;
  hasSheet: boolean;
  showScrim: boolean;
  isAppInfo: boolean;
  isDriveTime: boolean;
  isEarnings: boolean;
  isDemandSheet: boolean;
  showPins: boolean;
  showRoute: boolean;
  showMapControls: boolean;
  cameraIntent: CameraIntent;
  /** SVG-fallback only; ignored when Mapbox is active. Do not "clean up" — the no-token path needs it. */
  mapTransform: string;
  /** SVG-fallback only; ignored when Mapbox is active. */
  puckTop: string;
  /** SVG-fallback only; ignored when Mapbox is active. */
  pinLowTop: string;
  powerBottom: string;
  bannerBottom: string;
  screenCaption: string;
}

const SCREEN_CAPTIONS: Partial<Record<Screen, string>> = {
  home: '01 · Màn hình chính',
  nextTask: '03 · Nhiệm vụ tiếp theo — gợi ý khu vực',
  demand: '06 · Bản đồ khu vực nhu cầu cao',
  navigate: '13 · Dẫn đường đến khu vực',
  bonusDetail: '08 · Chi tiết chương trình thưởng nóng',
};

const SHEET_CAPTIONS: Partial<Record<Exclude<Sheet, null>, string>> = {
  appInfo: '04 · Sheet thông tin ứng dụng',
  driveTime: '05 · Sheet thời gian hoạt động',
  demand: '07 · Sheet thưởng nóng',
  earnings: '12 · Thu nhập hôm nay',
};

const DriverAppReactContext = createContext<DriverAppValue | null>(null);

export function DriverAppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({ screen: 'home', sheet: null, pinsVisible: true });

  const value = useMemo<DriverAppValue>(() => {
    const nav: NavActions = {
      home: () => setState((s) => ({ ...s, screen: 'home', sheet: null })),
      nextTask: () => setState((s) => ({ ...s, screen: 'nextTask', sheet: null })),
      appInfo: () => setState((s) => ({ ...s, screen: 'home', sheet: 'appInfo' })),
      driveTime: () => setState((s) => ({ ...s, screen: 'home', sheet: 'driveTime' })),
      earnings: () => setState((s) => ({ ...s, sheet: 'earnings' })),
      demand: () => setState((s) => ({ ...s, screen: 'demand', sheet: null, pinsVisible: true })),
      demandSheet: () => setState((s) => ({ ...s, screen: 'demand', sheet: 'demand' })),
      navigate: () => setState((s) => ({ ...s, screen: 'navigate', sheet: null })),
      bonusDetail: () => setState((s) => ({ ...s, screen: 'bonusDetail', sheet: null })),
    };

    const closeSheet = () => setState((s) => ({ ...s, sheet: null }));
    const togglePins = () => setState((s) => ({ ...s, pinsVisible: !s.pinsVisible }));

    const isMapScreen = (['home', 'nextTask', 'demand'] as Screen[]).includes(state.screen);
    const isDemand = state.screen === 'demand';
    const isDemandSheetOpen = isDemand && state.sheet === 'demand';

    return {
      state,
      nav,
      closeSheet,
      togglePins,
      isMapScreen,
      isDemand,
      isNextTask: state.screen === 'nextTask',
      isNavigate: state.screen === 'navigate',
      isBonusDetail: state.screen === 'bonusDetail',
      hasSheet: !!state.sheet,
      showScrim: !!state.sheet && state.sheet !== 'demand',
      isAppInfo: state.sheet === 'appInfo',
      isDriveTime: state.sheet === 'driveTime',
      isEarnings: state.sheet === 'earnings',
      isDemandSheet: state.sheet === 'demand',
      showPins: isDemand && state.pinsVisible,
      showRoute: isDemandSheetOpen,
      showMapControls: state.sheet !== 'demand',
      cameraIntent: (state.screen === 'navigate'
        ? 'route'
        : isDemandSheetOpen
          ? 'zoneFocus'
          : isDemand
            ? 'overview'
            : 'driverFocus') as CameraIntent,
      // The three fields below drive the SVG fallback only. Mapbox ignores them and
      // uses `cameraIntent` instead — but deleting them silently guts the no-token path.
      mapTransform: isDemandSheetOpen ? 'scale(2.05)' : 'none',
      puckTop: isDemandSheetOpen ? '330px' : '396px',
      pinLowTop: isDemandSheetOpen ? '356px' : '428px',
      // Nút trạng thái và control bản đồ phải neo cùng một mốc trên mọi màn hình;
      // dock bên dưới có cùng chiều cao khi chuyển sang "Khu vực thưởng".
      powerBottom: '169px',
      bannerBottom: isDemand ? '124px' : '112px',
      screenCaption: state.sheet ? (SHEET_CAPTIONS[state.sheet] ?? '') : (SCREEN_CAPTIONS[state.screen] ?? ''),
    };
  }, [state]);

  return <DriverAppReactContext.Provider value={value}>{children}</DriverAppReactContext.Provider>;
}

export function useDriverApp(): DriverAppValue {
  const ctx = useContext(DriverAppReactContext);
  if (!ctx) throw new Error('useDriverApp must be used within DriverAppProvider');
  return ctx;
}
