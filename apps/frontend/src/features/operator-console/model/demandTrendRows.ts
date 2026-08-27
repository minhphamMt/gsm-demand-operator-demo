import type { ReplayTimelineStep } from "@/features/operator-data";

export type DemandTrendRow = { demand: number; label: string; supply: number }

/**
 * Chuỗi cầu–cung để vẽ, lấy từ cửa sổ replay.
 *
 * Mốc thiếu tổng bị loại chứ không vẽ 0: `totalDemand`/`totalSupply` là field optional thêm
 * sau W2, nên mốc cũ hoàn toàn có thể vắng chúng — một điểm 0 giả giữa đường cong đọc thành
 * "mạng lưới sập" chứ không thành "mốc này chưa có số".
 */
export function demandTrendRows(steps: readonly ReplayTimelineStep[]): readonly DemandTrendRow[] {
  return steps
    .filter((step) => typeof step.totalDemand === "number" && typeof step.totalSupply === "number")
    .map((step) => ({
      demand: Math.round(step.totalDemand!),
      label: hourLabel(step.sourceAt),
      supply: Math.round(step.totalSupply!),
    }));
}

function hourLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}
