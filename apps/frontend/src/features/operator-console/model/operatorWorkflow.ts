export type OperatorWorkflowStage =
  | "observe"
  | "forecast"
  | "plan"
  | "no_solution"
  | "approved"
  | "executing"
  | "executed"
  | "activation_draft"
  | "campaign";

const stageOrder: Record<OperatorWorkflowStage, number> = {
  observe: 0,
  forecast: 1,
  plan: 2,
  no_solution: 2,
  approved: 3,
  executing: 4,
  executed: 5,
  activation_draft: 6,
  campaign: 7,
};

export const stageAtLeast = (stage: OperatorWorkflowStage, expected: OperatorWorkflowStage) =>
  stageOrder[stage] >= stageOrder[expected];

export const stageHasPlan = (stage: OperatorWorkflowStage) =>
  !["observe", "forecast"].includes(stage);

/**
 * Replay advances in real five-minute buckets, while the operational model is
 * reviewed at the explicitly selected 15/30-minute horizon. Keeping those two
 * clocks separate also prevents a five-minute proposal write against databases
 * that have not yet applied the optional horizon-5 persistence migration.
 */
export const planningHorizonFor = (
  displayedHorizon: 5 | 15 | 30,
  selectedHorizon: 15 | 30,
): 15 | 30 => displayedHorizon === 5 ? selectedHorizon : displayedHorizon;

export const resolveWorkflowStage = (
  localStage: OperatorWorkflowStage,
  hasOperationalCampaign: boolean,
  planStatus?: string,
): OperatorWorkflowStage => {
  if (hasOperationalCampaign) return "campaign";
  if (localStage === "campaign") return "observe";
  if (stageHasPlan(localStage) && planStatus === undefined) return "observe";
  if (
    stageHasPlan(localStage) &&
    planStatus !== undefined &&
    ["Rejected", "Stale", "FailedGeneration"].includes(planStatus)
  ) return "observe";
  return localStage;
};
