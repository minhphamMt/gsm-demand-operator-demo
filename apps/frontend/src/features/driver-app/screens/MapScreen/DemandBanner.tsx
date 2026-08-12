import { useCallback, useEffect, useRef, useState } from "react";
import { CoinBadge, LeafIcon, PinOutlineIcon } from "../../components/icons";
import { useDriverApp } from "../../state/DriverAppContext";
import { useOffers } from "../../data/useOffers";
import { useAcceptOffer } from "../../data/useAcceptOffer";
import { useDeclineOffer } from "../../data/useDeclineOffer";
import { useAuth } from "../../state/AuthProvider";
import { useSetDestination } from "../../state/RouteContext";
import { useSelectedCampaign } from "../../state/SelectedCampaignContext";
import { NoticeTransient } from "../../components/NoticeTransient";
import type { DriverErrorCode } from "../../api/driverApi";
import { formatVnd } from "../../geo/format";
import type { LngLat } from "../../geo/locations";
import type { DriverOfferNotification } from "../../data/types";
import { clearDemoOperatorOffer } from "../../data/useDemoOperatorOffer";

/**
 * Mount point cho cả hai biến thể của làn B: Pull-ambient (tài xế tự chạm để xem, đã
 * có từ trước) và Push (thông báo chủ động khi có `pendingOffer`, story 2.6). Chúng
 * loại trừ nhau theo `screen` (`'demand'` cho Pull, `'home'` cho Push) nên gộp thành
 * một fragment ở đây là an toàn — không có lúc nào cả hai cùng render — thay vì buộc
 * `screens/MapScreen/index.tsx` (ngoài sở hữu file của story này) phải biết render
 * thêm một component thứ hai.
 */
export function DemandBanner() {
  return (
    <>
      <PullAmbientBanner />
      <PushOfferBanner />
    </>
  );
}

/**
 * Biến thể Pull-ambient của làn B (tài xế tự chạm để xem, không bị đẩy thông báo).
 * Không đổi so với trước story 2.6 — chỉ đổi tên hàm khi tách khỏi `DemandBanner`.
 */
function PullAmbientBanner() {
  const { isDemand, hasSheet, bannerBottom, nav } = useDriverApp();
  const { pendingOffer } = useOffers();
  const { selectCampaign } = useSelectedCampaign();
  const [dismissed, setDismissed] = useState(false);

  // Điều kiện hiển thị được ghép tại chỗ thay vì nhận một cờ `showDemandBanner` dọn
  // sẵn: một nửa điều kiện là điều hướng, nửa kia là dữ liệu, và gộp chúng trong
  // context sẽ buộc context phải biết về offer.
  if (!isDemand || hasSheet || dismissed || !pendingOffer) return null;

  const bonus = pendingOffer.campaigns?.bonus_amount;
  const displayAreaName =
    pendingOffer.campaigns?.display_area_name ?? "điểm gợi ý";

  const openSelectedCampaign = () => {
    selectCampaign(pendingOffer.campaign_id);
    nav.demandSheet();
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        boxSizing: "border-box",
        bottom: bannerBottom,
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,.18)",
        zIndex: 30,
        pointerEvents: "auto",
        overflow: "hidden",
        animation: "fadeIn .25s ease-out",
      }}
    >
      <button
        onClick={openSelectedCampaign}
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          padding: "13px 14px",
          border: 0,
          background: "transparent",
          cursor: "pointer",
        }}
      >
        <CoinBadge size={22} />
        <div
          style={{
            flex: 1,
            font: "500 13px/1.45 'Be Vietnam Pro',sans-serif",
            color: "#3f484c",
          }}
        >
          <div>
            Để tăng cơ hội nhận đơn, Bác tài hãy tới: {displayAreaName}.
          </div>
          <div style={{ marginTop: 5, fontWeight: 700 }}>
            Thưởng thêm: {formatVnd(bonus)}.
          </div>
          <NotificationMetadata notification={pendingOffer.notification} />
        </div>
      </button>
      <div style={{ display: "flex", borderTop: "1px solid #eceeef" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDismissed(true);
          }}
          style={{
            flex: 1,
            border: 0,
            background: "transparent",
            padding: "11px 0",
            font: "600 13.5px/1 'Be Vietnam Pro',sans-serif",
            color: "#8b9296",
            cursor: "pointer",
          }}
        >
          Bỏ qua
        </button>
        <div style={{ width: 1, background: "#eceeef" }} />
        <button
          onClick={openSelectedCampaign}
          style={{
            flex: 1,
            border: 0,
            background: "transparent",
            padding: "11px 0",
            font: "600 13.5px/1 'Be Vietnam Pro',sans-serif",
            color: "#0aa7b4",
            cursor: "pointer",
          }}
        >
          Xem chi tiết
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Biến thể Push (story 2.6)
// ---------------------------------------------------------------------------------

/** Trạng thái nội bộ — gợi ý ở Design Notes của spec, `'closed'` gộp cả decline thành
 * công lẫn hai nhánh lỗi "đóng banner" (target reached/expired/not-pending/not-found)
 * vì cả ba đều kết thúc ở cùng một chỗ: banner biến mất cho tới khi có offer mới.
 *
 * Story D.4 (Epic 5): bản trước có thêm nhánh `'accepted'` để giữ banner ở một sub-view
 * "đang chỉ đường" MÀ KHÔNG chuyển màn thật — khi đó `RouteContext` chưa nhận được điểm
 * đến động (deferred-work.md mục spec-2-6), nên chỉ có thể bay camera
 * (`flyToTarget`), không thể vẽ tuyến hay đổi `screen`. D.3 đã đóng khoảng hở đó
 * (`useSetDestination`), nên accept thành công giờ CHUYỂN THẲNG sang `NavigateScreen`
 * thật — không còn cần một sub-view banner riêng để giả lập điều đó nữa. */
type PushPhase =
  | { kind: "idle" }
  | { kind: "closed" }
  | {
      kind: "accepted";
      offerId: string;
      notification: DriverOfferNotification;
      navigationTarget: LngLat | null;
    };

interface PushNotice {
  message: string;
  /** Chỉ nhánh INTERNAL/CAMPAIGN_NOT_ACTIVE có thử lại — xem bảng lỗi trong spec. */
  retryLabel?: string;
}

/** Ghi nhớ lệnh gọi gần nhất để nút "Thử lại" phát lại đúng accept/decline đã lỗi.
 * `campaignLabel` chụp lại TÊN campaign tại thời điểm bấm — không đọc lại từ
 * `pendingOffer` lúc accept thành công vì khi đó offer đã đổi trạng thái khỏi
 * SENT/VIEWED, `pendingOffer` (và `campaigns` ghép theo nó) có thể đã null. */
type LastAction = {
  kind: "accept" | "decline";
  offerId: string;
  sentAt?: string | null;
  campaignLabel?: string | null;
  notification?: DriverOfferNotification;
} | null;

function pointToLngLat(point: unknown): LngLat | null {
  if (!point || typeof point !== "object") return null;
  const candidate = point as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== "Point" || !Array.isArray(candidate.coordinates) || candidate.coordinates.length < 2) return null;
  const [longitude, latitude] = candidate.coordinates;
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }
  return [longitude, latitude];
}

function formatNotificationTime(value: string | null): string {
  if (!value) return "Chưa rõ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa rõ";
  return date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function offerStatusLabel(status: string): string {
  switch (status) {
    case "SENT":
      return "Mới gửi";
    case "VIEWED":
      return "Đã xem";
    case "ACCEPTED":
      return "Đã nhận đề xuất";
    case "DECLINED":
      return "Đã từ chối";
    case "EXPIRED":
      return "Đã hết hạn";
    default:
      return status;
  }
}

function NotificationMetadata({ notification }: { notification: DriverOfferNotification }) {
  const latitude = notification.latitude?.toFixed(4) ?? "—";
  const longitude = notification.longitude?.toFixed(4) ?? "—";
  return (
    <div style={{ display: "grid", gap: 3, marginTop: 8, font: "400 11.5px/1.35 'Be Vietnam Pro',sans-serif", color: "#687175" }}>
      <div>Địa điểm: {notification.placeName ?? "Chưa có tên địa điểm"}</div>
      <div>Latitude: {latitude} · Longitude: {longitude}</div>
      <div>Thưởng: {formatVnd(notification.incentive)}</div>
      <div>Tạo lúc: {formatNotificationTime(notification.createdAt)} · Trạng thái: {offerStatusLabel(notification.status)}</div>
    </div>
  );
}

function DemoHotProgramBanner({
  notification,
  distanceMeters,
  etaSeconds,
  onDismiss,
  onNavigate,
}: {
  notification: DriverOfferNotification;
  distanceMeters: number | null;
  etaSeconds: number | null;
  onDismiss: () => void;
  onNavigate: () => void;
}) {
  const distanceKm = ((distanceMeters ?? 0) / 1000).toFixed(1).replace('.', ',');
  const etaMinutes = Math.max(1, Math.round((etaSeconds ?? 0) / 60));

  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: "112px",
        boxSizing: "border-box",
        background: "#FFFFFF",
        borderRadius: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,.18)",
        zIndex: 30,
        pointerEvents: "auto",
        overflow: "hidden",
        animation: "fadeIn .25s ease-out",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "16px 16px 14px" }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: "#FFF0D9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <LeafIcon size={22} color="#F2762E" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "700 15.5px/1.3 'Be Vietnam Pro',sans-serif", color: "#20282B" }}>
            Có chương trình thưởng nóng đang mở gần bạn.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, font: "400 13px/1.3 'Be Vietnam Pro',sans-serif", color: "#687175" }}>
            <PinOutlineIcon size={15} color="#8B9296" />
            <span>Cách bạn {distanceKm} km · khoảng {etaMinutes} phút.</span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              marginTop: 10,
              padding: "9px 10px",
              border: "1px solid #F2D699",
              borderRadius: 10,
              background: "#FFFBF1",
              font: "500 13px/1.35 'Be Vietnam Pro',sans-serif",
              color: "#845D16",
            }}
          >
            <CoinBadge size={18} />
            <span>
              Thưởng {formatVnd(notification.incentive)} khi đến khu vực và hoạt động trong vùng thưởng — {notification.placeName ?? "khu vực được gợi ý"}.
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid #E5E7EB" }}>
        <button
          onClick={onDismiss}
          style={{
            flex: 1,
            minHeight: 48,
            border: 0,
            background: "#FFFFFF",
            font: "600 15px/1 'Be Vietnam Pro',sans-serif",
            color: "#00A6B2",
            cursor: "pointer",
          }}
        >
          Bỏ qua
        </button>
        <div style={{ width: 1, background: "#E5E7EB" }} />
        <button
          onClick={onNavigate}
          style={{
            flex: 1,
            minHeight: 48,
            border: 0,
            background: "#FFFFFF",
            font: "600 15px/1 'Be Vietnam Pro',sans-serif",
            color: "#00A6B2",
            cursor: "pointer",
          }}
        >
          Dẫn đường
        </button>
      </div>
    </div>
  );
}

/**
 * Biến thể Push của làn B: banner tự trồi lên khi có `pendingOffer` trong khi tài xế
 * đang ở màn hình chính (`screen === 'home'`), không cần tài xế tự bấm vào đâu để mở
 * ra như biến thể Pull-ambient ở trên.
 *
 * Vì sao tách hẳn state machine (`PushPhase`) khỏi việc đọc thẳng `pendingOffer`: sau
 * khi accept thành công, `useAcceptOffer`'s `onSuccess` invalidate `qk.offers`, offer
 * vừa nhận đổi status khỏi `SENT/VIEWED` nên không còn là `pendingOffer` nữa — nhưng
 * banner vẫn phải đứng yên ở sub-view "đang chỉ đường" (AC), không được biến mất theo
 * `pendingOffer`. `phase` vì vậy là nguồn sự thật cho *cách hiển thị*, `pendingOffer`
 * chỉ còn là nguồn dữ liệu cho nội dung khi `phase.kind === 'idle'`.
 *
 * `accept.error`/`decline.error` (kiểu `DriverApiError | null`, TanStack Query tự giữ
 * tới lần `mutate()` kế tiếp — xem Design Notes) được đọc trong `useEffect`, không đọc
 * trực tiếp trong JSX, vì hai trong sáu nhánh lỗi (`UNAUTHENTICATED`/`NOT_A_DRIVER` →
 * `signOut()`) là side effect thật, phải chạy đúng một lần khi lỗi xuất hiện — gọi
 * thẳng trong thân render sẽ gọi lại mỗi lần component re-render.
 */
function PushOfferBanner() {
  const { state, hasSheet, bannerBottom, nav } = useDriverApp();
  const { pendingOffer, activeOffer, activeNotification } = useOffers();
  const accept = useAcceptOffer();
  const decline = useDeclineOffer();
  const { signOut } = useAuth();
  const setDestination = useSetDestination();

  const [phase, setPhase] = useState<PushPhase>({ kind: "idle" });
  const [notice, setNotice] = useState<PushNotice | null>(null);
  /** Chỉ để nút "Thử lại" phát lại đúng lệnh gọi vừa lỗi — KHÔNG dùng để quyết định
   * lúc nào mở lại banner (xem `closedForOfferIdRef` bên dưới, hai việc tách biệt để
   * tránh việc dọn một ref làm hỏng logic đọc ref kia). */
  const lastActionRef = useRef<LastAction>(null);
  /** Id của offer đã khiến banner chuyển sang 'closed' gần nhất (đóng hẳn hoặc đóng lặng
   * lẽ) — cơ sở duy nhất để biết một `pendingOffer` mới xuất hiện có phải offer KHÁC hay
   * không, để mở lại banner. Không dùng `lastActionRef` cho việc này vì nó bị dọn về
   * `null` sau khi decline thành công (xem effect decline bên dưới). */
  const closedForOfferIdRef = useRef<string | null>(null);
  const closedForOfferSentAtRef = useRef<string | null>(null);

  const offerId = pendingOffer?.id ?? null;
  const pendingOfferSentAt = pendingOffer?.sent_at ?? null;
  const acceptedOfferId = phase.kind === "accepted" ? phase.offerId : null;
  // Reset về 'idle' khi một offer MỚI (id khác offer đã khiến banner đóng gần nhất)
  // xuất hiện — nhưng CHỈ khi banner đã 'closed' (đóng hẳn/im lặng). Không reset lúc
  // 'accepted': nếu không, một offer không liên quan xuất hiện giữa lúc tài xế đang ở
  // sub-view chỉ đường sẽ kéo banner quay lại màn chọn, đè lên đúng bất biến "phase là
  // nguồn sự thật, không phụ thuộc pendingOffer" ghi ở doc-comment trên hàm.
  useEffect(() => {
    if (
      phase.kind === "closed" &&
      offerId &&
      (offerId !== closedForOfferIdRef.current || pendingOfferSentAt !== closedForOfferSentAtRef.current)
    ) {
      setPhase({ kind: "idle" });
      setNotice(null);
      closedForOfferSentAtRef.current = null;
      return;
    }
    if (phase.kind === "accepted" && offerId && offerId !== acceptedOfferId) {
      setPhase({ kind: "idle" });
      setNotice(null);
    }
  }, [acceptedOfferId, offerId, pendingOfferSentAt, phase.kind]);

  useEffect(() => {
    if (phase.kind !== "idle" || pendingOffer || !activeOffer || !activeNotification) return;
    const { longitude, latitude } = activeNotification;
    const navigationTarget = longitude != null && latitude != null ? [longitude, latitude] as LngLat : null;
    setPhase({
      kind: "accepted",
      offerId: activeOffer.id,
      notification: activeNotification,
      navigationTarget,
    });
  }, [activeNotification, activeOffer, pendingOffer, phase.kind]);

  // Ưu tiên id offer của lệnh vừa lỗi (`lastActionRef`) hơn `offerId` hiện tại — cùng lý
  // do effect decline thành công bên dưới: tới lúc lỗi được xử lý, Realtime/invalidate
  // có thể đã đổi `pendingOffer` rồi.
  const closeBanner = useCallback(() => {
    closedForOfferIdRef.current = lastActionRef.current?.offerId ?? offerId;
    closedForOfferSentAtRef.current = lastActionRef.current?.sentAt ?? pendingOfferSentAt;
    setPhase({ kind: "closed" });
  }, [offerId, pendingOfferSentAt]);

  // Rẽ nhánh lỗi đúng theo bảng AD-17 trong Boundaries — không nhánh nào so khớp
  // `message`, chỉ so khớp `code`. `CAMPAIGN_NOT_ACTIVE` (BLK-1, chưa có hàng AD-17) và
  // `INVALID_LOCATION` (mã dành cho endpoint location, không áp dụng ở đây) đều rơi
  // vào `default` cùng `INTERNAL` — nhánh mặc định an toàn theo quyết định trong spec.
  const handleOfferError = useCallback(
    (code: DriverErrorCode) => {
      switch (code) {
        case "CAMPAIGN_TARGET_REACHED":
          closeBanner();
          setNotice({ message: "Chiến dịch đã đủ tài xế." });
          break;
        case "OFFER_EXPIRED":
          closeBanner();
          setNotice({ message: "Lời mời đã hết hạn." });
          break;
        case "OFFER_NOT_PENDING":
        case "OFFER_NOT_FOUND":
          closeBanner();
          break;
        case "ALREADY_IN_CAMPAIGN":
          setNotice({ message: "Bạn đang tham gia một chiến dịch khác." });
          break;
        case "UNAUTHENTICATED":
        case "NOT_A_DRIVER":
          void signOut();
          break;
        case "INTERNAL":
        case "CAMPAIGN_NOT_ACTIVE": // BLK-1: chưa có hàng AD-17, dùng chung xử lý INTERNAL
        default:
          setNotice({
            message: "Không kết nối được máy chủ. Thử lại?",
            retryLabel: "Thử lại",
          });
          break;
      }
    },
    [closeBanner, signOut],
  );

  useEffect(() => {
    if (accept.error) handleOfferError(accept.error.code);
  }, [accept.error, handleOfferError]);

  useEffect(() => {
    if (decline.error) handleOfferError(decline.error.code);
  }, [decline.error, handleOfferError]);

  // Accept thành công chỉ chuyển notification sang trạng thái đã nhận. Target trong
  // response vẫn được giữ lại để nút "Dẫn đường" dùng sau đó; accept không tự đổi màn.
  useEffect(() => {
    if (!accept.data) return;
    const action = lastActionRef.current;
    if (!action || action.kind !== "accept" || !action.notification) return;
    const navigationTarget = pointToLngLat(accept.data.navigation_target);
    setPhase({
      kind: "accepted",
      offerId: action.offerId,
      notification: {
        ...action.notification,
        latitude: navigationTarget?.[1] ?? action.notification.latitude,
        longitude: navigationTarget?.[0] ?? action.notification.longitude,
        status: "ACCEPTED",
      },
      navigationTarget,
    });
    setNotice(null);
  }, [accept.data]);

  // Decline thành công: đóng hẳn, không NoticeTransient nào xuất hiện. Lấy id offer vừa
  // decline từ `lastActionRef` (không phải `offerId`/`pendingOffer` hiện tại) — tới lúc
  // effect này chạy, invalidate `qk.offers` của `useDeclineOffer` có thể đã khiến
  // `pendingOffer` đổi hoặc thành `null`.
  useEffect(() => {
    if (!decline.data) return;
    closedForOfferIdRef.current = lastActionRef.current?.offerId ?? null;
    closedForOfferSentAtRef.current = lastActionRef.current?.sentAt ?? null;
    setPhase({ kind: "closed" });
    setNotice(null);
    // Lệnh vừa xong đã xử lý xong, không còn gì để "Thử lại" nữa.
    lastActionRef.current = null;
  }, [decline.data]);

  const isPending = accept.isPending || decline.isPending;

  const handleAccept = useCallback(() => {
    if (!pendingOffer || isPending) return;
    lastActionRef.current = {
      kind: "accept",
      offerId: pendingOffer.id,
      sentAt: pendingOffer.sent_at,
      campaignLabel: pendingOffer.campaigns?.display_area_name ?? null,
      notification: pendingOffer.notification,
    };
    setNotice(null);
    if (pendingOffer.isDemo) {
      const navigationTarget =
        pendingOffer.notification.longitude != null && pendingOffer.notification.latitude != null
          ? [pendingOffer.notification.longitude, pendingOffer.notification.latitude] as LngLat
          : null;
      clearDemoOperatorOffer();
      setPhase({
        kind: "accepted",
        offerId: pendingOffer.id,
        notification: { ...pendingOffer.notification, status: "ACCEPTED" },
        navigationTarget,
      });
      return;
    }
    accept.accept(pendingOffer.id);
  }, [pendingOffer, isPending, accept]);

  const handleDecline = useCallback(() => {
    if (!pendingOffer || isPending) return;
    lastActionRef.current = {
      kind: "decline",
      offerId: pendingOffer.id,
      sentAt: pendingOffer.sent_at,
    };
    setNotice(null);
    if (pendingOffer.isDemo) {
      clearDemoOperatorOffer();
      setPhase({ kind: "closed" });
      return;
    }
    decline.decline(pendingOffer.id);
  }, [pendingOffer, isPending, decline]);

  const handleNavigate = useCallback(() => {
    if (phase.kind !== "accepted") return;
    if (!phase.navigationTarget) {
      setNotice({ message: "Offer không có toạ độ dẫn đường hợp lệ." });
      return;
    }
    setDestination(phase.navigationTarget, phase.notification.placeName);
    nav.navigate();
  }, [nav, phase, setDestination]);

  const handleDemoNavigate = useCallback(() => {
    if (!pendingOffer?.isDemo) return;
    const { longitude, latitude } = pendingOffer.notification;
    if (longitude == null || latitude == null) {
      setNotice({ message: "Offer mô phỏng chưa có tọa độ dẫn đường hợp lệ." });
      return;
    }
    clearDemoOperatorOffer();
    setDestination([longitude, latitude], pendingOffer.notification.placeName);
    nav.navigate();
  }, [nav, pendingOffer, setDestination]);

  const retryLastAction = useCallback(() => {
    const last = lastActionRef.current;
    if (!last) return;
    if (last.kind === "accept") handleAccept();
    else handleDecline();
  }, [handleAccept, handleDecline]);

  const showingChoice =
    state.screen === "home" && phase.kind === "idle" && !!pendingOffer;

  // `Esc` tương đương "Bỏ qua" — chỉ khi banner đang ở dạng hai-nút (chưa quyết định), và
  // chỉ khi phím tắt không xuất phát từ một control đang nhập liệu khác (input/textarea/
  // contentEditable) — nếu không, Esc để đóng ô nhập liệu ở bất kỳ đâu trên trang cũng sẽ
  // vô tình huỷ luôn lời mời đang chờ.
  useEffect(() => {
    if (!showingChoice) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      handleDecline();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showingChoice, handleDecline]);

  // Banner accepted được nâng lên khỏi bottom dock; notice nếu có cũng neo theo vị trí mới
  // để không đè lên banner hoặc bị dock che.
  const acceptedBannerBottom = `calc(${bannerBottom} + 80px)`;
  const noticeOffset = phase.kind === "accepted" ? "240px" : "92px";
  const noticeBottom =
    phase.kind === "accepted"
      ? `calc(${acceptedBannerBottom} + ${noticeOffset})`
      : phase.kind !== "closed"
        ? `calc(${bannerBottom} + ${noticeOffset})`
        : bannerBottom;

  const noticeNode = notice && state.screen === "home" && !hasSheet && (
    <NoticeTransient
      message={notice.message}
      onDismiss={() => setNotice(null)}
      bottom={noticeBottom}
      {...(notice.retryLabel ? { retry: { label: notice.retryLabel, onRetry: retryLastAction } } : {})}
    />
  );

  // `hasSheet` (vd sheet "Thông tin ứng dụng"/"Thời gian hoạt động" mở trên `home`) đẩy
  // `Scrim` lên `zIndex: 40` -- cùng lớp với banner/notice ở đây (`zIndex: 30`/`40`). Ẩn
  // hẳn thay vì để chúng render chồng lên scrim, cùng quy ước với `PullAmbientBanner`'s
  // `!hasSheet` ở trên.
  if (hasSheet) return null;

  if (
    state.screen !== "home" ||
    phase.kind === "closed" ||
    (phase.kind === "idle" && !pendingOffer)
  ) {
    return <>{noticeNode}</>;
  }

  if (phase.kind === "accepted") {
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            boxSizing: "border-box",
            bottom: acceptedBannerBottom,
            background: "#FFFFFF",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,.18)",
            zIndex: 30,
            pointerEvents: "auto",
            overflow: "hidden",
            animation: "fadeIn .25s ease-out",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "13px 14px" }}>
            <CoinBadge size={22} />
            <div style={{ flex: 1, font: "500 13px/1.45 'Be Vietnam Pro',sans-serif", color: "#1A1A1A" }}>
              <div>Để tăng cơ hội nhận đơn Bác tài hãy tới: {phase.notification.placeName ?? "điểm gợi ý"}.</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #E5E7EB", padding: "10px 14px" }}>
            <button
              onClick={handleNavigate}
              disabled={!phase.navigationTarget}
              aria-label={phase.navigationTarget ? "Dẫn đường tới địa điểm được gợi ý" : "Offer chưa có toạ độ dẫn đường hợp lệ"}
              style={{
                width: "100%",
                minHeight: 44,
                border: 0,
                borderRadius: 22,
                background: phase.navigationTarget ? "#12B8C6" : "#CFD4D5",
                font: "600 13.5px/1 'Be Vietnam Pro',sans-serif",
                color: "#FFFFFF",
                cursor: phase.navigationTarget ? "pointer" : "default",
              }}
            >
              {phase.navigationTarget ? "Dẫn đường" : "Thiếu toạ độ dẫn đường"}
            </button>
          </div>
        </div>
        {noticeNode}
      </>
    );
  }

  // phase.kind === 'idle' && pendingOffer -- hai nút nhận hoặc từ chối đề xuất.
  const notification = pendingOffer!.notification;
  if (pendingOffer!.isDemo) {
    return (
      <DemoHotProgramBanner
        notification={notification}
        distanceMeters={pendingOffer!.distance_m}
        etaSeconds={pendingOffer!.eta_seconds}
        onDismiss={handleDecline}
        onNavigate={handleDemoNavigate}
      />
    );
  }

  const displayAreaName = notification.placeName ?? "điểm gợi ý";

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          boxSizing: "border-box",
          bottom: bannerBottom,
          background: "#FFFFFF",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,.18)",
          zIndex: 30,
          pointerEvents: "auto",
          overflow: "hidden",
          animation: "fadeIn .25s ease-out",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: "13px 14px",
          }}
        >
          <CoinBadge size={22} />
          <div
            style={{
              flex: 1,
              font: "500 13px/1.45 'Be Vietnam Pro',sans-serif",
              color: "#1A1A1A",
            }}
          >
            <div>
              Để tăng cơ hội nhận đơn Bác tài hãy tới: {displayAreaName}
            </div>
            <div style={{ marginTop: 5, fontWeight: 700 }}>
              Thưởng thêm: {formatVnd(notification.incentive)}.
            </div>
            <NotificationMetadata notification={notification} />
          </div>
        </div>
        <div style={{ display: "flex", borderTop: "1px solid #E5E7EB" }}>
            <button
              onClick={handleDecline}
              disabled={isPending}
              aria-label={
                decline.isPending ? "Đang từ chối đề xuất" : "Từ chối đề xuất"
              }
              style={{
                flex: 1,
                minHeight: 44,
                border: 0,
                background: "transparent",
                padding: "11px 0",
                font: "600 13.5px/1 'Be Vietnam Pro',sans-serif",
                color: isPending ? "#B0B0B0" : "#1A1A1A", // ink-disabled khi disabled (button-outline foreground khi bật)
                cursor: isPending ? "default" : "pointer",
              }}
            >
              {decline.isPending ? "Đang từ chối…" : "Từ chối"}
            </button>
            <div style={{ width: 1, background: "#E5E7EB" }} />
            <button
              onClick={handleAccept}
              disabled={isPending}
              aria-label={
                accept.isPending
                  ? "Đang nhận đề xuất"
                  : "Nhận đề xuất"
              }
              style={{
                flex: 1,
                minHeight: 44,
                border: 0,
                background: "transparent",
                padding: "11px 0",
                font: "600 13.5px/1 'Be Vietnam Pro',sans-serif",
                color: isPending ? "#B0B0B0" : "#00A99D", // ink-disabled khi disabled, brand-teal (link-action) khi bật
                cursor: isPending ? "default" : "pointer",
              }}
            >
              {accept.isPending ? "Đang nhận đề xuất…" : "Nhận đề xuất"}
            </button>
        </div>
      </div>
      {noticeNode}
    </>
  );
}
