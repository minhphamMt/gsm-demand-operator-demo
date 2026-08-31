import { Bot, Check, ChevronRight, Moon, RefreshCw, ShieldCheck, Sun, Zap } from "lucide-react";

import type { OperatorWorkflowStage } from "../model/operatorWorkflow";

// Đầu trang kiểu bảng điều hành: nhận diện + chặng đang ở + lối vào luồng agent.
//
// Thanh chặng đọc `OperatorWorkflowStage` thật của console, không giữ tiến trình riêng — một
// nguồn sự thật duy nhất cho "đang ở bước nào", nếu không hai chỗ sẽ lệch nhau khi phương án
// bị từ chối hoặc hết hạn.

const ribbonStages: readonly { id: OperatorWorkflowStage; label: string }[] = [
  { id: "observe", label: "Ghi nhận" },
  { id: "forecast", label: "Dự báo" },
  { id: "plan", label: "Phương án" },
  { id: "approved", label: "Phê duyệt" },
  { id: "executing", label: "Thực thi" },
];

// Các chặng không nằm trên thanh vẫn phải chỉ đúng một ô: `campaign` và `executed` là phần
// đuôi của Thực thi, `not_required`/`no_solution` dừng ngay sau Dự báo.
const ribbonIndexByStage: Record<OperatorWorkflowStage, number> = {
  observe: 0,
  forecast: 1,
  not_required: 1,
  no_solution: 1,
  plan: 2,
  approved: 3,
  activation_draft: 3,
  executing: 4,
  executed: 4,
  campaign: 4,
};

export type AgentRunSummary = {
  done: number;
  running: number;
  total: number;
  warning: number;
};

export function OpsHeader({
  agentSummary,
  isRefreshing,
  onOpenAgentFlow,
  onToggleTheme,
  regimeLabel,
  serverTimeLabel,
  stage,
  theme,
  zoneCount,
}: {
  agentSummary?: AgentRunSummary | undefined;
  isRefreshing: boolean;
  onOpenAgentFlow: () => void;
  onToggleTheme: () => void;
  regimeLabel: string;
  serverTimeLabel?: string | undefined;
  stage: OperatorWorkflowStage;
  theme: "dark" | "light";
  zoneCount: number;
}) {
  const activeIndex = ribbonIndexByStage[stage] ?? 0;

  return (
    <header className="nf-ops-header">
      <div className="nf-ops-brand">
        <span className="nf-ops-brand__mark"><Zap size={16} /></span>
        <div>
          <strong>NOVAFOUR <em>OPS</em></strong>
          <small>TRUNG TÂM ĐIỀU PHỐI · {zoneCount} ZONE · {regimeLabel}</small>
        </div>
      </div>

      <ol className="nf-stage-ribbon" aria-label="Tiến trình vận hành">
        {ribbonStages.map((ribbonStage, index) => (
          <li
            aria-current={index === activeIndex ? "step" : undefined}
            className={`nf-stage-step ${index < activeIndex ? "is-done" : ""} ${index === activeIndex ? "is-current" : ""}`}
            key={ribbonStage.id}
          >
            <span>{index < activeIndex ? <Check size={11} /> : index + 1}</span>
            <small>{ribbonStage.label}</small>
          </li>
        ))}
      </ol>

      <div className="nf-ops-header__tools">
        <span className="nf-human-loop"><ShieldCheck size={13} /> AI ĐỀ XUẤT · NGƯỜI QUYẾT ĐỊNH</span>
        <button className="nf-agent-summary" onClick={onOpenAgentFlow} type="button">
          <span className="nf-agent-summary__icon"><Bot size={13} /></span>
          <span className="nf-agent-summary__copy">
            <strong>Luồng agent</strong>
            <small>
              {agentSummary
                ? agentSummary.running > 0
                  ? `${agentSummary.running} agent đang chạy`
                  : `${agentSummary.done}/${agentSummary.total} đã xong${agentSummary.warning > 0 ? ` · ${agentSummary.warning} cảnh báo` : ""}`
                : "Chưa chạy lượt nào"}
            </small>
          </span>
          <ChevronRight size={13} />
        </button>
        {serverTimeLabel && <time className="nf-ops-clock">{serverTimeLabel}</time>}
        {isRefreshing && <RefreshCw aria-label="Đang làm mới dữ liệu" className="nf-ops-refreshing" size={13} />}
        <button
          aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
          aria-pressed={theme === "light"}
          className="nf-ops-refresh"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}
          type="button"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  );
}
