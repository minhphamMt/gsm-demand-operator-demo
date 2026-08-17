export const routes = {
  root: '/',
  login: '/login',
  operator: {
    root: '/operator',
    plans: '/operator/plans',
    planDetail: (planId: string) => `/operator/plans/${planId}`,
    campaigns: '/operator/campaigns',
    execution: '/operator/execution',
    reports: '/operator/reports',
    history: '/operator/history',
    executionOffers: (campaignId: string) => `/operator/execution/offers/${campaignId}`,
    segments: { plans: 'plans', planDetail: 'plans/:planId', campaigns: 'campaigns', execution: 'execution', executionOffers: 'execution/offers/:campaignId', reports: 'reports', history: 'history' },
  },
  driver: { root: '/driver' },
} as const
