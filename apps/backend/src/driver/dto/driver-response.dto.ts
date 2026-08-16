import { ApiProperty } from '@nestjs/swagger'

export class DriverParticipationDto {
  @ApiProperty({ format: 'uuid' }) id: string
  @ApiProperty({ format: 'uuid' }) campaign_id: string
  @ApiProperty({ example: 'ACCEPTED' }) status: string
  @ApiProperty({ format: 'date-time', nullable: true }) accepted_at: string | null
  @ApiProperty({ format: 'date-time', nullable: true }) slot_deadline_at: string | null
  @ApiProperty({ format: 'date-time', nullable: true }) arrival_deadline_at: string | null
}

export class NavigationTargetDto {
  @ApiProperty({ example: 'Point' }) type: 'Point'
  @ApiProperty({ example: [105.8048, 21.0285], type: [Number] }) coordinates: [number, number]
}

export class AcceptDriverOfferResponseDto {
  @ApiProperty({ type: DriverParticipationDto }) participation: DriverParticipationDto
  @ApiProperty({ type: NavigationTargetDto }) navigation_target: NavigationTargetDto
}

export class DeclineDriverOfferResponseDto {
  @ApiProperty({ format: 'uuid' }) offer_id: string
  @ApiProperty({ example: 'DECLINED' }) status: string
}

export class ResetDriverDemoOfferResponseDto {
  @ApiProperty({ format: 'uuid' }) offer_id: string
  @ApiProperty({ format: 'uuid' }) campaign_id: string
  @ApiProperty({ example: 'SENT' }) status: string
}
