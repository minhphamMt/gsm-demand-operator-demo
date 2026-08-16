import { ConflictException } from '@nestjs/common';

import { SupabaseService } from '../supabase/supabase.service';

export const blockingCampaignStatuses = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'RUNNING', 'SETTLING'];
export const blockingDispatchStatuses = ['QUEUED', 'DISPATCHING', 'PARTIALLY_ACKED', 'IN_PROGRESS'];

export async function assertNoActiveExecution(db: SupabaseService, excludedProposalId?: string) {
  let campaignQuery = db.client
    .from('campaigns')
    .select('id,proposal_id,status')
    .in('status', blockingCampaignStatuses);
  let dispatchQuery = db.client
    .from('dispatch_batches')
    .select('id,proposal_id,status')
    .in('status', blockingDispatchStatuses);
  if (excludedProposalId) {
    campaignQuery = campaignQuery.neq('proposal_id', excludedProposalId);
    dispatchQuery = dispatchQuery.neq('proposal_id', excludedProposalId);
  }
  const [campaignResult, dispatchResult] = await Promise.all([
    campaignQuery.limit(1),
    dispatchQuery.limit(1),
  ]);
  const campaigns = db.unwrap(campaignResult.data, campaignResult.error);
  const dispatches = db.unwrap(dispatchResult.data, dispatchResult.error);
  const active = dispatches[0] ?? campaigns[0];
  if (!active) return;
  throw new ConflictException({
    code: 'ACTIVE_EXECUTION_EXISTS',
    message: 'An applied dispatch or campaign is still active. Complete or cancel it before creating or applying another plan.',
    details: {
      executionId: active.id,
      proposalId: active.proposal_id,
      status: active.status,
    },
  });
}
