import type { ReactNode } from "react";
import { House } from "lucide-react";
import { HomeIndicator } from "../../components/HomeIndicator";
import { LightningIcon } from "../../components/icons";
import { useDriverApp } from "../../state/DriverAppContext";
import { useDriverState } from "../../data/useDriverState";

function DockButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 0,
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        width: 66,
        cursor: "pointer",
        padding: "8px 0",
      }}
    >
      {icon}
      <span
        style={{
          font: "500 10.5px/1.25 'Be Vietnam Pro',sans-serif",
          color: "#3f484c",
          textAlign: "center",
        }}
      >
        {label}
      </span>
    </button>
  );
}

export function BottomDock() {
  const { isMapScreen, isDemand, nav, togglePins } = useDriverApp();
  const { isOnline, isToggling } = useDriverState();
  // Bấm lần 1 (chưa ở màn "demand") -> vào màn demand, coin hiện sẵn. Bấm lần 2 (đã ở
  // demand) -> CHỈ ẩn coin (`togglePins`), không điều hướng rời màn hình.
  const toggleDemand = isDemand ? togglePins : nav.demand;

  // Trong lúc mutation đang bay, hiện màu trung tính thay vì đỏ/xanh: optimistic
  // update có thể bị rollback, và nhấp nháy đỏ rồi xanh lại trông như lỗi.
  const statusDot = isToggling ? "#c9cfd1" : isOnline ? "#2f9e5c" : "#e2483c";
  const statusLabel = isToggling
    ? "Đang cập nhật trạng thái…"
    : isOnline
      ? "Đang trực tuyến"
      : "Bạn đang ngoại tuyến";

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#fff",
        borderRadius: "20px 20px 0 0",
        boxShadow: "0 -3px 20px rgba(0,0,0,.1)",
        zIndex: 28,
        pointerEvents: "auto",
      }}
    >
      {isMapScreen && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "14px 18px 12px",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: statusDot,
              }}
            />
            <div
              style={{
                font: "600 16px/1 'Be Vietnam Pro',sans-serif",
                color: "#1b2225",
              }}
            >
              {statusLabel}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              padding: "6px 6px 4px",
              borderTop: "1px solid #f1f3f3",
            }}
          >
            {isDemand && (
              <DockButton
                icon={<House aria-hidden="true" size={24} strokeWidth={1.8} />}
                label="Màn hình chính"
                onClick={nav.home}
              />
            )}
            <DockButton
              icon={<LightningIcon />}
              label="Khu vực thưởng"
              onClick={toggleDemand}
            />
          </div>
        </div>
      )}
      <HomeIndicator />
    </div>
  );
}
