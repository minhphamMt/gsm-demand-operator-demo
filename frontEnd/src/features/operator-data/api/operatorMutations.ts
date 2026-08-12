import { useMutation, useQueryClient } from '@tanstack/react-query'

import { operatorAdapter } from '@/features/operator-data/api/operatorAdapter'
import { operatorQueryKeys } from '@/features/operator-data/api/operatorQueries'
import type { RejectPlanRequest, ResponseMode, RevisePlanRequest } from '@/features/operator-data/model/types'
import { AppError } from '@/shared/api/client'

export function useOperatorActions() {
  const queryClient = useQueryClient()
  const refreshPlans = () => queryClient.invalidateQueries({ queryKey: operatorQueryKeys.plans })
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
        queryClient.setQueryData(operatorQueryKeys.plans, [proposal])
        await refreshPlans()
      },
    }),
    revise: useMutation({
      mutationFn: ({ planId, request }: { planId: string; request: RevisePlanRequest }) => operatorAdapter.revisePlan(planId, request),
      onError: refreshProposalConflict,
      onSuccess: refreshPlans,
    }),
    approve: useMutation({
      mutationFn: ({ planId, note }: { planId: string; note?: string }) => operatorAdapter.approvePlan(planId, note),
      onError: refreshProposalConflict,
      onSuccess: refreshPlans,
    }),
    reject: useMutation({
      mutationFn: ({ planId, request }: { planId: string; request: RejectPlanRequest }) => operatorAdapter.rejectPlan(planId, request),
      onError: refreshProposalConflict,
      onSuccess: refreshPlans,
    }),
    activate: useMutation({
      mutationFn: (input: string | { planId: string; mode: ResponseMode }) => operatorAdapter.startCampaign(typeof input === 'string' ? input : input.planId, typeof input === 'string' ? 'mixed' : input.mode),
      onError: refreshProposalConflict,
      onSuccess: async () => { await refreshPlans(); await refreshCampaignFlow() },
    }),
    cancelCampaign: useMutation({ mutationFn: operatorAdapter.cancelCampaign, onError: refreshCampaignConflict, onSuccess: refreshCampaignFlow }),
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
