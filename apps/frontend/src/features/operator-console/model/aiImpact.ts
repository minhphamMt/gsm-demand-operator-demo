import type { Proposal, SimulationMetrics } from "@/features/operator-data";

// Ba kịch bản của §5.5 / FR-13, đưa ra dạng so sánh được: không làm gì → chỉ điều chuyển →
// điều chuyển + kích hoạt. Đây là chỗ duy nhất trên bảng vận hành trả lời "AI giúp được gì".
//
// Không tự tính lại metric nào: mọi số lấy nguyên từ `Proposal`, do Simulator sinh ra.
// `metricsAfterActivation` là optional trong contract nên kịch bản thứ ba có thể vắng — khi
// đó chỉ hiện hai cột, không nội suy ra cột thứ ba.

export type AiImpactScenario = {
  fulfillmentRate: number
  id: "no_action" | "plan_only" | "plan_activation"
  isProjected: boolean
  label: string
  residualGap: number
}

export type AiImpact = {
  gapClosed: number
  gapClosedPct: number
  scenarios: readonly AiImpactScenario[]
}

const scenarioOf = (
  id: AiImpactScenario["id"],
  label: string,
  metrics: SimulationMetrics,
  isProjected: boolean,
): AiImpactScenario => ({
  fulfillmentRate: round1(metrics.fulfillmentRate),
  id,
  isProjected,
  label,
  residualGap: Math.round(metrics.residualGap),
});

export function aiImpactOf(plan: Proposal | undefined): AiImpact | undefined {
  if (!plan) return undefined;

  const relocation = plan.metricsAfterRelocation ?? plan.metrics;
  const scenarios: AiImpactScenario[] = [
    scenarioOf("no_action", "Không điều phối", plan.metricsBefore, false),
    scenarioOf("plan_only", "Điều chuyển", relocation, false),
  ];
  if (plan.metricsAfterActivation) {
    // Kịch bản này là **kỳ vọng** dựa trên giả định tỷ lệ nhận (C-07), không phải kết quả đo.
    scenarios.push(scenarioOf("plan_activation", "+ Kích hoạt", plan.metricsAfterActivation, true));
  }

  const before = plan.metricsBefore.residualGap;
  const after = scenarios[scenarios.length - 1]!.residualGap;
  const gapClosed = Math.max(0, Math.round(before - after));

  return {
    gapClosed,
    gapClosedPct: before > 0 ? Math.round((gapClosed / before) * 100) : 0,
    scenarios,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
