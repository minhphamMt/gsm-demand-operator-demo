import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export class GenerateAiDecisionDto {
  @Transform(({ value }) => Number(value))
  @IsIn([15, 30])
  horizonMinutes: 15 | 30 = 15;
}

export class RunNextAiDecisionDto extends GenerateAiDecisionDto {
  @IsOptional()
  @IsIn(['normal', 'peak', 'rain', 'rain_peak'])
  regime?: 'normal' | 'peak' | 'rain' | 'rain_peak';
}
