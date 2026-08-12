import { AppError, requestJson } from '@/shared/api/client'

export type DriverErrorCode =
  | 'UNAUTHENTICATED'
  | 'NOT_A_DRIVER'
  | 'OFFER_NOT_FOUND'
  | 'OFFER_NOT_PENDING'
  | 'OFFER_EXPIRED'
  | 'CAMPAIGN_TARGET_REACHED'
  | 'CAMPAIGN_NOT_ACTIVE'
  | 'ALREADY_IN_CAMPAIGN'
  | 'INVALID_LOCATION'
  | 'INTERNAL'

const driverErrorCodes = new Set<DriverErrorCode>([
  'UNAUTHENTICATED',
  'NOT_A_DRIVER',
  'OFFER_NOT_FOUND',
  'OFFER_NOT_PENDING',
  'OFFER_EXPIRED',
  'CAMPAIGN_TARGET_REACHED',
  'CAMPAIGN_NOT_ACTIVE',
  'ALREADY_IN_CAMPAIGN',
  'INVALID_LOCATION',
  'INTERNAL',
])

export class DriverApiError extends Error {
  readonly code: DriverErrorCode
  readonly status: number | undefined

  constructor(
    code: DriverErrorCode,
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'DriverApiError'
    this.code = code
    this.status = status
  }
}

function normalizedCode(code: string | undefined): DriverErrorCode {
  return code && driverErrorCodes.has(code as DriverErrorCode) ? code as DriverErrorCode : 'INTERNAL'
}

async function driverRequest<T>(path: string, parse: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
  try {
    return parse(await requestJson(path, { method: 'POST', ...(signal ? { signal } : {}) }))
  } catch (cause) {
    if (cause instanceof AppError) {
      throw new DriverApiError(normalizedCode(cause.code), cause.message, cause.status)
    }
    throw cause
  }
}

export interface NavigationTarget {
  type: 'Point'
  coordinates: [number, number]
}

export interface Participation {
  id: string
  campaign_id: string
  status: string
  [key: string]: unknown
}

export interface AcceptOfferResult {
  participation: Participation
  navigation_target: NavigationTarget
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAcceptOffer(value: unknown): AcceptOfferResult {
  if (!isRecord(value) || !isRecord(value.participation) || !isRecord(value.navigation_target)) {
    throw new DriverApiError('INTERNAL', 'Phản hồi nhận lời mời không hợp lệ.')
  }
  const coordinates = value.navigation_target.coordinates
  if (
    typeof value.participation.id !== 'string'
    || typeof value.participation.campaign_id !== 'string'
    || typeof value.participation.status !== 'string'
    || value.navigation_target.type !== 'Point'
    || !Array.isArray(coordinates)
    || coordinates.length !== 2
    || typeof coordinates[0] !== 'number'
    || typeof coordinates[1] !== 'number'
  ) {
    throw new DriverApiError('INTERNAL', 'Phản hồi nhận lời mời không hợp lệ.')
  }
  return {
    participation: {
      ...value.participation,
      id: value.participation.id,
      campaign_id: value.participation.campaign_id,
      status: value.participation.status,
    },
    navigation_target: { type: 'Point', coordinates: [coordinates[0], coordinates[1]] },
  }
}

export function acceptOffer(offerId: string, signal?: AbortSignal): Promise<AcceptOfferResult> {
  return driverRequest(`/driver/offers/${offerId}/accept`, parseAcceptOffer, signal)
}

export interface DeclineOfferResult {
  offer_id: string
  status: string
}

function parseDeclineOffer(value: unknown): DeclineOfferResult {
  if (!isRecord(value) || typeof value.offer_id !== 'string' || typeof value.status !== 'string') {
    throw new DriverApiError('INTERNAL', 'Phản hồi từ chối lời mời không hợp lệ.')
  }
  return { offer_id: value.offer_id, status: value.status }
}

export function declineOffer(offerId: string, signal?: AbortSignal): Promise<DeclineOfferResult> {
  return driverRequest(`/driver/offers/${offerId}/decline`, parseDeclineOffer, signal)
}
