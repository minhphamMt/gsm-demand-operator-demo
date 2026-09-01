import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class SnapshotKpiDto {
  @ApiProperty({ example: 312 }) fleetAvailable: number;
  @ApiProperty({ example: 428 }) requests: number;
  @ApiProperty({ description: 'Fulfilled demand in percent (0-100).', example: 72.9 }) fulfillmentRate: number;
  @ApiProperty({ example: 116 }) residualGap: number;
  @ApiProperty({ example: 8 }) avgWaitProxy: number;
}

class ZoneDto {
  @ApiProperty({ example: 'AI-Z06' }) id: string;
  @ApiProperty({ example: 6 }) aiZoneId: number;
  @ApiProperty({ example: 'AI-Z06' }) zoneCode: string;
  @ApiProperty({ example: 'core' }) tier: string;
  @ApiProperty({ example: 12.4 }) areaKm2: number;
  @ApiProperty({ example: 'Cầu Giấy' }) label: string;
  @ApiProperty({ enum: ['live', 'missing'], example: 'live' }) dataStatus: string;
  @ApiProperty({ example: [105.79, 21.03], type: [Number] }) center: number[] | null;
  @ApiProperty({ example: [[105.78, 21.02], [105.80, 21.02], [105.79, 21.04]] }) boundary: number[][];
  @ApiProperty({ example: 12, nullable: true, description: 'Null when the zone observation is missing; zero is a real observed value.' }) supply: number | null;
  @ApiProperty({ example: 25, nullable: true, description: 'Null when the zone observation is missing; zero is a real observed value.' }) demand: number | null;
  @ApiProperty({ example: 13, nullable: true, description: 'Null when the zone observation is missing.' }) gap: number | null;
  @ApiProperty({ enum: ['Low', 'Medium', 'High', 'Critical', 'Unknown'], example: 'High' }) severity: string;
  @ApiProperty({ example: null, nullable: true, type: Number }) confidence: number | null;
  @ApiProperty({ example: 25 }) forecast15: number;
  @ApiProperty({ example: 25 }) forecast30: number;
  @ApiProperty({ example: 0.4 }) rainMmH: number;
  @ApiProperty({ example: 0.8 }) rainForecast15: number;
  @ApiProperty({ example: 1.2 }) rainForecast30: number;
}

class HotspotDto {
  @ApiProperty({ example: 'AI-Z06' }) zoneId: string;
  @ApiProperty({ example: 1 }) rank: number;
  @ApiProperty({ example: 'supply_shortage' }) reason: string;
  @ApiProperty({ example: 0 }) etaMinutes: number;
  @ApiProperty({ example: true }) isPersistent: boolean;
  @ApiProperty({ example: 'hotspot-gap-v1' }) policyVersion: string;
  @ApiProperty({ enum: ['Low', 'Medium', 'High', 'Critical'], example: 'High' }) severity: string;
  @ApiProperty({ example: 6, description: 'Gap threshold that qualified this hotspot, including an applicable hysteresis exit threshold.' }) threshold: number;
  @ApiProperty({ example: ['HIGH_DEMAND_GAP', 'SUPPLY_SHORTAGE'], type: [String] }) reasonCodes: string[];
  @ApiProperty({ example: { demand: 13, supply: 2, gap: 11 } }) contributingFeatures: { demand: number; supply: number; gap: number };
  @ApiPropertyOptional({ format: 'uuid' }) forecastRunId?: string;
}

class ForecastRunDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: [15, 30] }) horizonMinutes: number;
  @ApiProperty({ enum: ['COMPLETED', 'FALLBACK'] }) status: string;
  @ApiProperty() modelVersion: string;
  @ApiProperty() featureVersion: string;
  @ApiProperty() policyVersion: string;
  @ApiProperty({ description: 'SHA-256 provenance hash for the inference input.' }) inputHash: string;
  @ApiProperty() forecastMode: string;
  @ApiProperty() dataSource: string;
  @ApiProperty({ format: 'date-time' }) forecastAt: string;
  @ApiProperty({ format: 'date-time' }) completedAt: string;
  @ApiProperty({ example: 30 }) zoneCount: number;
}

class AiSnapshotDto {
  @ApiProperty({ example: 'AI_ZONE_1_30' }) zoneContract: string;
  @ApiProperty({ example: 30 }) registeredZones: number;
  @ApiProperty({ example: 30 }) liveZones: number;
  @ApiProperty({ example: 30 }) forecastedZones: number;
  @ApiProperty({ type: [Number], example: [15, 30] }) horizons: number[];
  @ApiProperty({ type: [ForecastRunDto] }) forecastRuns: ForecastRunDto[];
  @ApiProperty({ nullable: true }) modelVersion: string | null;
  @ApiProperty({ nullable: true }) forecastMode: string | null;
  @ApiProperty({ nullable: true }) dataSource: string | null;
  @ApiProperty({ nullable: true, format: 'date-time' }) forecastAt: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) forecastRunId: string | null;
  @ApiProperty({ nullable: true, enum: ['COMPLETED', 'FALLBACK'] }) forecastStatus: string | null;
}

export class SnapshotResponseDto {
  @ApiProperty({ example: '2026-08-09T08:30:00.000Z', format: 'date-time' }) generatedAt: string;
  @ApiProperty({ example: '2026-09-25T08:15:00+07:00', format: 'date-time' }) sourceAt: string;
  @ApiProperty({ example: '42' }) replayStep: string;
  @ApiProperty({ enum: ['baseline', 'plan', 'activation'], example: 'baseline' }) scenario: string;
  @ApiProperty({ example: 'normal' }) demoScenarioId: string;
  @ApiProperty({ example: 'normal' }) regime: string;
  @ApiProperty({ type: [ZoneDto] }) zones: ZoneDto[];
  @ApiProperty({ type: [HotspotDto] }) hotspots: HotspotDto[];
  @ApiProperty({ type: SnapshotKpiDto }) kpis: SnapshotKpiDto;
  @ApiProperty({ type: AiSnapshotDto }) ai: AiSnapshotDto;
}

export class BaselineResponseDto {
  @ApiProperty({ enum: ['no-action', 'historical-average'], example: 'no-action' }) id: string;
  @ApiProperty({ example: 'Không điều phối' }) label: string;
  @ApiProperty({ description: 'Fulfilled demand in percent (0-100).', example: 72.9 }) fulfillmentRate: number;
  @ApiProperty({ example: 116 }) residualGap: number;
  @ApiProperty({ example: 8 }) avgWaitProxy: number;
  @ApiProperty({ example: '2026-08-09T08:30:00.000Z', format: 'date-time' }) frozenAt: string;
  @ApiProperty({ example: 'snapshot:42' }) source: string;
}

class CandidateSourceZoneDto {
  @ApiProperty({ example: '8841436963fffff' }) zoneId: string;
  @ApiProperty({ example: 'Nam Từ Liêm' }) label: string;
  @ApiProperty({ example: 20 }) availableSupply: number;
  @ApiProperty({ example: 4.2 }) distanceKm: number;
  @ApiProperty({ example: 12 }) etaMinutes: number;
}

class MoveDto {
  @ApiProperty({ example: 'move-1' }) id: string;
  @ApiProperty({ example: '8841436963fffff' }) sourceZoneId: string;
  @ApiProperty({ example: 'Nam Từ Liêm' }) sourceZoneLabel: string;
  @ApiProperty({ example: '8841436961fffff' }) targetZoneId: string;
  @ApiProperty({ example: 'Cầu Giấy' }) targetZoneLabel: string;
  @ApiProperty({ example: 5 }) quantity: number;
  @ApiProperty({ example: 4.2 }) distanceKm: number;
  @ApiProperty({ example: 12 }) etaMinutes: number;
  @ApiProperty({ description: 'Estimated cost in integer VND.', example: 250000 }) estimatedCost: number;
  @ApiProperty({ example: 15 }) sourceSupplyAfter: number;
}

class PolicyCheckDto {
  @ApiProperty({ example: 'proposal-policy' }) id: string;
  @ApiProperty({ example: 'Kiểm tra chính sách' }) label: string;
  @ApiProperty({ example: true }) passed: boolean;
  @ApiProperty({ example: true }) blocking: boolean;
  @ApiProperty({ example: 'PASSED' }) detail: string;
}

class ProposalWarningDto {
  @ApiProperty({ example: 'source-risk' }) id: string;
  @ApiProperty({ enum: ['info', 'warning', 'critical'], example: 'warning' }) severity: string;
  @ApiProperty({ example: 'Nguồn xe thấp' }) title: string;
  @ApiProperty({ example: 'Kiểm tra lại supply của vùng nguồn.' }) detail: string;
}

class SimulationMetricsDto {
  @ApiProperty({ description: 'Fulfilled demand in percent (0-100).', example: 84 }) fulfillmentRate: number;
  @ApiProperty({ example: 68 }) residualGap: number;
  @ApiProperty({ example: 21 }) deadheadKm: number;
  @ApiProperty({ description: 'Budget in integer VND.', example: 450000 }) budget: number;
  @ApiProperty({ example: 360 }) expectedTrips: number;
  @ApiProperty({ example: 6 }) avgWaitProxy: number;
}

export class ProposalResponseDto {
  @ApiProperty({ example: 'f0420000-0000-4000-a000-000000000001', format: 'uuid' }) id: string;
  @ApiProperty({ example: 'f0420000-0000-4000-a000-000000000001', format: 'uuid' }) rootProposalId: string;
  @ApiProperty({ nullable: true, example: null, format: 'uuid' }) parentProposalId: string | null;
  @ApiProperty({ example: 'Điều phối bổ sung Cầu Giấy' }) title: string;
  @ApiProperty({ enum: ['Generated', 'UnderReview', 'Approved', 'Rejected', 'Stale', 'FailedGeneration'], example: 'UnderReview' }) status: string;
  @ApiProperty({ example: '2026-08-09T08:30:00.000Z', format: 'date-time' }) createdAt: string;
  @ApiProperty({ example: 1 }) version: number;
  @ApiProperty({ example: 'sha256' }) contentHash: string;
  @ApiProperty({ nullable: true, example: 'sha256' }) approvedContentHash: string | null;
  @ApiProperty({ nullable: true, example: 1 }) approvedVersion: number | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) optimizerRunId: string | null;
  @ApiProperty({ example: 1 }) rank: number;
  @ApiProperty({ example: 'normal' }) scenarioId: string;
  @ApiProperty({ enum: ['MOCK', 'RULE_BASED', 'AGENT', 'MANUAL'], example: 'RULE_BASED' }) generatorType: string;
  @ApiProperty({ example: '1.0.0' }) generatorVersion: string;
  @ApiProperty({ nullable: true, example: '42' }) inputSnapshotId: string | null;
  @ApiProperty({ example: 'hotspot-1' }) hotspotId: string;
  @ApiProperty({ example: '8841436961fffff' }) targetZoneId: string;
  @ApiProperty({ example: ['8841436961fffff'], type: [String] }) targetZoneIds: string[];
  @ApiProperty({ example: 'Cầu Giấy' }) targetZoneLabel: string;
  @ApiProperty({ nullable: true, example: 0.91 }) confidence: number | null;
  @ApiProperty({ description: 'True only when simulation_details contains both before and after metrics.', example: true }) simulationAvailable: boolean;
  @ApiProperty({ type: [CandidateSourceZoneDto] }) candidateSourceZones: CandidateSourceZoneDto[];
  @ApiProperty({ type: [MoveDto] }) moves: MoveDto[];
  @ApiProperty({ example: 5 }) targetDriverCount: number;
  @ApiProperty({ example: 10 }) expectedOfferCount: number;
  @ApiProperty({ example: 18 }) eligibleDriverCount: number;
  @ApiProperty({ example: 4.2 }) averageDistanceKm: number;
  @ApiProperty({ example: 12 }) averageEtaMinutes: number;
  @ApiProperty({ example: 45 }) campaignDurationMinutes: number;
  @ApiProperty({ description: 'Relocation bonus in integer VND.', example: 50000 }) relocationBonus: number;
  @ApiProperty({ description: 'Per-trip zone bonus in integer VND.', example: 12000 }) zoneTripBonus: number;
  @ApiProperty({ example: 1.2 }) fareMultiplier: number;
  @ApiProperty({ description: 'Budget limit in integer VND.', example: 450000 }) budgetLimit: number;
  @ApiProperty({ description: 'Estimated reward cost in integer VND.', example: 250000 }) estimatedRewardCost: number;
  @ApiProperty({ description: 'Estimated revenue in integer VND.', example: 600000 }) estimatedAdditionalRevenue: number;
  @ApiProperty({ description: 'Estimated net cost in integer VND.', example: 150000 }) estimatedNetCost: number;
  @ApiProperty({ type: [PolicyCheckDto] }) policyChecks: PolicyCheckDto[];
  @ApiProperty({ type: [ProposalWarningDto] }) warnings: ProposalWarningDto[];
  @ApiProperty({ type: SimulationMetricsDto }) metricsBefore: SimulationMetricsDto;
  @ApiProperty({ type: SimulationMetricsDto }) metrics: SimulationMetricsDto;
  @ApiProperty({ example: ['Thiếu 13 xe tại Cầu Giấy.'], type: [String] }) explanation: string[];
  @ApiProperty({ example: '2026-08-09T09:15:00.000Z', format: 'date-time' }) inputFreshUntil: string;
}

export class CampaignResponseDto {
  @ApiProperty({ example: '1389e176-62a1-4333-be4c-b4b2c15018cd', format: 'uuid' }) id: string;
  @ApiProperty({ example: 'f0420000-0000-4000-a000-000000000001', format: 'uuid' }) planId: string;
  @ApiProperty({ enum: ['Draft', 'Active', 'TargetReached', 'Completed', 'Cancelled', 'BudgetExhausted'], example: 'Active' }) status: string;
  @ApiProperty({ example: 'ACTIVE' }) databaseStatus: string;
  @ApiProperty({ example: '8841436961fffff' }) targetZoneId: string;
  @ApiProperty({ example: ['8841436961fffff'], type: [String] }) targetZoneIds: string[];
  @ApiProperty({ example: 18 }) candidateCount: number;
  @ApiProperty({ example: 10 }) offersSent: number;
  @ApiProperty({ example: 8 }) viewed: number;
  @ApiProperty({ example: 5 }) accepted: number;
  @ApiProperty({ example: 2 }) declined: number;
  @ApiProperty({ example: 1 }) expired: number;
  @ApiProperty({ example: 0 }) cancelled: number;
  @ApiProperty({ example: 3 }) enRoute: number;
  @ApiProperty({ example: 2 }) arrivedVerified: number;
  @ApiProperty({ example: 2 }) unitsGained: number;
  @ApiProperty({ example: 4 }) qualifiedTrips: number;
  @ApiProperty({ description: 'Spent budget in integer VND.', example: 100000 }) incentiveBudget: number;
  @ApiProperty({ description: 'Budget limit in integer VND.', example: 450000 }) budgetLimit: number;
  @ApiProperty({ description: 'Worst-case commitment in integer VND.', example: 250000 }) worstCaseCommitment: number;
  @ApiProperty({ example: '2026-08-09T08:30:00.000Z', format: 'date-time' }) startedAt: string;
  @ApiProperty({ example: '2026-08-09T09:15:00.000Z', format: 'date-time' }) expiresAt: string;
  @ApiProperty({ enum: ['human'], example: 'human' }) responseMode: string;
  @ApiProperty({ example: 5 }) suggestedActivation: number;
}

class OperationsReportSummaryDto {
  @ApiProperty({ example: 2 }) campaigns: number;
  @ApiProperty({ example: 5 }) activatedDrivers: number;
  @ApiProperty({ example: 8 }) qualifiedTrips: number;
  @ApiProperty({ example: 250000 }) rewardQualifiedVnd: number;
  @ApiProperty({ description: 'Only SIMULATED_PAID reward ledger entries.', example: 150000 }) rewardPaidVnd: number;
  @ApiProperty({ example: 250000 }) budgetUsedVnd: number;
  @ApiProperty({ example: 450000 }) reservedVnd: number;
  @ApiProperty({ example: 250000 }) committedVnd: number;
  @ApiProperty({ example: 200000 }) qualifiedVnd: number;
  @ApiProperty({ example: 150000 }) paidVnd: number;
  @ApiProperty({ example: 50000 }) compensationDueVnd: number;
  @ApiProperty({ example: 200000 }) releasedVnd: number;
  @ApiProperty({ example: 0 }) rewardBudgetDeltaVnd: number;
  @ApiProperty({ example: 12 }) auditEvents: number;
  @ApiProperty({ nullable: true, example: null, description: 'Unavailable until an incremental revenue ledger exists.' }) netCostVnd: number | null;
}

class OperationsCampaignReportDto extends OperationsReportSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'COMPLETED' }) status: string;
  @ApiProperty({ format: 'date-time' }) startedAt: string;
  @ApiProperty({ nullable: true, format: 'date-time' }) completedAt: string | null;
  @ApiProperty({ example: 450000 }) budgetLimitVnd: number;
}

class OperationsReportSourcesDto {
  @ApiProperty() activatedDrivers: string;
  @ApiProperty() qualifiedTrips: string;
  @ApiProperty() rewardQualifiedVnd: string;
  @ApiProperty() rewardPaidVnd: string;
  @ApiProperty() budgetUsedVnd: string;
  @ApiProperty() budgetLifecycle: string;
  @ApiProperty() auditEvents: string;
  @ApiProperty({ nullable: true, example: null }) netCostVnd: string | null;
}

export class OperationsReportResponseDto {
  @ApiProperty({ format: 'date-time' }) generatedAt: string;
  @ApiProperty({ enum: ['DB_LEDGER'], example: 'DB_LEDGER' }) dataMode: string;
  @ApiProperty({ type: OperationsReportSummaryDto }) summary: OperationsReportSummaryDto;
  @ApiProperty({ type: [OperationsCampaignReportDto] }) campaigns: OperationsCampaignReportDto[];
  @ApiProperty({ type: OperationsReportSourcesDto }) sources: OperationsReportSourcesDto;
}

export class OfferViewDto {
  @ApiProperty({ example: 'f0420000-0000-4000-a000-000000000002', format: 'uuid' }) id: string;
  @ApiProperty({ example: '1389e176-62a1-4333-be4c-b4b2c15018cd', format: 'uuid' }) campaignId: string;
  @ApiProperty({ example: '05c42d43-4125-403f-a7ee-6403c887b54c', format: 'uuid' }) driverId: string;
  @ApiProperty({ example: '8841436961fffff' }) targetZoneId: string;
  @ApiProperty({ example: ['8841436961fffff'], type: [String] }) targetZoneIds: string[];
  @ApiProperty({ example: 'Điều phối tới Cầu Giấy' }) reasonText: string;
  @ApiProperty({ description: 'Offer incentive in integer VND.', example: 50000 }) incentiveAmount: number;
  @ApiProperty({ example: 4.2 }) distanceKm: number;
  @ApiProperty({ example: 12 }) etaMinutes: number;
  @ApiProperty({ example: '2026-08-09T08:45:00.000Z', format: 'date-time' }) expiresAt: string;
  @ApiProperty({ enum: ['Open', 'Accepted', 'Declined', 'Expired'], example: 'Open' }) status: string;
  @ApiProperty({ example: 'SENT' }) databaseStatus: string;
  @ApiPropertyOptional({ example: '2026-08-09T08:35:00.000Z', format: 'date-time' }) respondedAt?: string | null;
}

export class DriverSummaryResponseDto {
  @ApiProperty({ example: '05c42d43-4125-403f-a7ee-6403c887b54c', format: 'uuid' }) id: string;
  @ApiProperty({ example: 'GSM Test Driver' }) name: string;
  @ApiProperty({ enum: ['offline', 'online_idle', 'en_route', 'activated', 'on_trip'], example: 'online_idle' }) status: string;
  @ApiProperty({ example: '8841436963fffff' }) homeZoneId: string;
  @ApiProperty({ nullable: true, example: [105.79, 21.03], type: [Number] }) currentLocation: number[] | null;
  @ApiProperty({ nullable: true, example: null, format: 'uuid' }) activeCampaignId: string | null;
  @ApiProperty({ nullable: true, example: null, format: 'uuid' }) activeTripId: string | null;
  @ApiProperty({ example: 0 }) distanceKm: number;
  @ApiProperty({ example: 0 }) shiftEndsInMinutes: number;
  @ApiProperty({ example: [], type: [String] }) acceptedOfferIds: string[];
  @ApiProperty({ description: 'Qualified reward total in integer VND.', example: 100000 }) rewardTotal: number;
}

export class DriverViewResponseDto {
  @ApiProperty({ type: DriverSummaryResponseDto }) driver: DriverSummaryResponseDto;
  @ApiProperty({ type: [OfferViewDto] }) activeOffers: OfferViewDto[];
  @ApiProperty({ type: [OfferViewDto] }) acceptedOffers: OfferViewDto[];
  @ApiProperty({ type: [OfferViewDto] }) history: OfferViewDto[];
}

export class AuditEntryResponseDto {
  @ApiProperty({ example: 'audit-42' }) id: string;
  @ApiProperty({ example: 'f0420000-0000-4000-a000-000000000001' }) planId: string;
  @ApiProperty({ example: 'proposal' }) entityType: string;
  @ApiProperty({ example: 'f0420000-0000-4000-a000-000000000001' }) entityId: string;
  @ApiProperty({ example: 'Approved' }) action: string;
  @ApiProperty({ example: 'OPERATOR' }) actor: string;
  @ApiProperty({ example: 'OPERATOR' }) actorType: string;
  @ApiPropertyOptional({ example: '05c42d43-4125-403f-a7ee-6403c887b54c', format: 'uuid' }) actorId?: string | null;
  @ApiProperty({ nullable: true, example: 'request-42' }) requestId: string | null;
  @ApiProperty({ nullable: true, example: 'correlation-42' }) correlationId: string | null;
  @ApiProperty({ nullable: true, example: 2 }) entityVersion: number | null;
  @ApiProperty({ nullable: true, example: 'sha256' }) entityHash: string | null;
  @ApiProperty({ example: '2026-08-09T08:30:00.000Z', format: 'date-time' }) occurredAt: string;
  @ApiProperty({ example: 'Proposal approved after policy review.' }) detail: string;
}

export class AuditPageResponseDto {
  @ApiProperty({ type: [AuditEntryResponseDto] }) items: AuditEntryResponseDto[];
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 25 }) pageSize: number;
  @ApiProperty({ example: 142 }) total: number;
  @ApiProperty({ example: 6 }) totalPages: number;
  @ApiProperty({ example: false }) hasPreviousPage: boolean;
  @ApiProperty({ example: true }) hasNextPage: boolean;
  @ApiProperty({ nullable: true, example: 'opaque-cursor' }) nextCursor: string | null;
}

export class OperatorCapabilitiesResponseDto {
  @ApiProperty({ example: '2026-08-15T10:00:00.000Z', format: 'date-time' }) serverTime: string;
  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' }) timezone: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) capabilities: Record<string, unknown>;
}

export class DispatchMoveResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'move-1' }) sourceMoveKey: string;
  @ApiProperty({ example: 6 }) sourceZoneId: number;
  @ApiProperty({ example: 2 }) targetZoneId: number;
  @ApiProperty({ example: 5 }) plannedUnits: number;
  @ApiProperty({ example: 3 }) acknowledgedUnits: number;
  @ApiProperty({ example: 2 }) arrivedUnits: number;
  @ApiProperty({ example: 2 }) availableUnits: number;
  @ApiProperty({ example: 0 }) failedUnits: number;
  @ApiProperty({ example: 'EN_ROUTE' }) state: string;
}

export class DispatchBatchResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) proposalId: string;
  @ApiProperty({ example: 2 }) proposalVersion: number;
  @ApiProperty({ example: 'sha256' }) approvedContentHash: string;
  @ApiProperty({ example: 'IN_PROGRESS' }) status: string;
  @ApiProperty({ type: [DispatchMoveResponseDto] }) moves: DispatchMoveResponseDto[];
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) reconciliations: Record<string, unknown>[];
  @ApiProperty({ format: 'date-time' }) releasedAt: string;
}

export class ScenarioComparisonResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'sha256' }) commonInputHash: string;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) scenarios: Record<string, unknown>[];
  @ApiProperty({ type: 'object', additionalProperties: true }) forecastEvaluation: Record<string, unknown>;
  @ApiProperty({ example: false }) hasObservedRevenue: boolean;
}
