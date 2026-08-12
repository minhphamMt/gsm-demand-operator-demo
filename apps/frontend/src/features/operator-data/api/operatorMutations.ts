import { useMutation, useQueryClient } from '@tanstack/react-query'

import { operatorAdapter } from '@/features/operator-data/api/operatorAdapter'
import { operatorQueryKeys } from '@/features/operator-data/api/operatorQueries'
import type { Campaign, Proposal, RejectPlanRequest, ResponseMode, RevisePlanRequest } from '@/features/operator-data/model/types'
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
  const refreshProposalConflict = async (error: Error) => {
    if (error instanceof AppError && error.status === 409) {
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
  const refreshCampaignConflict = async (error: Error) => {
    if (error instanceof AppError && (error.status === 409 || error.status === 422)) await refreshCampaignFlow()
  }

  return {
    runReplayStep: useMutation({
      mutationFn: (sourceAt: string) => operatorAdapter.runReplayStep(sourceAt),
      onSuccess: (replaySnapshot) => queryClient.setQueryData(operatorQueryKeys.snapshot('baseline', 'rain-peak', 0), replaySnapshot),
    }),
    generateAiDecision: useMutation({
      mutationFn: ({ snapshotId, horizonMinutes }: { snapshotId: number; horizonMinutes: 15 | 30 }) => operatorAdapter.generateAiDecision(snapshotId, horizonMinutes),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: operatorQueryKeys.snapshot('baseline', 'rain-peak', 0) })
      },
    }),
    optimizeAiDecision: useMutation({
      mutationFn: ({ snapshotId, horizonMinutes }: { snapshotId: number; horizonMinutes: 5 | 15 | 30 }) => operatorAdapter.optimizeAiDecision(snapshotId, horizonMinutes),
      onSuccess: async (proposal) => {
        cacheProposal(proposal)
        await refreshPlans()
      },
    }),
    revise: useMutation({
      mutationFn: ({ planId, request }: { planId: string; request: RevisePlanRequest }) => operatorAdapter.revisePlan(planId, request),
      onError: refreshProposalConflict,
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
      mutationFn: ({ planId, note }: { planId: string; note?: string }) => operatorAdapter.approvePlan(planId, note),
      onError: refreshProposalConflict,
      onSuccess: async (proposal) => { cacheProposal(proposal); await refreshPlans() },
    }),
    reject: useMutation({
      mutationFn: ({ planId, request }: { planId: string; request: RejectPlanRequest }) => operatorAdapter.rejectPlan(planId, request),
      onError: refreshProposalConflict,
      onSuccess: async (proposal) => { cacheProposal(proposal); await refreshPlans() },
    }),
    activate: useMutation({
      mutationFn: (input: string | { planId: string; mode: ResponseMode }) => operatorAdapter.startCampaign(typeof input === 'string' ? input : input.planId, typeof input === 'string' ? 'human' : input.mode),
      onError: refreshProposalConflict,
      onSuccess: async (campaign) => { cacheCampaign(campaign); await refreshPlans(); await refreshCampaignFlow() },
    }),
    cancelCampaign: useMutation({ mutationFn: operatorAdapter.cancelCampaign, onError: refreshCampaignConflict, onSuccess: async (campaign) => { cacheCampaign(campaign); await refreshCampaignFlow() } }),
    expireOffer: useMutation({ mutationFn: operatorAdapter.expireOffer, onError: refreshCampaignConflict, onSuccess: refreshCampaignFlow }),
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
