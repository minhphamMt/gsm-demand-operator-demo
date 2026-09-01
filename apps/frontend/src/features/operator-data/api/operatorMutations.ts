import { useMutation, useQueryClient } from '@tanstack/react-query'

import { operatorAdapter } from '@/features/operator-data/api/operatorAdapter'
import { operatorQueryKeys } from '@/features/operator-data/api/operatorQueries'
import type { AskAgentInput, Campaign, ForecastHorizon, PersistentNotification, PolicyOverrides, Proposal, RejectPlanRequest, ResponseMode, RevisePlanRequest } from '@/features/operator-data/model/types'
import { AppError } from '@/shared/api/client'

export function useOperatorActions() {
  const queryClient = useQueryClient()
  const refreshPlans = () => queryClient.invalidateQueries({ queryKey: operatorQueryKeys.plans })
  const cacheProposal = (proposal: Proposal) => {
    queryClient.setQueryData(operatorQueryKeys.plans, (current: readonly Proposal[] | undefined) => [
      proposal,
      ...(current ?? []).filter((candidate) => candidate.id !== proposal.id),
    ])
    queryClient.setQueryData(operatorQueryKeys.plan(proposal.id), proposal)
  }
  const cacheCampaign = (campaign: Campaign) => {
    queryClient.setQueryData(operatorQueryKeys.campaigns, (current: readonly Campaign[] | undefined) => [
      campaign,
      ...(current ?? []).filter((candidate) => candidate.id !== campaign.id),
    ])
  }
  const refreshProposalAfterUncertainMutation = async (error: Error) => {
    // A revision can complete in the database while a gateway times out before
    // the response reaches the browser. Refresh the authoritative history;
    // do not retry a mutation with an unknown outcome automatically.
    if (error instanceof AppError && (error.status === 409 || error.status === 503)) {
      await Promise.all([
        refreshPlans(),
        queryClient.invalidateQueries({ queryKey: operatorQueryKeys.audit }),
      ])
    }
  }
  const refreshCampaignFlow = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.campaigns }),
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.offerRoot }),
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.audit }),
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.driverRoot }),
    ])
  }
  const refreshStoppedExecutionFlow = async () => {
    await Promise.all([
      refreshPlans(),
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.campaigns }),
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.dispatch }),
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.offerRoot }),
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.audit }),
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.driverRoot }),
      queryClient.invalidateQueries({ queryKey: ['operator', 'snapshot'] }),
    ])
  }
  const refreshCampaignConflict = async (error: Error) => {
    if (error instanceof AppError && (error.status === 409 || error.status === 422)) await refreshCampaignFlow()
  }

  return {
    runReplayStep: useMutation({
      mutationFn: (sourceAt: string) => operatorAdapter.runReplayStep(sourceAt),
      onSuccess: (replaySnapshot, sourceAt) => {
        const normalizedSnapshot = replaySnapshot.sourceAt === sourceAt
          ? replaySnapshot
          : { ...replaySnapshot, sourceAt }
        queryClient.setQueryData(operatorQueryKeys.replaySnapshot(sourceAt), normalizedSnapshot)
        queryClient.setQueryData(operatorQueryKeys.snapshot('baseline', 'rain-peak', 0), normalizedSnapshot)
      },
    }),
    generateAiDecision: useMutation({
      mutationFn: ({ snapshotId, horizonMinutes }: { snapshotId: number; horizonMinutes: ForecastHorizon }) => operatorAdapter.generateAiDecision(snapshotId, horizonMinutes),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: operatorQueryKeys.snapshot('baseline', 'rain-peak', 0) })
      },
    }),
    optimizeAiDecision: useMutation({
      mutationFn: ({ snapshotId, horizonMinutes, policyOverrides }: { snapshotId: number; horizonMinutes: ForecastHorizon; policyOverrides?: PolicyOverrides }) => operatorAdapter.optimizeAiDecision(snapshotId, horizonMinutes, policyOverrides),
      onSuccess: async (result) => {
        if (result.planningStatus === 'proposal_created') {
          cacheProposal(result.proposal)
          await refreshPlans()
        }
      },
    }),
    revise: useMutation({
      mutationFn: ({ planId, request }: { planId: string; request: RevisePlanRequest }) => operatorAdapter.revisePlan(planId, request),
      onError: refreshProposalAfterUncertainMutation,
      onSuccess: async (revised) => {
        queryClient.setQueryData(operatorQueryKeys.plans, (current: readonly Proposal[] | undefined) => [
          revised,
          ...(current ?? [])
            .filter((plan) => plan.id !== revised.id)
            .map((plan) => plan.id === revised.parentProposalId ? { ...plan, status: 'Stale' as const } : plan),
        ])
        queryClient.setQueryData(operatorQueryKeys.plan(revised.id), revised)
        if (revised.parentProposalId) {
          queryClient.setQueryData(operatorQueryKeys.plan(revised.parentProposalId), (current: Proposal | undefined) => current ? { ...current, status: 'Stale' } : current)
        }
        await refreshPlans()
      },
    }),
    approve: useMutation({
      mutationFn: ({ planId, expectedVersion, note }: { planId: string; expectedVersion: number; note?: string }) => operatorAdapter.approvePlan(planId, expectedVersion, note),
      onError: refreshProposalAfterUncertainMutation,
      onSuccess: async (proposal) => { cacheProposal(proposal); await refreshPlans() },
    }),
    reject: useMutation({
      mutationFn: ({ planId, request }: { planId: string; request: RejectPlanRequest }) => operatorAdapter.rejectPlan(planId, request),
      onError: refreshProposalAfterUncertainMutation,
      onSuccess: async (proposal) => { cacheProposal(proposal); await refreshPlans() },
    }),
    cancelApprovedPlan: useMutation({
      mutationFn: ({ planId, reason }: { planId: string; reason: string }) => operatorAdapter.cancelApprovedPlan(planId, reason),
      onError: refreshProposalAfterUncertainMutation,
      onSuccess: async (proposal) => {
        cacheProposal(proposal)
        await Promise.all([
          refreshPlans(),
          queryClient.invalidateQueries({ queryKey: operatorQueryKeys.audit }),
        ])
      },
    }),
    activate: useMutation({
      mutationFn: (input: string | { planId: string; mode: ResponseMode }) => operatorAdapter.startCampaign(typeof input === 'string' ? input : input.planId, typeof input === 'string' ? 'human' : input.mode),
      onError: refreshProposalAfterUncertainMutation,
      onSuccess: async (campaign) => { cacheCampaign(campaign); await refreshPlans(); await refreshCampaignFlow() },
    }),
    cancelCampaign: useMutation({ mutationFn: operatorAdapter.cancelCampaign, onError: refreshCampaignConflict, onSuccess: async (campaign) => { cacheCampaign(campaign); await refreshStoppedExecutionFlow() } }),
    releaseDispatch: useMutation({
      mutationFn: operatorAdapter.releaseDispatch,
      onError: refreshProposalAfterUncertainMutation,
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: operatorQueryKeys.dispatch }),
          queryClient.invalidateQueries({ queryKey: operatorQueryKeys.audit }),
        ])
      },
    }),
    cancelDispatch: useMutation({
      mutationFn: ({ batchId, reason }: { batchId: string; reason: string }) => operatorAdapter.cancelDispatch(batchId, reason),
      onSuccess: refreshStoppedExecutionFlow,
    }),
    retryDispatch: useMutation({
      mutationFn: ({ batchId, moveId, reason }: { batchId: string; moveId: string; reason: string }) => operatorAdapter.retryDispatchMove(batchId, moveId, reason),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: operatorQueryKeys.dispatch }),
          queryClient.invalidateQueries({ queryKey: operatorQueryKeys.audit }),
        ])
      },
    }),
    compareScenarios: useMutation({ mutationFn: operatorAdapter.compareScenarios }),
    acknowledgeNotification: useMutation({
      mutationFn: operatorAdapter.acknowledgeNotification,
      onMutate: async (notificationId) => {
        await queryClient.cancelQueries({ queryKey: operatorQueryKeys.notifications })
        const previous = queryClient.getQueryData<readonly PersistentNotification[]>(operatorQueryKeys.notifications)
        queryClient.setQueryData(operatorQueryKeys.notifications, (current: readonly PersistentNotification[] | undefined) =>
          current?.map((notification) => notification.id === notificationId
            ? { ...notification, status: 'ACKNOWLEDGED' as const }
            : notification),
        )
        return { previous }
      },
      onError: (_error, _notificationId, context) => {
        if (context?.previous) queryClient.setQueryData(operatorQueryKeys.notifications, context.previous)
      },
      onSettled: async () => queryClient.invalidateQueries({ queryKey: operatorQueryKeys.notifications }),
    }),
    acknowledgeAllNotifications: useMutation({
      mutationFn: operatorAdapter.acknowledgeAllNotifications,
      onMutate: async () => {
        await queryClient.cancelQueries({ queryKey: operatorQueryKeys.notifications })
        const previous = queryClient.getQueryData<readonly PersistentNotification[]>(operatorQueryKeys.notifications)
        queryClient.setQueryData(operatorQueryKeys.notifications, (current: readonly PersistentNotification[] | undefined) =>
          current?.map((notification) => notification.status === 'UNREAD'
            ? { ...notification, status: 'ACKNOWLEDGED' as const }
            : notification),
        )
        return { previous }
      },
      onError: (_error, _variables, context) => {
        if (context?.previous) queryClient.setQueryData(operatorQueryKeys.notifications, context.previous)
      },
      onSettled: async () => queryClient.invalidateQueries({ queryKey: operatorQueryKeys.notifications }),
    }),
    expireOffer: useMutation({ mutationFn: operatorAdapter.expireOffer, onError: refreshCampaignConflict, onSuccess: refreshCampaignFlow }),
    startPipelineRun: useMutation({ mutationFn: ({ horizonMinutes, snapshotId }: { horizonMinutes: ForecastHorizon; snapshotId?: number }) => operatorAdapter.startPipelineRun(horizonMinutes, snapshotId) }),
    getPipelineRun: useMutation({ mutationFn: ({ runId }: { runId: string }) => operatorAdapter.getPipelineRun(runId) }),
    askAgent: useMutation({ mutationFn: (input: AskAgentInput) => operatorAdapter.askAgent(input) }),
    getAgentSession: useMutation({ mutationFn: ({ sessionId }: { sessionId: string }) => operatorAdapter.getAgentSession(sessionId) }),
  }
}

export function useDriverActions() {
  const queryClient = useQueryClient()
  const refreshDriverFlow = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.driverRoot }),
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.campaigns }),
      queryClient.invalidateQueries({ queryKey: operatorQueryKeys.offerRoot }),
    ])
  }

  return {
    respond: useMutation({ mutationFn: ({ offerId, response }: { offerId: string; response: 'Accepted' | 'Declined' }) => operatorAdapter.respondToOffer(offerId, response), onSuccess: refreshDriverFlow }),
    status: useMutation({ mutationFn: ({ driverId, status }: { driverId: string; status: 'offline' | 'online_idle' }) => operatorAdapter.setDriverStatus(driverId, status), onSuccess: refreshDriverFlow }),
  }
}
