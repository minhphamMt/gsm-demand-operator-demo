import { createAgentPlans } from '@/features/operator-data/model/mockProposalEngine'
import type { AuditEntry, Campaign, DemoDriver, Offer, Proposal } from '@/features/operator-data/model/types'

export type MockOperatorState = { scenarioId: 'rain-peak'; nextProposalNumber: number; plans: Proposal[]; campaigns: Campaign[]; offers: Offer[]; drivers: DemoDriver[]; audit: AuditEntry[] }

const atMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

const drivers: readonly DemoDriver[] = [
  { id: 'DRV-001', name: 'Minh Anh', status: 'online_idle', homeZoneId: 'AI-Z01', distanceKm: 3.2, shiftEndsInMinutes: 90, acceptedOfferIds: ['OFF-091'], rewardTotal: 45_000 },
  { id: 'DRV-002', name: 'Quang Huy', status: 'en_route', homeZoneId: 'AI-Z03', distanceKm: 2.1, shiftEndsInMinutes: 120, acceptedOfferIds: ['OFF-102'], rewardTotal: 55_000 },
  { id: 'DRV-003', name: 'Thu HÃ ', status: 'online_idle', homeZoneId: 'AI-Z05', distanceKm: 4.6, shiftEndsInMinutes: 65, acceptedOfferIds: [], rewardTotal: 45_000 },
  { id: 'DRV-004', name: 'Äá»©c Long', status: 'offline', homeZoneId: 'AI-Z09', distanceKm: 5.2, shiftEndsInMinutes: 180, acceptedOfferIds: ['OFF-104'], rewardTotal: 100_000 },
  { id: 'DRV-005', name: 'Ngá»c Mai', status: 'online_busy', homeZoneId: 'AI-Z11', distanceKm: 1.4, shiftEndsInMinutes: 40, acceptedOfferIds: [], rewardTotal: 45_000 },
  { id: 'DRV-006', name: 'Háº£i Nam', status: 'en_route', homeZoneId: 'AI-Z13', distanceKm: 2.8, shiftEndsInMinutes: 150, acceptedOfferIds: ['OFF-106'], rewardTotal: 55_000 },
  { id: 'DRV-007', name: 'Lan Chi', status: 'offline', homeZoneId: 'AI-Z15', distanceKm: 6.1, shiftEndsInMinutes: 200, acceptedOfferIds: [], rewardTotal: 0 },
  { id: 'DRV-008', name: 'Tuáº¥n Kiá»‡t', status: 'online_idle', homeZoneId: 'AI-Z18', distanceKm: 3.9, shiftEndsInMinutes: 110, acceptedOfferIds: [], rewardTotal: 45_000 },
]

function historicalPlans(currentPlans: readonly Proposal[]): Proposal[] {
  const balanced = currentPlans[1]!
  const saving = currentPlans[2]!
  const retarget = (plan: Proposal, targetZoneId: string, targetZoneLabel: string) => plan.moves.map((move) => ({ ...move, targetZoneId, targetZoneLabel }))
  return [
    { ...balanced, id: 'PLN-039', rootProposalId: 'PLN-039', parentProposalId: null, title: 'CÃ¢n báº±ng khu vá»±c trung tÃ¢m', status: 'Approved', rank: 1, version: 2, createdAt: atMinutes(-55), inputSnapshotId: 'SNP-HN-1610', hotspotId: 'HOT-03-1610' },
    { ...saving, id: 'PLN-038', rootProposalId: 'PLN-038', parentProposalId: null, title: 'Bá»• sung cung TÃ¢y Há»“', status: 'Approved', rank: 1, createdAt: atMinutes(-190), inputSnapshotId: 'SNP-HN-1345', hotspotId: 'HOT-07-1345', targetZoneId: 'AI-Z05', targetZoneLabel: 'TÃ¢y Há»“ 1', moves: retarget(saving, 'AI-Z05', 'TÃ¢y Há»“ 1') },
    { ...balanced, id: 'PLN-037', rootProposalId: 'PLN-037', parentProposalId: null, title: 'Äiá»u chuyá»ƒn tá»« Cáº§u Giáº¥y', status: 'Rejected', rank: 2, createdAt: atMinutes(-260), inputSnapshotId: 'SNP-HN-1230', hotspotId: 'HOT-04-1230' },
    { ...saving, id: 'PLN-036', rootProposalId: 'PLN-036', parentProposalId: null, title: 'Bá»• sung cung HoÃ ng Mai', status: 'Approved', rank: 1, createdAt: atMinutes(-320), inputSnapshotId: 'SNP-HN-1130', hotspotId: 'HOT-10-1130', targetZoneId: 'AI-Z08', targetZoneLabel: 'HoÃ ng Mai 1', moves: retarget(saving, 'AI-Z08', 'HoÃ ng Mai 1') },
  ]
}

const campaigns: readonly Campaign[] = [
  { id: 'CMP-017', planId: 'PLN-039', status: 'Running', targetZoneId: 'AI-Z02', candidateCount: 8, offersSent: 8, viewed: 7, accepted: 3, declined: 2, expired: 1, cancelled: 0, enRoute: 3, arrivedVerified: 2, unitsGained: 2, qualifiedTrips: 5, incentiveBudget: 165_000, budgetLimit: 650_000, worstCaseCommitment: 440_000, startedAt: atMinutes(-14), expiresAt: atMinutes(12), responseMode: 'human', suggestedActivation: 6 },
  { id: 'CMP-016', planId: 'PLN-038', status: 'Completed', targetZoneId: 'AI-Z05', candidateCount: 6, offersSent: 6, viewed: 6, accepted: 4, declined: 1, expired: 1, cancelled: 0, enRoute: 4, arrivedVerified: 4, unitsGained: 4, qualifiedTrips: 18, incentiveBudget: 180_000, budgetLimit: 350_000, worstCaseCommitment: 270_000, startedAt: atMinutes(-145), expiresAt: atMinutes(-95), responseMode: 'human', suggestedActivation: 4 },
  { id: 'CMP-015', planId: 'PLN-036', status: 'Cancelled', targetZoneId: 'AI-Z08', candidateCount: 5, offersSent: 5, viewed: 4, accepted: 1, declined: 1, expired: 0, cancelled: 3, enRoute: 1, arrivedVerified: 0, unitsGained: 0, qualifiedTrips: 0, incentiveBudget: 45_000, budgetLimit: 350_000, worstCaseCommitment: 225_000, startedAt: atMinutes(-230), expiresAt: atMinutes(-210), responseMode: 'human', suggestedActivation: 4 },
]

function seededOffers(): Offer[] {
  const zoneNames: Record<string, string> = { 'AI-Z02': 'HoÃ n Kiáº¿m', 'AI-Z05': 'TÃ¢y Há»“', 'AI-Z08': 'HoÃ ng Mai' }
  const offer = (id: string, campaignId: string, driverId: string, targetZoneId: string, status: Offer['status'], incentiveAmount: number, distanceKm: number, minutes: number, responseSource?: Offer['responseSource']): Offer => ({ id, campaignId, driverId, targetZoneId, reasonText: `Khu vá»±c ${zoneNames[targetZoneId] ?? targetZoneId} Ä‘ang cáº§n bá»• sung xe. ThÆ°á»Ÿng ${incentiveAmount.toLocaleString('vi-VN')}Ä‘, cÃ¡ch ${distanceKm}km (~${Math.round(distanceKm * 3)} phÃºt). Báº¡n cÃ³ thá»ƒ tá»« chá»‘i.`, incentiveAmount, distanceKm, etaMinutes: Math.round(distanceKm * 3), expiresAt: atMinutes(minutes), status, ...(responseSource ? { responseSource, respondedAt: atMinutes(minutes - 8) } : {}) })
  return [
    offer('OFF-101', 'CMP-017', 'DRV-001', 'AI-Z02', 'Open', 55_000, 3.2, 12), offer('OFF-102', 'CMP-017', 'DRV-002', 'AI-Z02', 'Accepted', 55_000, 2.1, 12, 'human'), offer('OFF-103', 'CMP-017', 'DRV-003', 'AI-Z02', 'Declined', 55_000, 4.6, 12, 'human'), offer('OFF-104', 'CMP-017', 'DRV-004', 'AI-Z02', 'Accepted', 55_000, 5.2, 12, 'human'), offer('OFF-105', 'CMP-017', 'DRV-007', 'AI-Z02', 'Expired', 55_000, 6.1, -2), offer('OFF-106', 'CMP-017', 'DRV-006', 'AI-Z02', 'Accepted', 55_000, 2.8, 12, 'human'), offer('OFF-107', 'CMP-017', 'DRV-008', 'AI-Z02', 'Open', 55_000, 3.9, 12), offer('OFF-108', 'CMP-017', 'DRV-005', 'AI-Z02', 'Declined', 55_000, 1.4, 12, 'human'),
    offer('OFF-091', 'CMP-016', 'DRV-001', 'AI-Z05', 'Accepted', 45_000, 2.4, -95, 'human'), offer('OFF-092', 'CMP-016', 'DRV-003', 'AI-Z05', 'Accepted', 45_000, 1.8, -95, 'human'), offer('OFF-093', 'CMP-016', 'DRV-005', 'AI-Z05', 'Accepted', 45_000, 3.1, -95, 'human'), offer('OFF-094', 'CMP-016', 'DRV-008', 'AI-Z05', 'Accepted', 45_000, 2.9, -95, 'human'), offer('OFF-095', 'CMP-016', 'DRV-006', 'AI-Z05', 'Declined', 45_000, 5.4, -95, 'human'), offer('OFF-096', 'CMP-016', 'DRV-007', 'AI-Z05', 'Expired', 45_000, 6.3, -95),
    offer('OFF-081', 'CMP-015', 'DRV-004', 'AI-Z08', 'Accepted', 45_000, 4.1, -210, 'human'), offer('OFF-082', 'CMP-015', 'DRV-007', 'AI-Z08', 'Declined', 45_000, 5.8, -210, 'human'), offer('OFF-083', 'CMP-015', 'DRV-003', 'AI-Z08', 'Cancelled', 45_000, 4.7, -210), offer('OFF-084', 'CMP-015', 'DRV-006', 'AI-Z08', 'Cancelled', 45_000, 3.5, -210), offer('OFF-085', 'CMP-015', 'DRV-008', 'AI-Z08', 'Cancelled', 45_000, 4.9, -210),
  ]
}

function seededAudit(): AuditEntry[] {
  return [
    { id: 'AUD-110', planId: 'PLN-039', action: 'OfferAccepted', actor: 'DRV-006', occurredAt: atMinutes(-4), detail: 'TÃ i xáº¿ nháº­n offer OFF-106 vÃ  báº¯t Ä‘áº§u di chuyá»ƒn.' },
    { id: 'AUD-109', planId: 'PLN-039', action: 'OfferDeclined', actor: 'DRV-003', occurredAt: atMinutes(-7), detail: 'TÃ i xáº¿ tá»« chá»‘i offer OFF-103.' },
    { id: 'AUD-108', planId: 'PLN-039', action: 'ActivationStarted', actor: 'Nguyá»…n Minh Â· Äiá»u phá»‘i viÃªn', occurredAt: atMinutes(-14), detail: 'PhÃ¡t hÃ nh 8 offer cho campaign CMP-017.' },
    { id: 'AUD-107', planId: 'PLN-039', action: 'Approved', actor: 'Nguyá»…n Minh Â· Äiá»u phá»‘i viÃªn', occurredAt: atMinutes(-18), detail: 'ÄÃ£ kiá»ƒm tra policy vÃ  ngÃ¢n sÃ¡ch; phÃª duyá»‡t phiÃªn báº£n 2.' },
    { id: 'AUD-106', planId: 'PLN-039', action: 'Revised', actor: 'Nguyá»…n Minh Â· Äiá»u phá»‘i viÃªn', occurredAt: atMinutes(-24), detail: 'Giáº£m má»¥c tiÃªu tá»« 8 xuá»‘ng 6 tÃ i xáº¿ vÃ  cháº¡y láº¡i simulation.' },
    { id: 'AUD-105', planId: 'PLN-038', action: 'Approved', actor: 'Tráº§n HÃ  Â· Äiá»u phá»‘i viÃªn', occurredAt: atMinutes(-185), detail: 'PhÃª duyá»‡t phÆ°Æ¡ng Ã¡n TÃ¢y Há»“.' },
    { id: 'AUD-103', planId: 'PLN-036', action: 'CampaignCancelled', actor: 'Tráº§n HÃ  Â· Äiá»u phá»‘i viÃªn', occurredAt: atMinutes(-215), detail: 'Dá»«ng campaign CMP-015 do tÃ­n hiá»‡u nhu cáº§u Ä‘Ã£ giáº£m.' },
    { id: 'AUD-104', planId: 'PLN-037', action: 'Rejected', actor: 'Tráº§n HÃ  Â· Äiá»u phá»‘i viÃªn', occurredAt: atMinutes(-250), detail: '[source-risk] Nguá»“n Cáº§u Giáº¥y Ä‘ang gáº§n ngÆ°á»¡ng an toÃ n.' },
  ]
}

export function createSeededOperatorState(): MockOperatorState {
  const currentPlans = createAgentPlans('rain-peak')
  const generatedAudit: AuditEntry[] = currentPlans.map((plan, index) => ({ id: `AUD-20${index}`, planId: plan.id, action: 'Created', actor: 'GSM-14 Agent', occurredAt: atMinutes(-2), detail: `Agent sinh phÆ°Æ¡ng Ã¡n ${index + 1}/3 tá»« snapshot ${plan.inputSnapshotId}.` }))
  return { scenarioId: 'rain-peak', nextProposalNumber: 45, plans: [...currentPlans, ...historicalPlans(currentPlans)], campaigns: [...campaigns], offers: seededOffers(), drivers: drivers.map((driver) => structuredClone(driver)), audit: [...generatedAudit, ...seededAudit()] }
}
