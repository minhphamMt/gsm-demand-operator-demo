import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsDateString,
  MaxLength,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class RevisionMoveDto {
  @ApiPropertyOptional({ example: 'move-1' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 6, minimum: 1, maximum: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  from_zone: number;

  @ApiProperty({ example: 2, minimum: 1, maximum: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  to_zone: number;

  @ApiProperty({ example: 5, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  drivers: number;
}

class RevisionSourcePlanDto {
  @ApiProperty({ type: [RevisionMoveDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RevisionMoveDto)
  moves: RevisionMoveDto[];

  @ApiPropertyOptional({ type: [String], example: [] })
  @IsOptional()
  @IsArray()
  residual_gap?: unknown[];
}

export class SnapshotQueryDto {
  @ApiPropertyOptional({ enum: ['baseline', 'plan', 'activation'], example: 'baseline' })
  @IsOptional()
  @IsIn(['baseline', 'plan', 'activation'])
  scenario?: 'baseline' | 'plan' | 'activation';

  @ApiPropertyOptional({ example: 'RAIN_PEAK_EVENING', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  scenarioCode?: string;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  zoneId?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class SnapshotWindowQueryDto extends SnapshotQueryDto {
  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class OffersQueryDto {
  @ApiPropertyOptional({ example: '1389e176-62a1-4333-be4c-b4b2c15018cd', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;
}

export class OperationsReportQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-10T23:59:59.999Z', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AuditQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 25, minimum: 1, maximum: 100, default: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @ApiPropertyOptional({ format: 'uuid', description: 'Matches entity_id or metadata proposal_id/campaign_id.' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ enum: ['proposal', 'campaign', 'offer', 'driver', 'trip', 'reward'] })
  @IsOptional()
  @IsIn(['proposal', 'campaign', 'offer', 'driver', 'trip', 'reward'])
  entityType?: string;

  @ApiPropertyOptional({ example: 'Approved', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ example: 'OPERATOR', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  actorType?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-10T00:00:00.000Z', format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ReviseProposalDto {
  @ApiProperty({
    example: {
      moves: [{ id: 'move-1', from_zone: 6, to_zone: 2, drivers: 5 }],
      residual_gap: [],
    },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => RevisionSourcePlanDto)
  sourcePlan: RevisionSourcePlanDto;

  @ApiProperty({ example: 5, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetDriverCount: number;

  @ApiProperty({ example: 45, minimum: 5, maximum: 240 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(240)
  campaignDurationMinutes: number;

  @ApiProperty({ description: 'Relocation bonus in integer VND.', example: 50000, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bonusAmount: number;

  @ApiProperty({ description: 'Per-trip zone bonus in integer VND.', example: 12000, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  zoneTripBonus: number;

  @ApiProperty({ example: 1.2, minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  fareMultiplier: number;

  @ApiProperty({ description: 'Maximum campaign budget in integer VND.', example: 450000, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetLimit: number;

  @ApiPropertyOptional({ example: 'Giảm số xe từ vùng nguồn có supply thấp.' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ApproveProposalDto {
  @ApiPropertyOptional({ example: 'Đã kiểm tra policy và ngân sách.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RejectProposalDto {
  @ApiProperty({ enum: ['budget', 'source-risk', 'low-impact', 'stale-data', 'other'], example: 'budget' })
  @IsString()
  @IsIn(['budget', 'source-risk', 'low-impact', 'stale-data', 'other'])
  reasonCode: 'budget' | 'source-risk' | 'low-impact' | 'stale-data' | 'other';

  @ApiProperty({ example: 'Ngân sách chưa tương xứng với tác động dự kiến.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note: string;
}

export class ActivateProposalDto {
  @ApiPropertyOptional({ enum: ['human', 'simulated', 'mixed'], example: 'human', default: 'mixed' })
  @IsOptional()
  @IsIn(['human', 'simulated', 'mixed'])
  responseMode: 'human' | 'simulated' | 'mixed' = 'mixed';

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    example: ['05c42d43-4125-403f-a7ee-6403c887b54c'],
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (Array.isArray(value) ? value : []))
  @IsUUID('4', { each: true })
  driverIds?: string[];
}

export class DriverStatusDto {
  @ApiProperty({ enum: ['offline', 'online_idle'], example: 'online_idle' })
  @IsIn(['offline', 'online_idle'])
  status: 'offline' | 'online_idle';
}

export class OfferResponseDto {
  @ApiProperty({ enum: ['Accepted', 'Declined'], example: 'Accepted' })
  @IsIn(['Accepted', 'Declined'])
  response: 'Accepted' | 'Declined';
}
