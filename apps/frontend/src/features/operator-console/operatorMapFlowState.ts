import type { OperatorWorkflowStage } from '@/features/operator-console/model/operatorWorkflow'

export type OperatorMapFlowState = 'proposal' | 'executing' | 'completed'

/**
 * Keep the map presentation bound to the persisted dispatch state. An approved
 * proposal remains "Approved" while its dispatch is running, so the proposal
 * status must not hide live relocation vehicles.
 */
export const operatorMapFlowState = (
  dispatchStage: OperatorWorkflowStage,
  activeStage: OperatorWorkflowStage,
): OperatorMapFlowState => {
  if (dispatchStage === 'executing') return 'executing'
  if (dispatchStage === 'executed' || activeStage === 'campaign') return 'completed'
  return 'proposal'
}
