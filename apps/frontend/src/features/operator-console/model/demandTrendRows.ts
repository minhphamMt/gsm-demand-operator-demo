import type { ReplayTimelineStep } from "@/features/operator-data";
import { observedAtForReplaySource } from "@/features/operator-console/model/replayClock";
import { formatTimeLabel } from "@/features/operator-pipeline/model/timeLabel";

export type DemandTrendRow = { demand: number; label: string; supply: number }

/** Mốc replay đang được coi là "bây giờ", để quy giờ dataset về giờ vận hành. */
export type ReplayClock = { anchorSourceAt: string; serverNow: string }

/**
 * Chuỗi cầu–cung để vẽ, lấy từ cửa sổ replay.
 *
 * Nhãn giờ đi qua **đúng phép quy đổi mà cả bảng điều hành đang dùng**
 * (`observedAtForReplaySource`). Trước đây nó dán thẳng giờ thô của dataset, nên trục hoành
 * chạy theo lịch tháng 9/2026 của tập dữ liệu trong khi đồng hồ ở header chạy theo giờ vận
 * hành — hai con số lệch nhau cả tháng trên cùng một màn hình, và biểu đồ trông như số bịa.
 *
 * Và dán bằng `formatTimeLabel` chứ không phải `Date.getHours()`: hàm kia đọc theo múi giờ
 * **của trình duyệt**, nên cùng một mốc sẽ hiện giờ khác nhau tuỳ máy ai mở.
 *
 * Thiếu `clock` thì vẫn vẽ, chỉ là giữ nguyên giờ dataset — đó là trạng thái lúc mốc neo hoặc
 * giờ máy chủ chưa tải xong, không phải một chế độ khác.
 *
 * Mốc thiếu tổng bị loại chứ không vẽ 0: `totalDemand`/`totalSupply` là field optional thêm
 * sau W2, nên mốc cũ hoàn toàn có thể vắng chúng — một điểm 0 giả giữa đường cong đọc thành
 * "mạng lưới sập" chứ không thành "mốc này chưa có số".
 */
export function demandTrendRows(
  steps: readonly ReplayTimelineStep[],
  clock?: ReplayClock,
): readonly DemandTrendRow[] {
  return steps
    .filter((step) => typeof step.totalDemand === "number" && typeof step.totalSupply === "number")
    .map((step) => ({
      demand: Math.round(step.totalDemand!),
      label: formatTimeLabel(
        clock
          ? observedAtForReplaySource(step.sourceAt, clock.anchorSourceAt, clock.serverNow)
          : step.sourceAt,
      ),
      supply: Math.round(step.totalSupply!),
    }));
}
