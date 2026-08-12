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
