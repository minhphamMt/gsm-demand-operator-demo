import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { PostgrestError } from '@supabase/supabase-js'

import { releaseTerminalDriverState } from '../common/driver-state-reconciliation'
import { SupabaseService } from '../supabase/supabase.service'
import type {
  AcceptDriverOfferResponseDto,
  DeclineDriverOfferResponseDto,
  DriverParticipationDto,
  NavigationTargetDto,
  ResetDriverDemoOfferResponseDto,
} from './dto/driver-response.dto'

type OfferRow = {
  campaign_id: string
  expires_at: string | null
  id: string
  status: string
}

const pendingStatuses = new Set(['SENT', 'VIEWED'])

@Injectable()
export class DriverService {
  constructor(
    private readonly db: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async acceptOffer(
    offerId: string,
    driverId: string,
    requestId: string,
  ): Promise<AcceptDriverOfferResponseDto> {
    const offer = await this.requirePendingOffer(offerId, driverId)
    await this.respond(offerId, driverId, 'ACCEPTED', requestId)

    const [participationResult, campaignResult] = await Promise.all([
      this.db.client
        .from('campaign_participations')
        .select('id,campaign_id,status,accepted_at,slot_deadline_at,arrival_deadline_at')
        .eq('offer_id', offerId)
        .eq('driver_id', driverId)
        .maybeSingle(),
      this.db.client
        .from('campaigns_driver_v')
        .select('navigation_target_geojson')
        .eq('id', offer.campaign_id)
        .maybeSingle(),
    ])

    const participation = this.db.unwrap(
      participationResult.data as DriverParticipationDto | null,
      participationResult.error,
    )
    if (campaignResult.error) this.db.unwrap(null, campaignResult.error)
    const navigationTarget = this.navigationTarget(campaignResult.data?.navigation_target_geojson)

    return { participation, navigation_target: navigationTarget }
  }

  async declineOffer(
    offerId: string,
    driverId: string,
    requestId: string,
  ): Promise<DeclineDriverOfferResponseDto> {
    await this.requirePendingOffer(offerId, driverId)
    await this.respond(offerId, driverId, 'DECLINED', requestId)
    return { offer_id: offerId, status: 'DECLINED' }
  }

  async resetDemoOffer(driverId: string, requestId: string): Promise<ResetDriverDemoOfferResponseDto> {
    if (this.config.get<string>('DEMO_MODE') !== 'true') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Demo endpoint is disabled' })
    }
    const { data, error } = await this.db.client.rpc('reset_driver_demo_offer', {
      p_driver_id: driverId,
      p_request_id: requestId,
    })
    if (error) {
      if (/active campaign/i.test(error.message)) {
        throw new ConflictException({ code: 'CAMPAIGN_NOT_ACTIVE', message: error.message })
      }
      this.db.unwrap(null, error)
    }
    if (
      typeof data !== 'object'
      || data === null
      || Array.isArray(data)
      || typeof data.offer_id !== 'string'
      || typeof data.campaign_id !== 'string'
      || data.status !== 'SENT'
    ) {
      throw new UnprocessableEntityException({ code: 'INTERNAL', message: 'Invalid demo reset response' })
    }
    return { offer_id: data.offer_id, campaign_id: data.campaign_id, status: 'SENT' }
  }

  private async requirePendingOffer(offerId: string, driverId: string): Promise<OfferRow> {
    const { data, error } = await this.db.client
      .from('driver_offers')
      .select('id,campaign_id,status,expires_at')
      .eq('id', offerId)
      .eq('driver_id', driverId)
      .maybeSingle()
    if (error) this.db.unwrap(null, error)
    if (!data) {
      throw new NotFoundException({ code: 'OFFER_NOT_FOUND', message: 'Offer not found' })
    }
    const offer = data as OfferRow
    if (!pendingStatuses.has(offer.status)) {
      throw new ConflictException({ code: 'OFFER_NOT_PENDING', message: 'Offer is not pending' })
    }
    if (!offer.expires_at || new Date(offer.expires_at).getTime() <= Date.now()) {
      throw new ConflictException({ code: 'OFFER_EXPIRED', message: 'Offer has expired' })
    }
    return offer
  }

  private async respond(
    offerId: string,
    driverId: string,
    response: 'ACCEPTED' | 'DECLINED',
    requestId: string,
  ) {
    const params = {
      p_offer_id: offerId,
      p_driver_id: driverId,
      p_response: response,
      p_actor_type: 'DRIVER',
      p_request_id: requestId,
    }
    const { error } = await this.db.client.rpc('respond_to_offer', params)
    if (!error) return
    if (response === 'ACCEPTED' && error.code === '23505'
      && await releaseTerminalDriverState(this.db, driverId)) {
      const retry = await this.db.client.rpc('respond_to_offer', params)
      if (!retry.error) return
      this.throwDriverError(retry.error)
    }
    this.throwDriverError(error)
  }

  private throwDriverError(error: PostgrestError): never {
    if (error.code === 'P0002') {
      throw new NotFoundException({ code: 'OFFER_NOT_FOUND', message: error.message })
    }
    if (error.code === '23505') {
      throw new ConflictException({ code: 'ALREADY_IN_CAMPAIGN', message: error.message })
    }
    if (/target.*full/i.test(error.message)) {
      throw new ConflictException({ code: 'CAMPAIGN_TARGET_REACHED', message: error.message })
    }
    if (/campaign.*not active/i.test(error.message)) {
      throw new ConflictException({ code: 'CAMPAIGN_NOT_ACTIVE', message: error.message })
    }
    if (/expired|closed/i.test(error.message)) {
      throw new ConflictException({ code: 'OFFER_NOT_PENDING', message: error.message })
    }
    if (error.code === '23514' || error.code === '22023') {
      throw new UnprocessableEntityException({ code: 'OFFER_NOT_PENDING', message: error.message })
    }
    return this.db.unwrap<never>(null, error)
  }

  private navigationTarget(value: unknown): NavigationTargetDto {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new UnprocessableEntityException({ code: 'INVALID_LOCATION', message: 'Campaign destination is missing' })
    }
    const point = value as Record<string, unknown>
    const coordinates = point.coordinates
    if (
      point.type !== 'Point'
      || !Array.isArray(coordinates)
      || coordinates.length !== 2
      || typeof coordinates[0] !== 'number'
      || typeof coordinates[1] !== 'number'
    ) {
      throw new UnprocessableEntityException({ code: 'INVALID_LOCATION', message: 'Campaign destination is invalid' })
    }
    return { type: 'Point', coordinates: [coordinates[0], coordinates[1]] }
  }
}
