import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GenerateAiDecisionDto {
  @Transform(({ value }) => Number(value))
  @IsIn([5, 10, 15])
  horizonMinutes: 5 | 10 | 15 = 10;
}

export class OptimizeAiDecisionDto {
  @Transform(({ value }) => Number(value))
  @IsIn([5, 10, 15])
  horizonMinutes: 5 | 10 | 15 = 10;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  snapshotId!: number;
}

export class RunNextAiDecisionDto extends GenerateAiDecisionDto {
  @IsOptional()
  @IsIn(['normal', 'peak', 'rain', 'rain_peak'])
  regime?: 'normal' | 'peak' | 'rain' | 'rain_peak';
}

export class RunReplayAiDecisionDto {
  @IsDateString()
  sourceAt!: string;

  // Cửa sổ nhìn lại cho biểu đồ xu hướng. Bỏ trống = giữ mặc định 60 phút của AI service.
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(5)
  @Max(1440)
  lookbackMinutes?: number;
}

export class RunPipelineDto {
  @Transform(({ value }) => Number(value))
  @IsIn([5, 10, 15])
  horizonMinutes: 5 | 10 | 15 = 10;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  snapshotId?: number;
}
